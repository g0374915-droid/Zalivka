// PeerJS signaling server + мировая таблица лидеров для игры "Заливка" on Render.
// Также отдаёт саму игру (index.html) по главному адресу сервера.

const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Pool } = require('pg');
const { ExpressPeerServer } = require('peer');

const app = express();
const httpServer = http.createServer(app);
const PORT = Number(process.env.PORT || 8080);

app.use(cors());
app.use(express.json({ limit: '10kb' }));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'), err => {
    if (err) res.status(200).type('text/plain').send('zalivka peer server ok');
  });
});

/* ---------- Таблица лидеров (PostgreSQL, переменная DATABASE_URL) ---------- */
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

if (pool) {
  pool.query(`CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    wins INT NOT NULL DEFAULT 0,
    level INT NOT NULL DEFAULT 0,
    best REAL NOT NULL DEFAULT 0,
    skin INT NOT NULL DEFAULT 0,
    games INT NOT NULL DEFAULT 0,
    kills INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
  )`).then(() => console.log('[lb] table ready')).catch(e => console.error('[lb] init error', e));
} else {
  console.log('[lb] DATABASE_URL не задан: таблица лидеров отключена');
}

app.get('/api/leaderboard', async (_req, res) => {
  if (!pool) return res.sendStatus(503);
  try {
    const r = await pool.query(
      `SELECT id, name AS n, wins AS w, level AS l, best AS b, skin AS s
       FROM players ORDER BY wins DESC, level DESC, best DESC LIMIT 100`);
    res.json(r.rows);
  } catch (e) { console.error('[lb] get', e); res.sendStatus(500); }
});

app.post('/api/leaderboard', async (req, res) => {
  if (!pool) return res.sendStatus(503);
  try {
    const id = String(req.body.id || '').slice(0, 64);
    if (!id) return res.sendStatus(400);
    const name = String(req.body.name || 'Игрок').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Игрок';
    const n = (v, max) => Math.min(max, Math.max(0, Number(v) || 0));
    const w = Math.floor(n(req.body.w, 1e6)), l = Math.floor(n(req.body.l, 1000)),
      b = n(req.body.b, 100), s = Math.floor(n(req.body.s, 1000)),
      g = Math.floor(n(req.body.g, 1e7)), k = Math.floor(n(req.body.k, 1e7));
    await pool.query(
      `INSERT INTO players(id,name,wins,level,best,skin,games,kills) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET name=$2, wins=GREATEST(players.wins,$3),
       level=GREATEST(players.level,$4), best=GREATEST(players.best,$5), skin=$6,
       games=GREATEST(players.games,$7), kills=GREATEST(players.kills,$8), updated_at=NOW()`,
      [id, name, w, l, b, s, g, k]);
    res.sendStatus(200);
  } catch (e) { console.error('[lb] post', e); res.sendStatus(500); }
});

/* ---------- PeerJS (мультиплеер) ---------- */
const peerServer = ExpressPeerServer(httpServer, {
  path: '/',
  proxied: true,
  allow_discovery: false,
  alive_timeout: 60000,
  expire_timeout: 5000,
});
peerServer.on('connection', client => {
  console.log('[peer] connected:', client.getId());
});
peerServer.on('disconnect', client => {
  console.log('[peer] disconnected:', client.getId());
});
app.use('/peerjs', peerServer);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[peer] signaling server listening on port ${PORT} at /peerjs`);
});
