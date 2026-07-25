const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2' });
    
    // Wait for the webpack modules to load (even without auth, window.require should be injected by WAWeb)
    await page.waitForFunction('window.require !== undefined', { timeout: 30000 }).catch(() => {});
    
    // Try to find the link preview module
    const result = await page.evaluate(() => {
        if (!window.require) return "window.require not found";
        
        let found = [];
        try {
            if (window.require('WAWebLinkPreviewChatAction')) {
                found.push("WAWebLinkPreviewChatAction exists");
            }
        } catch(e) {
            found.push("WAWebLinkPreviewChatAction MISSING");
        }
        
        // Search for 'getLinkPreview' in all modules
        // WA Web modules are usually in window.__REQUIRE__ or similar.
        // We can check if WAWebLinkPreviewChatAction works:
        return found;
    });
    console.log("Result:", result);
    await browser.close();
})();
