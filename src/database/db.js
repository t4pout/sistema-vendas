const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'vendas.db');

// Apenas conecta ao banco existente, NÃO recria as tabelas
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco:', err);
    } else {
        console.log('✓ Conectado ao banco de dados');
    }
});

module.exports = db;