import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import express from 'express';
import axios from 'axios';

const WEBHOOK_N8N = process.env.WEBHOOK_N8N || 'https://ciliosaquarapunzel.store/webhook/whatsapp-in';
const PORT = process.env.PORT || 3001;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

const app = express();
app.use(express.json());

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

// Endpoint de healthcheck
app.get('/status', (req, res) => {
    const isConnected = client.info ? true : false;
    res.json({ 
        status: isConnected ? 'connected' : 'disconnected',
        info: isConnected ? client.info.wid.user : null
    });
});

// Exibe QR code no console para autenticação
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Escaneie o QR code acima com o WhatsApp!');
});

client.on('ready', () => {
    console.log('WhatsApp Web pronto!');
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

client.initialize();

app.listen(PORT, () => {
    console.log(`API do bot ouvindo na porta ${PORT}`);
});
