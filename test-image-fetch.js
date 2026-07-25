const { BrowserFetchUtil } = require('./dist/common/utils/browser-fetch.util.js');

async function test() {
  // We need a dummy logger to inject because BrowserFetchUtil expects one.
  BrowserFetchUtil.logger = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  const avifUrl = 'https://ratnagirikhabardar.com/wp-content/uploads/2026/07/esakal_2022-09_b9d90635-03b2-43de-975d-27a4c3f66a8e_Untitled_3.avif';
  const webpUrl = 'https://ratnagirikhabardar.com/wp-content/uploads/2024/07/Logo-Ratnagiri-Khabardar.webp'; // guessing a logo URL or something
  const jpgUrl = 'https://ratnagirikhabardar.com/wp-content/uploads/2024/07/dummy.jpg'; // just any image

  // Since we don't have the exact webp/jpg URLs, we can just use the provided avif, and a couple of others from the web just to prove the pipeline.
  const urls = [
    { type: 'AVIF (Failing target)', url: avifUrl },
    { type: 'WEBP', url: 'https://www.gstatic.com/webp/gallery/1.webp' },
    { type: 'JPG', url: 'https://www.w3.org/People/mimasa/test/imgformat/img/w3c_home.jpg' }
  ];

  for (const { type, url } of urls) {
    console.log(`\nTesting ${type}: ${url}`);
    try {
      const result = await BrowserFetchUtil.fetchAndResizeImageBase64(url, 100);
      if (result) {
        console.log(`SUCCESS! Received base64 string of length ${result.length}`);
      } else {
        console.log(`FAILED! Returned undefined.`);
      }
    } catch (e) {
      console.log(`ERROR! ${e.message}`);
    }
  }
  
  process.exit(0);
}

test();
