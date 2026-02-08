require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const dbPath = path.join(__dirname, 'database', 'vendas.db');
const db = new sqlite3.Database(dbPath);

// CRIAR TABELAS ANTES DE INICIAR O SERVIDOR
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        descricao TEXT,
        imagem TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('Erro ao criar produtos:', err);
        else console.log('Tabela produtos OK');
    });

    db.run(`CREATE TABLE IF NOT EXISTS planos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        quantidade INTEGER NOT NULL,
        preco DECIMAL(10,2) NOT NULL,
        link_checkout TEXT UNIQUE,
        banner TEXT,
        pixel_id TEXT,
        pixel_access_token TEXT,
        ativo BOOLEAN DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
    )`, (err) => {
        if (err) console.error('Erro ao criar planos:', err);
        else console.log('Tabela planos OK');
    });

    db.run(`CREATE TABLE IF NOT EXISTS vendas (
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
    )`, (err) => {
        if (err) console.error('Erro ao criar vendas:', err);
        else console.log('Tabela vendas OK');
    });
});

app.set('BASE_URL', BASE_URL);

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/produtos', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'produtos.html'));
});

app.get('/checkout/:link', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'checkout.html'));
});

const produtosRoutes = require('./routes/produtos');
const vendasRoutes = require('./routes/vendas');

app.use('/api/produtos', produtosRoutes);
app.use('/api/vendas', vendasRoutes);

app.listen(PORT, '0.0.0.0', () => {
    console.log('=========================');
    console.log('Servidor: ' + BASE_URL);
    console.log('Dashboard: ' + BASE_URL);
    console.log('Produtos: ' + BASE_URL + '/produtos');
    console.log('=========================');
});

module.exports = db;