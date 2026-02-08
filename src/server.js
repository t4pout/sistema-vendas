require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ✅ USAR CONEXÃO ÚNICA DO MÓDULO database/db.js
const db = require('./database/db');

app.set('BASE_URL', BASE_URL);

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rotas de páginas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/produtos', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'produtos.html'));
});

app.get('/checkout/:link', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'checkout.html'));
});

// Rotas da API
const produtosRoutes = require('./routes/produtos');
const vendasRoutes = require('./routes/vendas');

app.use('/api/produtos', produtosRoutes);
app.use('/api/vendas', vendasRoutes);

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log('=========================');
    console.log('🚀 Servidor rodando em: ' + BASE_URL);
    console.log('📊 Dashboard: ' + BASE_URL);
    console.log('📦 Produtos: ' + BASE_URL + '/produtos');
    console.log('=========================');
});

module.exports = db;
