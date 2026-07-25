const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
    const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'; // wait, macOS path, or I can just use puppeteer's bundled chromium if available. 
    // Actually, whatsapp-web.js downloads its own chromium. Let's use it.
    
    // I can just use whatsapp-web.js to init without auth, and just evaluate immediately on ready (or even before ready, on 'qr' event).
    const { Client } = require('whatsapp-web.js');
    const client = new Client({
        puppeteer: { headless: true, args: ['--no-sandbox'] },
        clientId: 'test-preview-' + Date.now()
    });

    client.on('qr', async () => {
        console.log('QR Code received, meaning page is loaded. Evaluating getLinkPreview...');
        try {
            const result = await client.pupPage.evaluate(async () => {
                const module = window.require('WAWebLinkPreviewChatAction');
                if (!module) return { error: 'Module not found' };
                const preview = await module.getLinkPreview('https://github.com');
                if (preview && preview.data) {
                    const thumb = preview.data.jpegThumbnail;
                    return {
                        success: true,
                        type: typeof thumb,
                        isUint8Array: thumb instanceof Uint8Array,
                        isString: typeof thumb === 'string',
                        length: thumb ? (thumb.length || thumb.byteLength) : 0,
                        sample: typeof thumb === 'string' ? thumb.substring(0, 50) : null
                    };
                }
                return { success: false, raw: preview };
            });
            console.log('Result:', result);
        } catch (e) {
            console.error('Eval error:', e);
        }
        process.exit(0);
    });

    client.initialize();
})();
