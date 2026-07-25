const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    let found = [];
    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('.js') && url.includes('whatsapp.net')) {
            try {
                const text = await response.text();
                if (text.includes('getLinkPreview')) {
                    found.push(url);
                }
            } catch (e) {}
        }
    });

    await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2' });
    console.log("Files containing getLinkPreview:", found);
    await browser.close();
})();
