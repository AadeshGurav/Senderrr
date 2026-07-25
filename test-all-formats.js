const puppeteer = require('puppeteer');

async function test() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-web-security'] });
  let page = await browser.newPage();
  
  const urls = [
    { type: 'AVIF', url: 'https://ratnagirikhabardar.com/wp-content/uploads/2026/07/esakal_2022-09_b9d90635-03b2-43de-975d-27a4c3f66a8e_Untitled_3.avif' },
    { type: 'WEBP', url: 'https://ratnagirikhabardar.com/wp-content/uploads/2026/07/news-update-marathi-1536x864.webp' },
    { type: 'JPG', url: 'https://ratnagirikhabardar.com/wp-content/uploads/2024/07/dummy.jpg' }
  ];

  for (const { type, url } of urls) {
    console.log(`\nTesting ${type}: ${url}`);
    try {
      await page.goto('about:blank');
      await page.setContent(
        `<img id="thumb" crossorigin="anonymous" src="${url}">`,
        { waitUntil: 'load', timeout: 20000 }
      );

      const base64 = await page.evaluate(async (size) => {
        try {
          const img = document.getElementById('thumb');
          if (!img) return undefined;
          await img.decode();
          const ratio = Math.min(size / img.naturalWidth, size / img.naturalHeight);
          const w = Math.round(img.naturalWidth * ratio);
          const h = Math.round(img.naturalHeight * ratio);
          const canvas = new OffscreenCanvas(w, h);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
          const arrBuf = await outBlob.arrayBuffer();
          const bytes = new Uint8Array(arrBuf);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return btoa(binary);
        } catch (e) {
          return e.toString();
        }
      }, 100);

      if (base64 && base64.length > 50) {
        console.log(`SUCCESS! Received base64 string of length ${base64.length}`);
      } else {
        console.log(`FAILED! Returned ${base64}`);
      }
    } catch (e) {
      console.log(`ERROR! ${e.message}`);
    }
  }
  
  await browser.close();
  process.exit(0);
}
test();
