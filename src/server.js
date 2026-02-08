require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Disponibilizar BASE_URL para as rotas
app.set('BASE_URL', BASE_URL);

// Rotas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/produtos', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'produtos.html'));
});

app.get('/checkout/:link', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'checkout.html'));
});

// API Routes
const produtosRoutes = require('./routes/produtos');
const vendasRoutes = require('./routes/vendas');

app.use('/api/produtos', produtosRoutes);
app.use('/api/vendas', vendasRoutes);

// Inicializar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log('Servidor rodando em ' + BASE_URL);
    console.log('Dashboard: ' + BASE_URL);
    console.log('Produtos: ' + BASE_URL + '/produtos');
});