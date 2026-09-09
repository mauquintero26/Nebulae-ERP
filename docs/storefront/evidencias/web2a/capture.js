const puppeteer = require("puppeteer");
const path = require("path");

const OUTPUT_DIR = __dirname;
const BASE_URL = "http://localhost:3100";

const PAGES = [
  { url: "/store",                                  filename: "01_home.png",              width: 1440, height: 900 },
  { url: "/store/catalogo",                         filename: "02_catalogo_desktop.png",  width: 1440, height: 900 },
  { url: "/store/catalogo",                         filename: "03_catalogo_mobile.png",   width: 390,  height: 844 },
  { url: "/store/catalogo?q=baby",                  filename: "04_busqueda.png",          width: 1440, height: 900 },
  { url: "/store/catalogo?q=zzz_no_existe_xyz",     filename: "05_sin_resultados.png",    width: 1440, height: 900 },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  for (const page of PAGES) {
    const p = await browser.newPage();
    await p.setViewport({ width: page.width, height: page.height });

    // Intercept requests to break redirect loops: allow the first navigation but
    // abort any redirect that points back to the same path.
    let firstNavDone = false;
    await p.setRequestInterception(true);
    p.on("request", (req) => {
      const type = req.resourceType();
      const url = req.url();
      const targetPath = BASE_URL + page.url.split("?")[0];
      // If this is a navigation to the same path after the first one, abort it
      if (firstNavDone && type === "document" && url.startsWith(targetPath)) {
        req.abort("aborted");
      } else {
        if (type === "document") firstNavDone = true;
        req.continue();
      }
    });

    try {
      await p.goto(BASE_URL + page.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await new Promise(r => setTimeout(r, 3000));
      await p.screenshot({ path: path.join(OUTPUT_DIR, page.filename), fullPage: false });
      console.log("OK", page.filename);
    } catch (e) {
      // Even if navigation errored/aborted, try to screenshot what we have
      try {
        await p.screenshot({ path: path.join(OUTPUT_DIR, page.filename), fullPage: false });
        console.log("OK (after intercept)", page.filename);
      } catch (e2) {
        console.error("FAIL", page.filename, e.message);
      }
    } finally {
      await p.close();
    }
  }

  await browser.close();
  console.log("Done:", OUTPUT_DIR);
})();
