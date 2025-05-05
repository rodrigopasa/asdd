import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import express from 'express';
import axios from 'axios';

const WEBHOOK_N8N = process.env.WEBHOOK_N8N || 'https://ciliosaquarapunzel.store/webhook-test/whatsapp-in';
const PORT = process.env.PORT || 3001;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
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
        await client.sendMessage(to, message);
        res.json({ status: 'sent' });
    } catch (err) {
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

// Enc