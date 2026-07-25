(async () => {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Navigate directly to the image URL
  await page.goto('https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png');
  
  const result = await page.evaluate(async () => {
    try {
      const img = document.querySelector('img');
      if (!img) return 'No img element found';
      
      const canvas = new OffscreenCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
      return blob.size;
    } catch(e) {
      return e.toString();
    }
  });
  console.log('Result:', result);
  await browser.close();
})();
