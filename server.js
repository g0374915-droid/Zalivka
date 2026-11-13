// Сервер комнат для игры «Заливка». Только передаёт сообщения между игроками.
const http=require('http');
const {WebSocketServer}=require('ws');
const PORT=process.env.PORT||8080;
const srv=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/plain'});r.end('zalivka relay ok, peers: '+peers.size)});
const wss=new WebSocketServer({server:srv,maxPayload:1<<20});
const peers=new Map();            // id -> ws
const links=new Map();            // cid -> [idA, idB]
const put=(ws,o)=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify(o))};
function drop(id){
  for(const [cid,[a,b]] of links){
    if(a===id||b===id){links.delete(cid);put(peers.get(a===id?b:a),{op:'close',cid})}
  }
}
wss.on('connection',ws=>{
  ws.alive=true;ws.id=null;
  ws.on('pong',()=>ws.alive=true);
  ws.on('message',raw=>{
    ws.alive=true;
    let m;try{m=JSON.parse(raw)}catch(e){return}
    if(!m||typeof m!=='object')return;
    if(m.op==='reg'){
      const id=String(m.id||'').slice(0,40);
      if(!id||ws.id||peers.has(id))return put(ws,{op:'reg',ok:false});
      ws.id=id;peers.set(id,ws);put(ws,{op:'reg',ok:true});
    }else if(!ws.id)return;
    else if(m.op==='conn'){
      const t=peers.get(String(m.to));
      if(!t||t===ws||links.size>5000)return put(ws,{op:'connok',cid:m.cid,ok:false});
      links.set(m.cid,[ws.id,t.id]);
      put(t,{op:'conn',from:ws.id,cid:m.cid});put(ws,{op:'connok',cid:m.cid,ok:true});
    }else if(m.op==='data'||m.op==='close'){
      const l=links.get(m.cid);if(!l||(l[0]!==ws.id&&l[1]!==ws.id))return;
      const to=peers.get(l[0]===ws.id?l[1]:l[0]);
      if(m.op==='close')links.delete(m.cid);
      put(to,{op:m.op,cid:m.cid,d:m.d});
    }
  });
  ws.on('close',()=>{if(ws.id&&peers.get(ws.id)===ws){peers.delete(ws.id);drop(ws.id)}});
  ws.on('error',()=>{});
});
setInterval(()=>{for(const ws of wss.clients){if(!ws.alive)return ws.terminate();ws.alive=false;try{ws.ping()}catch(e){}}},20000);
srv.listen(PORT,()=>console.log('relay on',PORT));
