const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'vendas.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            descricao TEXT,
            imagem TEXT,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS planos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            produto_id INTEGER NOT NULL,
            nome TEXT NOT NULL,
            quantidade INTEGER NOT NULL,
            preco DECIMAL(10,2) NOT NULL,
            link_checkout TEXT UNIQUE,
            banner TEXT,
            ativo BOOLEAN DEFAULT 1,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (produto_id) REFERENCES produtos(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS vendas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plano_id INTEGER NOT NULL,
            cliente_nome TEXT,
            cliente_email TEXT,
            cliente_telefone TEXT,
            cliente_cep TEXT,
            cliente_rua TEXT,
            cliente_numero TEXT,
            cliente_complemento TEXT,
            cliente_bairro TEXT,
            cliente_cidade TEXT,
            cliente_estado TEXT,
            valor DECIMAL(10,2) NOT NULL,
            status TEXT DEFAULT 'pendente',
            pix_qrcode TEXT,
            pix_codigo TEXT,
            pix_txid TEXT,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            pago_em DATETIME,
            FOREIGN KEY (plano_id) REFERENCES planos(id)
        )
    `);

    console.log('Banco de dados criado com sucesso!');
});

module.exports = db;