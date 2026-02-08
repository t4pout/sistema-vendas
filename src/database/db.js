const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ✅ ÚNICA CONEXÃO - SINGLETON PATTERN
const dbPath = path.join(__dirname, 'vendas.db');

let db = null;

function getDatabase() {
    if (!db) {
        console.log('🔌 Criando conexão única com banco de dados...');
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('❌ Erro ao conectar ao banco:', err);
                throw err;
            }
            console.log('✅ Banco de dados conectado em:', dbPath);
            
            // Configurar pragmas para melhor performance e segurança
            db.run('PRAGMA journal_mode = WAL', (err) => {
                if (err) console.error('Erro PRAGMA journal_mode:', err);
            });
            db.run('PRAGMA synchronous = NORMAL', (err) => {
                if (err) console.error('Erro PRAGMA synchronous:', err);
            });
            db.run('PRAGMA foreign_keys = ON', (err) => {
                if (err) console.error('Erro PRAGMA foreign_keys:', err);
            });
        });
        
        // Criar tabelas ao iniciar
        inicializarTabelas();
    }
    return db;
}

function inicializarTabelas() {
    db.serialize(() => {
        // Tabela de produtos
        db.run(`CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            descricao TEXT,
            imagem TEXT,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('❌ Erro ao criar tabela produtos:', err);
            else console.log('✅ Tabela produtos OK');
        });

        // Tabela de planos
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
            FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
        )`, (err) => {
            if (err) console.error('❌ Erro ao criar tabela planos:', err);
            else console.log('✅ Tabela planos OK');
        });

        // Tabela de vendas
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
            FOREIGN KEY (plano_id) REFERENCES planos(id) ON DELETE CASCADE
        )`, (err) => {
            if (err) console.error('❌ Erro ao criar tabela vendas:', err);
            else console.log('✅ Tabela vendas OK');
        });

        // Criar índices para melhor performance
        db.run('CREATE INDEX IF NOT EXISTS idx_planos_link ON planos(link_checkout)', (err) => {
            if (err) console.error('Erro ao criar índice planos_link:', err);
        });
        
        db.run('CREATE INDEX IF NOT EXISTS idx_vendas_status ON vendas(status)', (err) => {
            if (err) console.error('Erro ao criar índice vendas_status:', err);
        });
        
        db.run('CREATE INDEX IF NOT EXISTS idx_vendas_txid ON vendas(pix_txid)', (err) => {
            if (err) console.error('Erro ao criar índice vendas_txid:', err);
        });
    });
}

// Fechar conexão adequadamente ao encerrar processo
process.on('exit', () => {
    if (db) {
        console.log('🔌 Fechando conexão com banco de dados...');
        db.close();
    }
});

process.on('SIGINT', () => {
    if (db) {
        db.close(() => {
            console.log('🔌 Banco fechado por SIGINT');
            process.exit(0);
        });
    }
});

process.on('SIGTERM', () => {
    if (db) {
        db.close(() => {
            console.log('🔌 Banco fechado por SIGTERM');
            process.exit(0);
        });
    }
});

// Exportar a instância única
module.exports = getDatabase();
