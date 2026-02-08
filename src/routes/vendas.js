const QRCode = require('qrcode');
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const axios = require('axios');
const { dispararEvento } = require('../helpers/facebookPixel');

const PIXUP_CLIENT_ID = process.env.PIXUP_CLIENT_ID;
const PIXUP_CLIENT_SECRET = process.env.PIXUP_CLIENT_SECRET;
const PIXUP_API_URL = 'https://api.pixupbr.com/v2';

let pixupToken = null;
let tokenExpiry = null;

async function getPixupToken() {
    if (pixupToken && tokenExpiry && Date.now() < tokenExpiry) {
        return pixupToken;
    }

    try {
        const credentials = Buffer.from(`${PIXUP_CLIENT_ID}:${PIXUP_CLIENT_SECRET}`).toString('base64');
        
        const response = await axios.post(
            `${PIXUP_API_URL}/oauth/token`,
            {},
            {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'accept': 'application/json'
                }
            }
        );

        pixupToken = response.data.access_token;
        tokenExpiry = Date.now() + (response.data.expires_in * 1000);
        
        console.log('Token Pixup gerado com sucesso');
        return pixupToken;
    } catch (error) {
        console.error('Erro ao gerar token Pixup:', error.response?.data || error.message);
        throw error;
    }
}

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
    
    console.log('=== NOVA VENDA ===');
    
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
        
        const token = await getPixupToken();
        
        const pixupData = {
            amount: parseFloat(plano.preco),
            payerQuestion: plano.produto_nome + ' - ' + plano.nome,
            payer: {
                name: cliente_nome,
                email: cliente_email,
                document: cliente_telefone.replace(/\D/g, '')
            },
            postbackUrl: (process.env.BASE_URL || 'http://localhost:3000') + '/api/vendas/webhook'
        };
        
        console.log('Enviando para Pixup:', pixupData);
        
        const pixupResponse = await axios.post(
            `${PIXUP_API_URL}/pix/qrcode`,
            pixupData,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'accept': 'application/json',
                    'content-type': 'application/json'
                }
            }
        );
        
        console.log('Resposta Pixup:', pixupResponse.data);
        
        const { transactionId, qrcode: pixCode } = pixupResponse.data;
        
        let qrcodeImage = '';
        try {
            qrcodeImage = await QRCode.toDataURL(pixCode);
            console.log('QR Code gerado como imagem');
        } catch (err) {
            console.error('Erro ao gerar QR Code:', err);
            qrcodeImage = pixCode;
        }
        
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
            plano.preco, qrcodeImage, pixCode, transactionId
        ],
        async function(err) {
            if (err) {
                console.error('Erro ao salvar venda:', err);
                return res.status(500).json({ error: err.message });
            }
            
            console.log('Venda salva com ID:', this.lastID);
            
            if (plano.pixel_id && plano.pixel_access_token) {
                await dispararEvento(
                    plano.pixel_id,
                    plano.pixel_access_token,
                    'AddPaymentInfo',
                    {
                        email: cliente_email,
                        phone: cliente_telefone,
                        name: cliente_nome,
                        value: plano.preco,
                        contentName: plano.produto_nome + ' - ' + plano.nome,
                        productId: plano_id,
                        quantity: plano.quantidade,
                        userAgent: req.headers['user-agent'],
                        ip: req.ip,
                        eventSourceUrl: req.headers.referer || req.headers.origin
                    }
                );
            }
            
            res.json({
                venda_id: this.lastID,
                valor: plano.preco,
                qrcode: qrcodeImage,
                codigo_pix: pixCode,
                txid: transactionId,
                status: 'pendente'
            });
        });
        
    } catch (error) {
        console.error('=== ERRO AO CRIAR COBRANCA ===');
        console.error('Erro:', error.response?.data || error.message);
        
        res.status(500).json({ 
            error: 'Erro ao gerar Pix',
            details: error.response?.data || error.message
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

router.post('/webhook', async (req, res) => {
    console.log('=== WEBHOOK PIXUP RECEBIDO ===');
    console.log('Body completo:', JSON.stringify(req.body, null, 2));
    
    const { transactionId, status } = req.body;
    
    if (status === 'PAID' || status === 'APPROVED') {
        db.get('SELECT * FROM vendas WHERE pix_txid = ?', [transactionId], async (err, venda) => {
            if (err || !venda) {
                console.error('Venda nao encontrada para transactionId:', transactionId);
                return res.json({ received: true });
            }

            console.log('Venda encontrada:', venda.id);

            db.run(
                'UPDATE vendas SET status = ?, pago_em = CURRENT_TIMESTAMP WHERE pix_txid = ?',
                ['pago', transactionId],
                async (err) => {
                    if (err) {
                        console.error('Erro ao atualizar venda:', err);
                        return res.json({ received: true });
                    }

                    console.log('Venda atualizada para PAGO');

                    const plano = await new Promise((resolve) => {
                        db.get(
                            'SELECT pl.*, p.nome as produto_nome FROM planos pl JOIN produtos p ON pl.produto_id = p.id WHERE pl.id = ?',
                            [venda.plano_id],
                            (err, row) => resolve(row)
                        );
                    });

                    if (plano && plano.pixel_id && plano.pixel_access_token) {
                        await dispararEvento(
                            plano.pixel_id,
                            plano.pixel_access_token,
                            'Purchase',
                            {
                                email: venda.cliente_email,
                                phone: venda.cliente_telefone,
                                name: venda.cliente_nome,
                                value: venda.valor,
                                contentName: plano.produto_nome + ' - ' + plano.nome,
                                productId: plano.id,
                                quantity: plano.quantidade,
                                userAgent: 'webhook',
                                ip: '127.0.0.1',
                                eventSourceUrl: process.env.BASE_URL
                            }
                        );
                    }

                    res.json({ received: true });
                }
            );
        });
    } else {
        res.json({ received: true });
    }
});

router.post('/pixel/initiatecheckout', async (req, res) => {
    const { plano_id, value, content_name } = req.body;
    
    try {
        const plano = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM planos WHERE id = ?', [plano_id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (plano && plano.pixel_id && plano.pixel_access_token) {
            await dispararEvento(
                plano.pixel_id,
                plano.pixel_access_token,
                'InitiateCheckout',
                {
                    email: 'visitante@checkout.com',
                    phone: '',
                    name: 'Visitante',
                    value: value,
                    contentName: content_name,
                    productId: plano_id,
                    quantity: plano.quantidade,
                    userAgent: req.headers['user-agent'],
                    ip: req.ip,
                    eventSourceUrl: req.headers.referer || req.headers.origin
                }
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Erro InitiateCheckout:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;