const express = require('express');
const router = express.Router();
const db = require('../database/db');
const crypto = require('crypto');

router.get('/', (req, res) => {
    console.log('=== INICIO GET /api/produtos ===');
    
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
                       'pixel_id', pl.pixel_id,
                       'pixel_access_token', pl.pixel_access_token,
                       'ativo', pl.ativo
                   )
               ) as planos
        FROM produtos p
        LEFT JOIN planos pl ON p.id = pl.produto_id
        GROUP BY p.id
        ORDER BY p.criado_em DESC
    `;
    
    db.all(sql, (err, rows) => {
        if (err) {
            console.error('Erro SQL:', err);
            return res.status(500).json({ error: err.message });
        }
        
        console.log('Linhas retornadas:', rows);
        
        const produtos = rows.map(row => ({
            ...row,
            planos: row.planos ? JSON.parse('[' + row.planos + ']') : []
        }));
        
        console.log('Produtos processados:', produtos);
        console.log('=== FIM GET /api/produtos ===');
        
        res.json(produtos);
    });
});

router.post('/', (req, res) => {
    const { nome, descricao, imagem } = req.body;
    
    console.log('Criando produto:', { nome, descricao, imagem });
    
    db.run(
        'INSERT INTO produtos (nome, descricao, imagem) VALUES (?, ?, ?)',
        [nome, descricao, imagem],
        function(err) {
            if (err) {
                console.error('Erro ao criar produto:', err);
                return res.status(500).json({ error: err.message });
            }
            console.log('Produto criado com ID:', this.lastID);
            res.json({ id: this.lastID, nome, descricao, imagem });
        }
    );
});

router.post('/:produtoId/planos', (req, res) => {
    const { produtoId } = req.params;
    const { nome, quantidade, preco, banner } = req.body;
    
    const linkCheckout = crypto.randomBytes(16).toString('hex');
    const baseUrl = process.env.BASE_URL || req.protocol + '://' + req.get('host');
    
    console.log('Criando plano:', { produtoId, nome, quantidade, preco, banner });
    
    db.run(
        'INSERT INTO planos (produto_id, nome, quantidade, preco, link_checkout, banner) VALUES (?, ?, ?, ?, ?, ?)',
        [produtoId, nome, quantidade, preco, linkCheckout, banner],
        function(err) {
            if (err) {
                console.error('Erro ao criar plano:', err);
                return res.status(500).json({ error: err.message });
            }
            
            console.log('Plano criado com ID:', this.lastID);
            
            res.json({ 
                id: this.lastID, 
                produto_id: produtoId,
                nome, 
                quantidade, 
                preco,
                banner,
                link_checkout: linkCheckout,
                url_checkout: baseUrl + '/checkout/' + linkCheckout
            });
        }
    );
});

router.put('/planos/:planoId/pixel', (req, res) => {
    const { planoId } = req.params;
    const { pixel_id, pixel_access_token } = req.body;
    
    console.log('Atualizando pixel do plano:', planoId);
    
    db.run(
        'UPDATE planos SET pixel_id = ?, pixel_access_token = ? WHERE id = ?',
        [pixel_id, pixel_access_token, planoId],
        function(err) {
            if (err) {
                console.error('Erro ao atualizar pixel:', err);
                return res.status(500).json({ error: err.message });
            }
            console.log('Pixel atualizado para plano:', planoId);
            res.json({ success: true, plano_id: planoId });
        }
    );
});

router.get('/checkout/:link', (req, res) => {
    const { link } = req.params;
    
    console.log('Buscando plano por link:', link);
    
    const sql = `
        SELECT pl.*, p.nome as produto_nome, p.descricao, p.imagem
        FROM planos pl
        JOIN produtos p ON pl.produto_id = p.id
        WHERE pl.link_checkout = ? AND pl.ativo = 1
    `;
    
    db.get(sql, [link], (err, row) => {
        if (err) {
            console.error('Erro ao buscar plano:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            console.log('Plano não encontrado para link:', link);
            return res.status(404).json({ error: 'Plano nao encontrado' });
        }
        
        console.log('Plano encontrado:', row);
        res.json(row);
    });
});

module.exports = router;