import pg from "pg";
import fs from "node:fs";
const {Pool}=pg;
export const pool=new Pool({connectionString:process.env.DATABASE_URL});
export async function initDb(){
  const sql=fs.readFileSync(new URL("../schema.sql",import.meta.url),"utf8");
  await pool.query(sql);
}
export async function q(text,params=[]){return pool.query(text,params)}