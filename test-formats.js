const puppeteer = require('puppeteer-core');

async function testFormats() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true
  });
  const page = await browser.newPage();

  const urls = [
    { type: 'AVIF (Failing target)', url: 'https://ratnagirikhabardar.com/wp-content/uploads/2026/07/esakal_2022-09_b9d90635-03b2-43de-975d-27a4c3f66a8e_Untitled_3.avif' },
    { type: 'WEBP', url: 'https://www.gstatic.com/webp/gallery/1.webp' },
    { type: 'JPG', url: 'https://www.w3.org/People/mimasa/test/imgformat/img/w3c_home.jpg' }
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
          if (!img) return 'NO_IMG';

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
      
      if (base64.length > 50) {
        console.log(`SUCCESS! Received base64 string of length ${base64.length}`);
      } else {
        console.log(`FAILED! Returned: ${base64}`);
      }
    } catch (e) {
      console.log(`ERROR! ${e.message}`);
    }
  }
  
  await browser.close();
}

testFormats();
