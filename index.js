import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import express from 'express';
import axios from 'axios';
import fs from 'fs';

const WEBHOOK_N8N = process.env.WEBHOOK_N8N || 'https://ciliosaquarapunzel.store/webhook/whatsapp-in';
const PORT = process.env.PORT || 3001;
const PUPPETEER_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu'
];

// Verificar se o diretório de autenticação existe
const AUTH_PATH = '/app/.wwebjs_auth';
if (!fs.existsSync(AUTH_PATH)) {
    fs.mkdirSync(AUTH_PATH, { recursive: true });
}

// Inicializar cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: AUTH_PATH
    }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: PUPPETEER_ARGS
    }
});

// Configurar Express
const app = express();
app.use(express.json());

// Rota de healthcheck
app.get('/', (req, res) => {
    res.send('Bot WhatsApp API está rodando!');
});

// Status do bot
app.get('/status', (req, res) => {
    res.json({
        api: 'running',
        whatsapp: client.info ? 'connected' : 'disconnecting or waiting for QR'
    });
});

// Endpoint para enviar mensagens
app.post('/send', async (req, res) => {
    const { to, message } = req.body;
    
    if (!to || !message) {
        return res.status(400).json({ error: 'to and message are required' });
    }
    
    try {
        if (!client.info) {
            return res.status(503).json({ error: 'WhatsApp não está conectado. Escaneie o QR code.' });
        }
        
        const messageText = typeof message === 'object' ? JSON.stringify(message) : String(message);
        await client.sendMessage(to, messageText);
        console.log(`Mensagem enviada para ${to}`);
        res.json({ status: 'sent', to });
    } catch (err) {
        console.error('Erro ao enviar mensagem:', err);
        res.status(500).json({ error: err.toString() });
    }
});

// Salvar QR code para acesso externo
let lastQrCode = null;
app.get('/qr', (req, res) => {
    if (lastQrCode) {
        res.type('png');
        res.send(Buffer.from(lastQrCode, 'base64'));
    } else {
        res.status(404).send('QR code não disponível. Aguarde o bot inicializar.');
    }
});

// Evento de QR code
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('QR CODE GERADO. Acesse /qr para visualizar ou escaneie abaixo:');
    // Armazenar o QR code para acesso via endpoint
    import('qrcode').then(qrlib => {
        qrlib.toDataURL(qr, (err, url) => {
            if (!err) {
                // Extrair dados base64 da URL
                lastQrCode = url.split(',')[1];
            }
        });
    });
});

// Evento de pronto
client.on('ready', () => {
    console.log('WhatsApp Web conectado e pronto!');
    lastQrCode = null; // Limpar QR code após conectar
});

// Tratamento de erros
client.on('auth_failure', (msg) => {
    console.error('FALHA NA AUTENTICAÇÃO:', msg);
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp desconectado:', reason);
    lastQrCode = null;
    // Reconectar após 5 segundos
    setTimeout(() => {
        console.log('Tentando reconectar...');
        client.initialize();
    }, 5000);
});

// Encaminhar mensagens para o n8n
client.on('message', async (msg) => {
    if (msg.from === 'status@broadcast') return;
    
    try {
        console.log(`Mensagem recebida de ${msg.from}: ${msg.body}`);
        await axios.post(WEBHOOK_N8N, {
            from: msg.from,
            message: msg.body,
            timestamp: msg.timestamp
        });
    } catch (err) {
        console.error('Erro ao enviar para n8n:', err.message);
    }
});

// Iniciar aplicação
const startApp = () => {
    // 1. Iniciar servidor Express
    app.listen(PORT, () => {
        console.log(`Servidor Express rodando na porta ${PORT}`);
        
        // 2. Iniciar cliente WhatsApp
        try {
            console.log('Inicializando cliente WhatsApp...');
            client.initialize();
        } catch (error) {
            console.error('Erro ao inicializar WhatsApp:', error);
        }
    });
};

// Iniciar com tratamento de erros não capturados
process.on('uncaughtException', (err) => {
    console.error('Erro não tratado:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Rejeição não tratada:', reason);
});

// Iniciar aplicação
startApp();
