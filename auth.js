import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
const secret=()=>process.env.JWT_SECRET;
export async function hashPassword(p){return bcrypt.hash(p,12)}
export async function verifyPassword(p,h){return bcrypt.compare(p,h)}
export function signUser(user){return jwt.sign({sub:user.id,email:user.email},secret(),{expiresIn:"7d"})}
export function auth(req,res,next){
  try{
    const token=req.cookies?.session;
    if(!token) return res.status(401).json({error:"Nicht eingeloggt"});
    req.user=jwt.verify(token,secret()); next();
  }catch{return res.status(401).json({error:"Session abgelaufen"})}
}