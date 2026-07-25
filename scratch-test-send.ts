import { Client, LocalAuth } from 'whatsapp-web.js';
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './whatsapp-auth' }),
    puppeteer: { headless: true, args: ['--no-sandbox'] }
});

client.on('ready', async () => {
    console.log('Client is ready!');
    const chats = await client.getChats();
    const chat = chats[0];
    console.log('Sending to', chat.name);
    
    try {
        const msg = await client.sendMessage(chat.id._serialized, 'Testing custom preview https://google.com', {
            linkPreview: false, // disable native broken preview
            extra: {
                preview: true,
                subtype: 'url',
                title: 'Custom Google Title',
                description: 'Custom Google Description',
                canonicalUrl: 'https://google.com',
                matchedText: 'https://google.com',
                // thumbnail: 'base64...' (optional for text only, but we can see if it works without thumbnail)
            }
        });
        console.log('Sent msg:', msg.id);
    } catch (e) {
        console.error('Error sending:', e);
    }
    
    setTimeout(() => client.destroy(), 5000);
});
client.on('qr', () => console.log('QR Code received, scan it!'));
client.initialize();
