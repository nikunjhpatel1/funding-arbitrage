import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.text().includes('DEBUG_BTC_SPREAD')) {
      console.log('BROWSER_LOG_CAPTURE:', msg.text());
    }
  });

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
    // Wait for the websocket to stream in prices
    await new Promise(r => setTimeout(r, 8000));
  } catch (e) {
    console.error('Error loading page:', e);
  } finally {
    await browser.close();
  }
})();
