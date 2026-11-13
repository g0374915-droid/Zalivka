// PeerJS signaling server for the game "Заливка" on Render.
const express = require('express');
const http = require('http');
const { ExpressPeerServer } = require('peer');

const app = express();
const httpServer = http.createServer(app);
const PORT = Number(process.env.PORT || 8080);

app.get('/', (_req, res) => {
  res.status(200).type('text/plain').send('zalivka peer server ok');
});

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
