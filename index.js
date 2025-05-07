import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import express from 'express';
import axios from 'axios';
import https from 'https';
import fs from 'fs';
import { URL } from 'url';

// Configurações principais
const WEBHOOK_N8N = process.env.WEBHOOK_N8N || 'https://ciliosaquarapunzel.store/webhook/whatsapp-in';
const WEBHOOK_N8N_TEST = 'https://ciliosaquarapunzel.store/webhook-test/whatsapp-in'; // URL de teste
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

// Inicializar cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
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

// Express App
const app = express();
app.use(express.json());

// Variável QR
let lastQrCode = null;

// Rota base
app.get('/', (req, res) => {
    res.send(`Bot WhatsApp API está rodando! Versão 1.0.1<br><a href="/status">Status</a><br><a href="/qr">Ver QR Code</a><br><a href="/test-webhook">Testar webhook</a><br><a href="/test-webhook-url">Testar webhook URL de teste</a>`);
});

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

// Exibir QR
app.get('/qr', (req, res) => {
    if (lastQrCode) {
        res.send(`
            <html>
            <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
                <h2>Escaneie o QR Code</h2>
                <img src="data:image/png;base64,${lastQrCode}" />
                <p><a href="/status">Verificar Status</a></p>
            </body>
            </html>
        `);
    } else {
        res.status(404).send('<h2>QR Code não disponível</h2>');
    }
});

// Enviar mensagem
app.post('/send', async (req, res) => {
    const { to, message } = req.body;

    if (!to || !message) return res.status(400).json({ error: 'to and message are required' });

    try {
        if (!client.info) return res.status(503).json({ error: 'WhatsApp não conectado' });

        const text = typeof message === 'object' ? JSON.stringify(message) : String(message);
        await client.sendMessage(to, text);
        console.log(`Mensagem enviada para ${to}: ${text}`);
        res.json({ status: 'sent', to });
    } catch (err) {
        console.error('Erro ao enviar:', err);
        res.status(500).json({ error: err.toString() });
    }
});

// Teste webhook
app.get('/test-webhook', async (req, res) => {
    try {
        const response = await axios.post(WEBHOOK_N8N, {
            from: "test@bot",
            body: "Teste de conexão com n8n",
            timestamp: Date.now()
        }, {
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });

        res.json({ success: true, status: response.status, data: response.data });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
            response: err.response ? {
                status: err.response.status,
                data: err.response.data
            } : null
        });
    }
});

// Teste webhook com URL de teste
app.get('/test-webhook-url', async (req, res) => {
    try {
        const response = await axios.post(WEBHOOK_N8N_TEST, {
            from: "test@bot",
            body: "Teste de conexão com n8n usando URL de teste",
            timestamp: Date.now()
        }, {
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });

        res.json({ success: true, status: response.status, data: response.data });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
            response: err.response ? {
                status: err.response.status,
                data: err.response.data
            } : null
        });
    }
});

// QR Code
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    import('qrcode').then(qrlib => {
        qrlib.toDataURL(qr, (err, url) => {
            if (!err) lastQrCode = url.split(',')[1];
        });
    });
});

client.on('ready', () => {
    console.log('WhatsApp conectado!');
    lastQrCode = null;
});

client.on('auth_failure', (msg) => {
    console.error('Falha na autenticação:', msg);
});

client.on('disconnected', (reason) => {
    console.log('Desconectado:', reason);
    lastQrCode = null;
    setTimeout(() => {
        console.log('Reconectando...');
        client.initialize();
    }, 5000);
});

// ✅ Mensagens recebidas: enviar para webhook com query e body
client.on('message', async msg => {
    if (msg.from === 'status@broadcast') return;

    try {
        console.log(`Mensagem de ${msg.from}: ${msg.body}`);

        // Montar URL com query params
        const webhookUrl = new URL(WEBHOOK_N8N);
        webhookUrl.searchParams.append('from', msg.from);
        webhookUrl.searchParams.append('message', msg.body);
        webhookUrl.searchParams.append('timestamp', msg.timestamp);
        webhookUrl.searchParams.append('hasMedia', msg.hasMedia);
        webhookUrl.searchParams.append('type', msg.type);
        webhookUrl.searchParams.append('isGroup', msg.isGroup);

        const response = await axios.post(webhookUrl.toString(), {
            from: msg.from,
            body: msg.body,
            message: msg.body,
            timestamp: msg.timestamp,
            hasMedia: msg.hasMedia,
            type: msg.type,
            isGroup: msg.isGroup
        }, {
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });

        console.log(`Mensagem enviada ao N8N: ${response.status}`);
    } catch (err) {
        console.error(`Erro no envio ao webhook: ${err.message}`);
        if (err.response) {
            console.error(`Status: ${err.response.status}`);
            console.error(`Dados: ${JSON.stringify(err.response.data || {})}`);
        }
    }
});

// Inicializar servidor e cliente
const startApp = () => {
    app.listen(PORT, () => {
        console.log(`Servidor Express rodando na porta ${PORT}`);
        try {
            client.initialize();
        } catch (error) {
            console.error('Erro ao iniciar WhatsApp:', error);
        }
    });
};

process.on('uncaughtException', (err) => {
    console.error('Erro não tratado:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Rejeição não tratada:', reason);
});

startApp();
