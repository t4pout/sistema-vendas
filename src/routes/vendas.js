const express = require('express');
const router = express.Router();
const db = require('../database/db');
const axios = require('axios');

const PIXUP_CLIENT_ID = process.env.PIXUP_CLIENT_ID;
const PIXUP_CLIENT_SECRET = process.env.PIXUP_CLIENT_SECRET;
const PIXUP_API_URL = process.env.PIXUP_API_URL || 'https://api.pixup.com.br/v1';

router.post('/', async (req, res) => {
    const { 
        plano_id, 
        cliente_nome, 
        cliente_email, 
        cliente_telefone,
        cliente_cep,
        cliente_rua,
        cliente_numero,
        cliente_complemento,
        cliente_bairro,
        cliente_cidade,
        cliente_estado
    } = req.body;
    
    try {
        const plano = await new Promise((resolve, reject) => {
            const sql = `
                SELECT pl.*, p.nome as produto_nome
                FROM planos pl
                JOIN produtos p ON pl.produto_id = p.id
                WHERE pl.id = ?
            `;
            
            db.get(sql, [plano_id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!plano) {
            return res.status(404).json({ error: 'Plano nao encontrado' });
        }
        
        const pixupData = {
            value: parseFloat(plano.preco),
            customer: {
                name: cliente_nome,
                email: cliente_email,
                phone: cliente_telefone
            },
            description: plano.produto_nome + ' - ' + plano.nome
        };
        
        const pixupResponse = await axios.post(
            PIXUP_API_URL + '/charges',
            pixupData,
            {
                headers: {
                    'Authorization': 'Bearer ' + PIXUP_CLIENT_ID,
                    'X-Client-Secret': PIXUP_CLIENT_SECRET,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        const { qrcode, brcode, txid } = pixupResponse.data;
        
        const insertSql = `
            INSERT INTO vendas 
            (plano_id, cliente_nome, cliente_email, cliente_telefone, 
             cliente_cep, cliente_rua, cliente_numero, cliente_complemento, 
             cliente_bairro, cliente_cidade, cliente_estado,
             valor, pix_qrcode, pix_codigo, pix_txid, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')
        `;
        
        db.run(insertSql, [
            plano_id, cliente_nome, cliente_email, cliente_telefone,
            cliente_cep, cliente_rua, cliente_numero, cliente_complemento,
            cliente_bairro, cliente_cidade, cliente_estado,
            plano.preco, qrcode, brcode, txid
        ],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            res.json({
                venda_id: this.lastID,
                valor: plano.preco,
                qrcode: qrcode,
                codigo_pix: brcode,
                txid: txid,
                status: 'pendente'
            });
        });
        
    } catch (error) {
        console.error('Erro ao criar cobranca:', error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: 'Erro ao gerar Pix',
            details: error.response ? error.response.data : error.message
        });
    }
});

router.get('/', (req, res) => {
    const sql = `
        SELECT v.*, pl.nome as plano_nome, p.nome as produto_nome
        FROM vendas v
        JOIN planos pl ON v.plano_id = pl.id
        JOIN produtos p ON pl.produto_id = p.id
        ORDER BY v.criado_em DESC
    `;
    
    db.all(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.get('/stats', (req, res) => {
    const sql = `
        SELECT 
            COUNT(*) as total_vendas,
            SUM(CASE WHEN status = 'pago' THEN valor ELSE 0 END) as total_faturado,
            SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END) as total_pendente,
            COUNT(CASE WHEN status = 'pago' THEN 1 END) as vendas_pagas
        FROM vendas
    `;
    
    db.get(sql, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

router.post('/webhook', (req, res) => {
    const { txid, status } = req.body;
    
    if (status === 'paid' || status === 'approved') {
        const sql = `
            UPDATE vendas 
            SET status = 'pago', pago_em = CURRENT_TIMESTAMP
            WHERE pix_txid = ?
        `;
        
        db.run(sql, [txid], (err) => {
            if (err) console.error('Erro ao atualizar venda:', err);
        });
    }
    
    res.json({ received: true });
});

module.exports = router;