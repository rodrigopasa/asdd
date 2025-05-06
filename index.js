import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import express from 'express';
import axios from 'axios';

const WEBHOOK_N8N = process.env.WEBHOOK_N8N || 'https://ciliosaquarapunzel.store/webhook/whatsapp-in';
const PORT = process.env.PORT || 3001;
const CHROME_BIN = process.env.CHROME_BIN || '/usr/bin/chromium';
const PUPPETEER_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu'
];

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: '/app/.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        executablePath: CHROME_BIN,
        args: PUPPETEER_ARGS
    }
});

const app = express();
app.use(express.json());

// Rota raiz para verificar se a API está respondendo
app.get('/', (req, res) => {
    res.send('Bot WhatsApp Web.js API está rodando!');
});

// Endpoint para verificar status do bot
app.get('/status', (req, res) => {
    res.json({
        api: 'running',
        whatsapp: client.info ? 'connected' : 'disconnected',
        info: client.info ? { id: client.info.wid.user } : null
    });
});

// Endpoint para o n8n enviar mensagens para o WhatsApp
app.post('/send', async (req, res) => {
    const { to, message } = req.body;
    if (!to || !message) {
        return res.status(400).json({ error: 'to and message are required' });
    }
    
    try {
        // Converter para string caso receba objeto ou número
        const messageText = typeof message === 'object' ? JSON.stringify(message) : String(message);
        await client.sendMessage(to, messageText);
        res.json({ status: 'sent', to });
    } catch (err) {
        console.error('Erro ao enviar mensagem:', err);
        res.status(500).json({ error: err.toString() });
    }
});

// Exibe QR code no console para autenticação
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Escaneie o QR code acima com o WhatsApp!');
});

client.on('ready', () => {
    console.log('WhatsApp Web pronto!');
});

client.on('auth_failure', msg => {
    console.error('ERRO DE AUTENTICAÇÃO:', msg);
});

client.on('disconnected', (reason) => {
    console.log('Cliente desconectado:', reason);
    // Opcional: reconectar automaticamente
    setTimeout(() => {
        client.initialize();
    }, 5000);
});

// Encaminha mensagens recebidas para o webhook do n8n
client.on('message', async msg => {
    try {
        await axios.post(WEBHOOK_N8N, {
            from: msg.from,
            body: msg.body,
            message: msg.body,
            timestamp: msg.timestamp,
            hasMedia: msg.hasMedia,
            type: msg.type,
            isGroup: msg.isGroup
        });
    } catch (err) {
        console.error('Erro ao enviar para n8n:', err.message);
    }
});

// Iniciar servidor antes do cliente para garantir que API esteja disponível
app.listen(PORT, () => {
    console.log(`API do bot ouvindo na porta ${PORT}`);
    
    // Iniciar cliente WhatsApp após servidor estar pronto
    try {
        client.initialize();
        console.log('Iniciando cliente WhatsApp...');
    } catch (error) {
        console.error('Erro ao inicializar cliente:', error);
    }
});
