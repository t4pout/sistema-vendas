const { Pool } = require('pg');

// Conexão PostgreSQL
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

// Criar tabelas
async function inicializarTabelas() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Tabela de produtos
        await client.query(`
            CREATE TABLE IF NOT EXISTS produtos (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                descricao TEXT,
                imagem TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de planos
        await client.query(`
            CREATE TABLE IF NOT EXISTS planos (
                id SERIAL PRIMARY KEY,
                produto_id INTEGER NOT NULL,
                nome TEXT NOT NULL,
                quantidade INTEGER NOT NULL,
                preco DECIMAL(10,2) NOT NULL,
                link_checkout TEXT UNIQUE,
                banner TEXT,
                pixel_id TEXT,
                pixel_access_token TEXT,
                ativo BOOLEAN DEFAULT true,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
            )
        `);

        // Tabela de vendas
        await client.query(`
            CREATE TABLE IF NOT EXISTS vendas (
                id SERIAL PRIMARY KEY,
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
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                pago_em TIMESTAMP,
                FOREIGN KEY (plano_id) REFERENCES planos(id) ON DELETE CASCADE
            )
        `);

        // Índices
        await client.query('CREATE INDEX IF NOT EXISTS idx_planos_link ON planos(link_checkout)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_vendas_status ON vendas(status)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_vendas_txid ON vendas(pix_txid)');

        await client.query('COMMIT');
        console.log('✅ Tabelas PostgreSQL criadas com sucesso!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Erro ao criar tabelas:', err);
    } finally {
        client.release();
    }
}

// Inicializar ao carregar
inicializarTabelas().catch(console.error);

module.exports = pool;
