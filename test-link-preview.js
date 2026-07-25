const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "test-admin" }),
    puppeteer: { headless: true, args: ['--no-sandbox'] }
});

client.once('ready', async () => {
    console.log('Client is ready!');
    const result = await client.pupPage.evaluate(async () => {
        const module = window.require('WAWebLinkPreviewChatAction');
        try {
            const preview = await module.getLinkPreview({ href: 'https://github.com', url: 'https://github.com' });
            if (preview && preview.data) {
                const thumb = preview.data.jpegThumbnail;
                return {
                    hasData: true,
                    type: typeof thumb,
                    isUint8Array: thumb instanceof Uint8Array,
                    isString: typeof thumb === 'string',
                    isArray: Array.isArray(thumb),
                    length: thumb ? (thumb.length || thumb.byteLength) : 0,
                    sample: thumb && typeof thumb === 'string' ? thumb.substring(0, 20) : null
                };
            }
            return { hasData: false, raw: preview };
        } catch (e) {
            return { error: e.toString() };
        }
    });
    console.log('Preview data structure:', result);
    process.exit(0);
});

client.initialize();
