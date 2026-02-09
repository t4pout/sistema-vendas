const express = require('express');
const router = express.Router();
const pool = require('../database/db-postgres');
const crypto = require('crypto');

router.get('/', async (req, res) => {
    console.log('=== INICIO GET /api/produtos ===');
    
    try {
        const produtosResult = await pool.query(`
            SELECT p.*, 
                   COALESCE(
                       json_agg(
                           json_build_object(
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
                       ) FILTER (WHERE pl.id IS NOT NULL), '[]'
                   ) as planos
            FROM produtos p
            LEFT JOIN planos pl ON p.id = pl.produto_id
            GROUP BY p.id
            ORDER BY p.criado_em DESC
        `);
        
        console.log('Produtos retornados:', produtosResult.rows);
        res.json(produtosResult.rows);
    } catch (err) {
        console.error('Erro SQL:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    const { nome, descricao, imagem } = req.body;
    
    console.log('Criando produto:', { nome, descricao, imagem });
    
    try {
        const result = await pool.query(
            'INSERT INTO produtos (nome, descricao, imagem) VALUES ($1, $2, $3) RETURNING *',
            [nome, descricao, imagem]
        );
        
        console.log('Produto criado:', result.rows[0]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erro ao criar produto:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/:produtoId/planos', async (req, res) => {
    const { produtoId } = req.params;
    const { nome, quantidade, preco, banner } = req.body;
    
    const linkCheckout = crypto.randomBytes(16).toString('hex');
    const baseUrl = process.env.BASE_URL || req.protocol + '://' + req.get('host');
    
    console.log('Criando plano:', { produtoId, nome, quantidade, preco, banner });
    
    try {
        const result = await pool.query(
            'INSERT INTO planos (produto_id, nome, quantidade, preco, link_checkout, banner) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [produtoId, nome, quantidade, preco, linkCheckout, banner]
        );
        
        console.log('Plano criado:', result.rows[0]);
        
        res.json({ 
            ...result.rows[0],
            url_checkout: baseUrl + '/checkout/' + linkCheckout
        });
    } catch (err) {
        console.error('Erro ao criar plano:', err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/planos/:planoId/pixel', async (req, res) => {
    const { planoId } = req.params;
    const { pixel_id, pixel_access_token } = req.body;
    
    console.log('Atualizando pixel do plano:', planoId);
    
    try {
        await pool.query(
            'UPDATE planos SET pixel_id = $1, pixel_access_token = $2 WHERE id = $3',
            [pixel_id, pixel_access_token, planoId]
        );
        
        console.log('Pixel atualizado para plano:', planoId);
        res.json({ success: true, plano_id: planoId });
    } catch (err) {
        console.error('Erro ao atualizar pixel:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/checkout/:link', async (req, res) => {
    const { link } = req.params;
    
    console.log('Buscando plano por link:', link);
    
    try {
        const result = await pool.query(`
            SELECT pl.*, p.nome as produto_nome, p.descricao, p.imagem
            FROM planos pl
            JOIN produtos p ON pl.produto_id = p.id
            WHERE pl.link_checkout = $1 AND pl.ativo = true
        `, [link]);
        
        if (result.rows.length === 0) {
            console.log('Plano não encontrado para link:', link);
            return res.status(404).json({ error: 'Plano nao encontrado' });
        }
        
        console.log('Plano encontrado:', result.rows[0]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erro ao buscar plano:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
