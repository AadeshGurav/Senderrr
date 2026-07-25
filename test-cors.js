(async () => {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const result = await page.evaluate(async () => {
    try {
      const resp = await fetch('https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png');
      const blob = await resp.blob();
      await createImageBitmap(blob);
      return 'success';
    } catch(e) {
      return e.toString();
    }
  });
  console.log(result);
  await browser.close();
})();
