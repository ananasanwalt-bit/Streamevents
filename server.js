import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import {initDb,q} from "./db.js";
import {hashPassword,verifyPassword,signUser,auth} from "./auth.js";
import {beginTikTok,callbackTikTok} from "./tiktok.js";

const app=express(); app.use(express.json({limit:"1mb"})); app.use(cookieParser()); app.use(express.static("public"));
const port=process.env.PORT||3000;
const sockets=new Map();

function session(res,user){res.cookie("session",signUser(user),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*864e5});}
app.get("/api/health",(req,res)=>res.json({ok:true}));
app.post("/api/auth/register",async(req,res)=>{
  const email=String(req.body.email||"").trim().toLowerCase(), pass=String(req.body.password||"");
  if(!email || pass.length<8)return res.status(400).json({error:"E-Mail und mindestens 8 Zeichen Passwort erforderlich."});
  try{const r=await q("INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email",[email,await hashPassword(pass)]);session(res,r.rows[0]);res.json({user:r.rows[0]})}
  catch(e){if(e.code==="23505")return res.status(409).json({error:"E-Mail existiert bereits."});res.status(500).json({error:"Registrierung fehlgeschlagen"})}
});
app.post("/api/auth/login",async(req,res)=>{
  const email=String(req.body.email||"").trim().toLowerCase(),pass=String(req.body.password||"");
  const r=await q("SELECT id,email,password_hash FROM users WHERE email=$1",[email]);
  if(!r.rows[0]||!(await verifyPassword(pass,r.rows[0].password_hash)))return res.status(401).json({error:"Login-Daten falsch."});
  session(res,r.rows[0]);res.json({user:{id:r.rows[0].id,email:r.rows[0].email}});
});
app.post("/api/auth/logout",(req,res)=>{res.clearCookie("session");res.json({ok:true})});
app.get("/api/me",auth,async(req,res)=>{
  const r=await q("SELECT id,email,created_at FROM users WHERE id=$1",[req.user.sub]);
  const tt=await q("SELECT id,display_name,avatar_url,scopes,expires_at FROM tiktok_accounts WHERE user_id=$1 ORDER BY id DESC LIMIT 1",[req.user.sub]);
  res.json({user:r.rows[0],tiktok:tt.rows[0]||null});
});

app.get("/auth/tiktok",auth,beginTikTok);
app.get("/auth/tiktok/callback",auth,callbackTikTok);

app.get("/api/rules",auth,async(req,res)=>{const r=await q("SELECT * FROM event_rules WHERE user_id=$1 ORDER BY id DESC",[req.user.sub]);res.json(r.rows)});
app.post("/api/rules",auth,async(req,res)=>{
  const {event_type,value,action,enabled=true}=req.body;
  const r=await q("INSERT INTO event_rules(user_id,event_type,value,action,enabled) VALUES($1,$2,$3,$4,$5) RETURNING *",[req.user.sub,event_type,value,action,enabled]);res.json(r.rows[0]);
});
app.delete("/api/rules/:id",auth,async(req,res)=>{await q("DELETE FROM event_rules WHERE id=$1 AND user_id=$2",[req.params.id,req.user.sub]);res.json({ok:true})});

app.post("/api/webhooks/tiktok",async(req,res)=>{
  // Acknowledge immediately as required by TikTok. Processing is kept short and idempotent.
  const p=req.body||{}, eventKey=String(p.event_id||p.id||crypto.createHash("sha256").update(JSON.stringify(p)).digest("hex"));
  try{
    await q("INSERT INTO webhook_events(event_key,event_type,user_openid,payload) VALUES($1,$2,$3,$4) ON CONFLICT(event_key) DO NOTHING",[eventKey,p.event||"unknown",p.user_openid||null,p]);
    broadcast({type:"tiktok_event",event:p.event||"unknown",payload:p});
  }catch(e){console.error("webhook",e)}
  res.sendStatus(200);
});

app.get("/game",auth,(req,res)=>res.sendFile(process.cwd()+"/public/game.html"));
app.get("/api/game-token",auth,(req,res)=>res.json({token:signUser({id:req.user.sub,email:req.user.email})}));

const server=app.listen(port,async()=>{await initDb();console.log(`StreamEvents on http://localhost:${port}`)});
const {WebSocketServer}=await import("ws");
const wss=new WebSocketServer({server,path:"/ws/game"});
wss.on("connection",(ws,req)=>{
  const url=new URL(req.url,"http://localhost"); const token=url.searchParams.get("token");
  try{
    const jwt=(await import("jsonwebtoken")).default.verify(token,process.env.JWT_SECRET);
    const uid=String(jwt.sub); if(!sockets.has(uid))sockets.set(uid,new Set()); sockets.get(uid).add(ws);
    ws.send(JSON.stringify({type:"connected",message:"Game Bridge verbunden"}));
    ws.on("close",()=>sockets.get(uid)?.delete(ws));
  }catch{ws.close(1008,"invalid token")}
});
function broadcast(msg){
  // Demo broadcast: route to all connected game clients. Production can route by account/user id from webhook.
  for(const set of sockets.values())for(const ws of set)if(ws.readyState===1)ws.send(JSON.stringify(msg));
}