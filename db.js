const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function initDb() {
  const sql = fs.readFileSync(
    path.join(__dirname, "schema.sql"),
    "utf8"
  );

  await pool.query(sql);
  console.log("Datenbank erfolgreich initialisiert.");
}

async function q(text, params = []) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  initDb,
  q
};
