// A conexão agora é criada no server.js
// Este arquivo só exporta para compatibilidade
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, 'vendas.db');
const db = new sqlite3.Database(dbPath);

module.exports = db;