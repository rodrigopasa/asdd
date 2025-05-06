import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import express from 'express';
import axios from 'axios';
import https from 'https';
import fs from 'fs';

// Configurações principais
const WEBHOOK_N8N = process.env.WEBHOOK_N8N || 'https://ciliosaquarapunzel.store/webhook/whatsapp-in';
const PORT = process.env.PORT || 3001;
const PUPPETEER_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--window-size=1280x800',
    '--user-agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36"'
];

// Verificar se o diretório de autenticação existe
const AUTH_PATH = '/app/.wwebjs_auth';
if (!fs.existsSync(AUTH_PATH)) {
    fs.mkdirSync(AUTH_PATH, { recursive: true });
    console.log(`Diretório de autenticação criado: ${AUTH_PATH}`);
}

// Inicializar cliente WhatsApp com configurações otimizadas
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: AUTH_PATH
    }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: PUPPETEER_ARGS
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2407.0.html'
    },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'
});

// Configurar Express
const app = express();
app.use(express.json());

// Rota de healthcheck
app.get('/', (req, res) => {
    res.send(`Bot WhatsApp API está rodando! Versão 1.0.1
    <br><a href="/status">Verificar Status</a>
    <br><a href="/qr">Ver QR Code (se disponível)</a>
    <br><a href="/test-webhook">Testar conexão com n8n</a>`);
});

// Variável para armazenar o último QR code
let lastQrCode = null;

// Status do bot
app.get('/status', (req, res) => {
    res.json({
        api: 'running',
        whatsapp: client.info ? 'connected' : 'disconnected or waiting for QR',
        info: client.info ? {
            id: client.info.wid.user,
            name: client.info.pushname
        } : null,
        webhook_n8n: WEBHOOK_N8N
    });
});

// Exibir QR code em uma página web
app.get('/qr', (req, res) => {
    if (lastQrCode) {
        res.send(`
            <html>
            <head>
                <title>WhatsApp QR Code</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif; }
                    img { max-width: 80%; border: 10px solid #25D366; border-radius: 10px; }
                    h2 { color: #128C7E; }
                </style>
            </head>
            <body>
                <h2>Escaneie o QR Code com seu WhatsApp</h2>
                <img src="data:image/png;base64,${lastQrCode}" />
                <p>Aguarde até que o status mude para "connected"</p>
                <p><a href="/status">Verificar Status</a></p>
            </body>
            </html>
        `);
    } else {
        res.status(404).send(`
            <html>
            <head>
                <title>QR Code não disponível</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif; }
                    h2 { color: #E91E63; }
                </style>
            </head>
            <body>
                <h2>QR code não disponível</h2>
                <p>O WhatsApp já está conectado ou o QR code ainda não foi gerado.</p>
                <p><a href="/status">Verificar Status</a></p>
            </body>
            </html>
        `);
    }
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
        console.log(`Mensagem enviada para ${to}: ${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}`);
        res.json({ status: 'sent', to });
    } catch (err) {
        console.error('Erro ao enviar mensagem:', err);
        res.status(500).json({ error: err.toString() });
    }
});

// Endpoint para testar conexão com n8n
app.get('/test-webhook', async (req, res) => {
    try {
        console.log(`Testando conexão com webhook: ${WEBHOOK_N8N}`);
        const response = await axios.post(WEBHOOK_N8N, {
            from: "test@bot",
            body: "Teste de conexão com n8n",
            timestamp: Date.now()
        }, {
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });
        res.json({
            success: true,
            status: response.status,
            data: response.data
        });
    } catch (err) {
        console.error('Erro no teste de webhook:', err.message);
        res.status(500).json({
            success: false,
            error: err.message,
            response: err.response ? {
                status: err.response.status,
                data: err.response.data
            } : null,
            webhook_url: WEBHOOK_N8N
        });
    }
});

// Evento de QR code
client.on('qr', (qr) => {
    // Gerar QR code no terminal
    qrcode.generate(qr, { small: true });
    console.log('QR CODE GERADO. Acesse /qr para visualizar ou escaneie abaixo:');
    
    // Converter QR code para imagem e armazenar para exibição web
    import('qrcode').then(qrlib => {
        qrlib.toDataURL(qr, (err, url) => {
            if (!err) {
                // Extrair dados base64 da URL
                lastQrCode = url.split(',')[1];
            }
        });
    });
});

// Evento de cliente pronto
client.on('ready', () => {
    console.log('WhatsApp Web conectado e pronto!');
    lastQrCode = null; // Limpar QR code
});

// Tratamento de erros
client.on('auth_failure', (msg) => {
    console.error('FALHA NA AUTENTICAÇÃO:', msg);
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp desconectado:', reason);
    lastQrCode = null;
    // Reconectar automaticamente após 5 segundos
    setTimeout(() => {
        console.log('Tentando reconectar...');
        client.initialize();
    }, 5000);
});

// Encaminhar mensagens para o n8n com tratamento de erros aprimorado
client.on('message', async msg => {
    if (msg.from === 'status@broadcast') return;
    
    try {
        console.log(`Mensagem recebida de ${msg.from}: ${msg.body}`);
        console.log(`Tentando enviar para webhook n8n: ${WEBHOOK_N8N}`);
        
        const response = await axios.post(WEBHOOK_N8N, {
            from: msg.from,
            body: msg.body,
            message: msg.body,
            timestamp: msg.timestamp,
            hasMedia: msg.hasMedia,
            type: msg.type,
            isGroup: msg.isGroup
        }, {
            httpsAgent: new https.Agent({ rejectUnauthorized: false }) // Ignora erros de certificado
        });
        
        console.log(`Mensagem enviada com sucesso para n8n. Status: ${response.status}`);
    } catch (err) {
        console.error(`Erro ao enviar para n8n: ${err.message}`);
        console.error(`URL do webhook: ${WEBHOOK_N8N}`);
        if (err.response) {
            console.error(`Status: ${err.response.status}`);
            console.error(`Dados de erro: ${JSON.stringify(err.response.data || {})}`);
        }
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

// Tratamento global de erros
process.on('uncaughtException', (err) => {
    console.error('Erro não tratado:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Rejeição não tratada:', reason);
});

// Iniciar aplicação
startApp();
