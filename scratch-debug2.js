const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2' });
    
    // We need to inject whatsapp-web.js's require function to get modules!
    // Since we don't have ExposeStore.js, we can write a simple module searcher:
    const result = await page.evaluate(() => {
        let modules = [];
        // webpack chunk search
        const chunk = window.webpackChunkwhatsapp_web_client;
        if (chunk) {
             let req;
             chunk.push([[Math.random()], {}, (r) => { req = r; }]);
             if (req) {
                 for (let m in req.m) {
                     try {
                         let mod = req(m);
                         if (mod && mod.getLinkPreview) modules.push("Found getLinkPreview in " + m);
                         if (mod && mod.findLink) modules.push("Found findLink in " + m);
                     } catch(e) {}
                 }
             }
        }
        return modules;
    });
    console.log("Modules found:", result);
    await browser.close();
})();
