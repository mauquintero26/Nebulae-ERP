const puppeteer = require('puppeteer');
const path = require('path');

const OUTPUT_DIR = __dirname;
const BASE_URL = 'http://localhost:3100';
const CHROME_PATH = 'C:\\Users\\jmqui\\.gemini\\antigravity\\brain\\670d8f40-a4a1-408f-bc4b-9b21d752792c\\scratch\\pw-browsers\\chromium-1243\\chrome-win64\\chrome.exe';

const PAGES = [
  // catalogo — avoid redirect by going to home first then navigating
  { url: '/store/catalogo?page=1', filename: '02_catalogo_desktop.png', width: 1440, height: 900 },
  { url: '/store/catalogo?page=1', filename: '03_catalogo_mobile.png', width: 390, height: 844 },
  { url: '/store/catalogo?q=baby&page=1', filename: '04_busqueda.png', width: 1440, height: 900 },
  { url: '/store/catalogo?q=zzznoresults&page=1', filename: '05_sin_resultados.png', width: 1440, height: 900 },
  { url: '/store/catalogo?categoria=Ropa&page=1', filename: '06_filtros_desktop.png', width: 1440, height: 900 },
  { url: '/store/catalogo?page=1', filename: '07_filtros_mobile.png', width: 390, height: 844 },
  { url: '/store/producto/1', filename: '09_producto.png', width: 1440, height: 900 },
];

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  for (const page of PAGES) {
    const p = await browser.newPage();
    await p.setViewport({ width: page.width, height: page.height, deviceScaleFactor: 1 });
    // Set no-store cache policy to prevent redirect caching
    await p.setCacheEnabled(false);
    try {
      // Navigate to home first to seed cookies/session
      await p.goto(BASE_URL + '/store', { waitUntil: 'domcontentloaded', timeout: 10000 });
      // Then navigate to target
      await p.goto(BASE_URL + page.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 2000));
      const outPath = path.join(OUTPUT_DIR, page.filename);
      await p.screenshot({ path: outPath, fullPage: false });
      console.log('OK', page.filename);
    } catch (e) {
      console.error('FAIL', page.filename, e.message);
    } finally {
      await p.close();
    }
  }

  await browser.close();
  console.log('Done:', OUTPUT_DIR);
})();
