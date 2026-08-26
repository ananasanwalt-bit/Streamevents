import express from 'express'; import http from 'http'; import {WebSocketServer} from 'ws';
const app=express(), server=http.createServer(app), port=process.env.PORT||10000;
app.use(express.json()); app.use(express.static('public')); app.get('/health',(q,s)=>s.json({ok:true})); app.get('/api/game-token',(q,s)=>s.json({token:'demo'}));
const wss=new WebSocketServer({server,path:'/ws/game'}); wss.on('connection',ws=>ws.send(JSON.stringify({type:'connected'})));
server.listen(port,()=>console.log('StreamEvents on '+port));