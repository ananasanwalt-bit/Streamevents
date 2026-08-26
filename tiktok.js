import crypto from "node:crypto";
import {q} from "./db.js";

export function tiktokConfigured(){
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && process.env.TIKTOK_REDIRECT_URI);
}
export function beginTikTok(req,res){
  if(!tiktokConfigured()) return res.status(503).send("TikTok ist noch nicht konfiguriert. Trage TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET und TIKTOK_REDIRECT_URI in .env ein.");
  const state=crypto.randomBytes(32).toString("hex");
  res.cookie("tt_state",state,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:600000});
  const params=new URLSearchParams({
    client_key:process.env.TIKTOK_CLIENT_KEY,response_type:"code",
    scope:process.env.TIKTOK_SCOPES||"user.info.basic",
    redirect_uri:process.env.TIKTOK_REDIRECT_URI,state
  });
  res.redirect("https://www.tiktok.com/v2/auth/authorize/?"+params);
}
export async function callbackTikTok(req,res){
  if(req.query.error) return res.redirect("/?error="+encodeURIComponent(req.query.error_description||req.query.error));
  if(!req.query.code || req.query.state!==req.cookies.tt_state) return res.status(400).send("Ungültiger OAuth-State oder Code.");
  const body=new URLSearchParams({
    client_key:process.env.TIKTOK_CLIENT_KEY,client_secret:process.env.TIKTOK_CLIENT_SECRET,
    code:req.query.code,grant_type:"authorization_code",redirect_uri:process.env.TIKTOK_REDIRECT_URI
  });
  const r=await fetch("https://open.tiktokapis.com/v2/oauth/token/",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  const token=await r.json();
  if(!r.ok || token.error) return res.status(502).json({error:"TikTok token exchange failed",details:token});
  const user=await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",{headers:{Authorization:`Bearer ${token.access_token}`}});
  const data=await user.json();
  if(!user.ok || data.error) return res.status(502).json({error:"TikTok user info failed",details:data});
  const u=req.user;
  const expires=new Date(Date.now()+(token.expires_in||86400)*1000);
  await q(`INSERT INTO tiktok_accounts(user_id,open_id,display_name,avatar_url,access_token,refresh_token,expires_at,scopes)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(user_id,open_id) DO UPDATE SET display_name=EXCLUDED.display_name,avatar_url=EXCLUDED.avatar_url,access_token=EXCLUDED.access_token,refresh_token=EXCLUDED.refresh_token,expires_at=EXCLUDED.expires_at,scopes=EXCLUDED.scopes`,
    [u.sub,data.data.user.open_id,data.data.user.display_name,data.data.user.avatar_url,token.access_token,token.refresh_token,expires,token.scope]);
  res.redirect("/?tiktok=connected");
}