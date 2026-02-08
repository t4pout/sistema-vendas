const express = require('express');
const router = express.Router();
const db = require('../database/db');
const crypto = require('crypto');

// Listar todos os produtos com seus planos
router.get('/', (req, res) => {
    const sql = `
        SELECT p.*, 
               GROUP_CONCAT(
                   json_object(
                       'id', pl.id,
                       'nome', pl.nome,
                       'quantidade', pl.quantidade,
                       'preco', pl.preco,
                       'link_checkout', pl.link_checkout,
                       'banner', pl.banner,
                       'ativo', pl.ativo
                   )
               ) as planos
        FROM produtos p
        LEFT JOIN planos pl ON p.id = pl.produto_id
        GROUP BY p.id
        ORDER BY p.criado_em DESC
    `;
    
    db.all(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const produtos = rows.map(row => ({
            ...row,
            planos: row.planos ? JSON.parse('[' + row.planos + ']') : []
        }));
        
        res.json(produtos);
    });
});

// Criar produto
router.post('/', (req, res) => {
    const { nome, descricao, imagem } = req.body;
    
    db.run(
        'INSERT INTO produtos (nome, descricao, imagem) VALUES (?, ?, ?)',
        [nome, descricao, imagem],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, nome, descricao, imagem });
        }
    );
});

// Criar plano para um produto
router.post('/:produtoId/planos', (req, res) => {
    const { produtoId } = req.params;
    const { nome, quantidade, preco, banner } = req.body;
    
    const linkCheckout = crypto.randomBytes(16).toString('hex');
    
    db.run(
        'INSERT INTO planos (produto_id, nome, quantidade, preco, link_checkout, banner) VALUES (?, ?, ?, ?, ?, ?)',
        [produtoId, nome, quantidade, preco, linkCheckout, banner],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            res.json({ 
                id: this.lastID, 
                produto_id: produtoId,
                nome, 
                quantidade, 
                preco,
                banner,
                link_checkout: linkCheckout,
                url_checkout: 'http://localhost:3000/checkout/' + linkCheckout
            });
        }
    );
});

// Buscar plano por link de checkout
router.get('/checkout/:link', (req, res) => {
    const { link } = req.params;
    
    const sql = `
        SELECT pl.*, p.nome as produto_nome, p.descricao, p.imagem
        FROM planos pl
        JOIN produtos p ON pl.produto_id = p.id
        WHERE pl.link_checkout = ? AND pl.ativo = 1
    `;
    
    db.get(sql, [link], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Plano nao encontrado' });
        
        res.json(row);
    });
});

module.exports = router;