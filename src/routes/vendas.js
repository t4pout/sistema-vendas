const express = require('express');
const router = express.Router();
const pool = require('../database/db-postgres');
const axios = require('axios');
const QRCode = require('qrcode');
const { dispararEvento } = require('../helpers/facebookPixel');

const PIXUP_CLIENT_ID = process.env.PIXUP_CLIENT_ID;
const PIXUP_CLIENT_SECRET = process.env.PIXUP_CLIENT_SECRET;
const PIXUP_API_URL = 'https://api.pixupbr.com/v2';

let pixupToken = null;
let tokenExpiry = null;

async function getPixupToken() {
    if (pixupToken && tokenExpiry && Date.now() < tokenExpiry) {
        console.log('Usando token em cache');
        return pixupToken;
    }

    try {
        console.log('Gerando novo token Pixup...');
        console.log('Client ID:', PIXUP_CLIENT_ID);
        
        const credentials = `${PIXUP_CLIENT_ID}:${PIXUP_CLIENT_SECRET}`;
        const base64Credentials = Buffer.from(credentials).toString('base64');
        
        console.log('Base64 gerado');
        
        const response = await axios.post(
            `${PIXUP_API_URL}/oauth/token`,
            {},
            {
                headers: {
                    'Authorization': `Basic ${base64Credentials}`,
                    'accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('Token recebido:', response.data);
        
        pixupToken = response.data.access_token;
        tokenExpiry = Date.now() + ((response.data.expires_in - 60) * 1000);
        
        return pixupToken;
    } catch (error) {
        console.error('Erro ao gerar token Pixup:', error.response?.data || error.message);
        console.error('Status:', error.response?.status);
        console.error('Headers enviados:', error.config?.headers);
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
        const planoResult = await pool.query(`
            SELECT pl.*, p.nome as produto_nome
            FROM planos pl
            JOIN produtos p ON pl.produto_id = p.id
            WHERE pl.id = $1
        `, [plano_id]);
        
        if (planoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Plano nao encontrado' });
        }
        
        const plano = planoResult.rows[0];
        
        const token = await getPixupToken();
        console.log('Token obtido com sucesso');
        
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
            console.log('QR Code gerado');
        } catch (err) {
            console.error('Erro ao gerar QR Code:', err);
            qrcodeImage = pixCode;
        }
        
        const insertResult = await pool.query(`
            INSERT INTO vendas 
            (plano_id, cliente_nome, cliente_email, cliente_telefone, 
             cliente_cep, cliente_rua, cliente_numero, cliente_complemento, 
             cliente_bairro, cliente_cidade, cliente_estado,
             valor, pix_qrcode, pix_codigo, pix_txid, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pendente')
            RETURNING *
        `, [
            plano_id, cliente_nome, cliente_email, cliente_telefone,
            cliente_cep, cliente_rua, cliente_numero, cliente_complemento,
            cliente_bairro, cliente_cidade, cliente_estado,
            plano.preco, qrcodeImage, pixCode, transactionId
        ]);
        
        console.log('Venda salva:', insertResult.rows[0]);
        
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
            venda_id: insertResult.rows[0].id,
            valor: plano.preco,
            qrcode: qrcodeImage,
            codigo_pix: pixCode,
            txid: transactionId,
            status: 'pendente'
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

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT v.*, pl.nome as plano_nome, p.nome as produto_nome
            FROM vendas v
            JOIN planos pl ON v.plano_id = pl.id
            JOIN produtos p ON pl.produto_id = p.id
            ORDER BY v.criado_em DESC
        `);
        
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total_vendas,
                SUM(CASE WHEN status = 'pago' THEN valor ELSE 0 END) as total_faturado,
                SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END) as total_pendente,
                COUNT(CASE WHEN status = 'pago' THEN 1 END) as vendas_pagas
            FROM vendas
        `);
        
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/webhook', async (req, res) => {
    console.log('=== WEBHOOK PIXUP ===');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const { transactionId, status } = req.body;
    
    if (status === 'PAID' || status === 'APPROVED') {
        try {
            const vendaResult = await pool.query(
                'SELECT * FROM vendas WHERE pix_txid = $1',
                [transactionId]
            );
            
            if (vendaResult.rows.length === 0) {
                console.error('Venda nao encontrada:', transactionId);
                return res.json({ received: true });
            }
            
            const venda = vendaResult.rows[0];
            
            await pool.query(
                'UPDATE vendas SET status = $1, pago_em = CURRENT_TIMESTAMP WHERE pix_txid = $2',
                ['pago', transactionId]
            );
            
            console.log('Venda atualizada para PAGO');
            
            const planoResult = await pool.query(
                'SELECT pl.*, p.nome as produto_nome FROM planos pl JOIN produtos p ON pl.produto_id = p.id WHERE pl.id = $1',
                [venda.plano_id]
            );
            
            if (planoResult.rows.length > 0) {
                const plano = planoResult.rows[0];
                
                if (plano.pixel_id && plano.pixel_access_token) {
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
            }
            
            res.json({ received: true });
        } catch (err) {
            console.error('Erro no webhook:', err);
            res.json({ received: true });
        }
    } else {
        res.json({ received: true });
    }
});

router.post('/pixel/initiatecheckout', async (req, res) => {
    const { plano_id, value, content_name } = req.body;
    
    try {
        const result = await pool.query('SELECT * FROM planos WHERE id = $1', [plano_id]);
        
        if (result.rows.length > 0) {
            const plano = result.rows[0];
            
            if (plano.pixel_id && plano.pixel_access_token) {
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
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Erro InitiateCheckout:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
