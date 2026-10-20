'use strict';
/**
 * publicomtools-snap: renderar en webbsida till en JPEG, åt publicomtools "Sida som bild" (skyltar
 * vars webbläsare inte klarar KTH:s levande sidor, t.ex. Samsung Tizen 4.0).
 *
 *   POST /render  {"url":"https://…","width":1920,"height":1080,"waitMs":2000,"scale":1}  (scale 2: dubbla pixlar)
 *                 → 200 image/jpeg, eller 4xx/5xx {"error":"…"}
 *   GET  /health  → 200 "ok"
 *
 * Chromium hålls igång; varje rendering får ett eget tomt webbläsarkontext (inga kakor eller cache
 * mellan sidor) som stängs efteråt. Högst MAX_PARALLEL renderingar åt gången, resten köar.
 * Tjänsten har ingen databas och ingen volym.
 *
 * SNAP_LOCAL_HOSTS (kommaseparerat, t.ex. apps.lib.kth.se) och SNAP_LOCAL_TARGET (t.ex. traefik):
 * sidor på serverns eget namn hämtas från Traefik-containern direkt. Inifrån en container pekar
 * serverns namn annars på dess publika adress, som inte svarar dit. Adressen i webbläsaren och
 * certifikatet är desamma; bara vart anslutningen går ändras.
 */
const http = require('node:http');
const puppeteer = require('puppeteer-core');

const PORT = Number(process.env.PORT || 3000);
const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';
const MAX_PARALLEL = Number(process.env.MAX_PARALLEL || 2);
const TIMEOUT_MS = 30_000;
/** Längsta väntan på att sidans anrop blir klara efter att den laddats */
const IDLE_MS = 12_000;
const MAX_QUEUE = 20;
const LOCAL_HOSTS = (process.env.SNAP_LOCAL_HOSTS || '').split(',').map((h) => h.trim()).filter((h) => /^[a-z0-9.-]+$/i.test(h));
const LOCAL_TARGET = /^[a-z0-9.-]+$/i.test(process.env.SNAP_LOCAL_TARGET || '') ? process.env.SNAP_LOCAL_TARGET : '';
const RESOLVER_RULES = LOCAL_TARGET && LOCAL_HOSTS.length ? [`--host-resolver-rules=${LOCAL_HOSTS.map((h) => `MAP ${h} ${LOCAL_TARGET}`).join(', ')}`] : [];

let browser = null;
let launching = null;

/** Chromium, startat vid första behov och igen om det har dött */
async function getBrowser() {
  if (browser && browser.connected) return browser;
  launching ??= puppeteer
    .launch({
      executablePath: CHROMIUM,
      headless: true,
      // --no-sandbox: Chromiums egen sandlåda kräver rättigheter som containern inte har; containern
      // kör i stället som vanlig användare utan databas, volym eller åtkomst till andra tjänster.
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars', '--force-color-profile=srgb', '--lang=sv-SE', ...RESOLVER_RULES],
    })
    .then((b) => {
      browser = b;
      b.on('disconnected', () => {
        if (browser === b) browser = null;
      });
      return b;
    })
    .finally(() => {
      launching = null;
    });
  return launching;
}

let running = 0;
const queue = [];
function slot() {
  if (running < MAX_PARALLEL) {
    running++;
    return Promise.resolve();
  }
  if (queue.length >= MAX_QUEUE) return Promise.reject(Object.assign(new Error('kön är full'), { status: 503 }));
  return new Promise((resolve) => queue.push(resolve));
}
function release() {
  const next = queue.shift();
  if (next) next();
  else running--;
}

async function render({ url, width, height, waitMs, scale }) {
  await slot();
  const t0 = Date.now();
  let context = null;
  try {
    context = await (await getBrowser()).createBrowserContext();
    const page = await context.newPage();
    // scale 2: samma layout med dubbelt så många pixlar (skarp text på 4K-skärmar)
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    // Bara webbsidor: inga file:-, data:- eller andra adresser som huvudsida
    page.on('request', (r) => {
      if (r.isNavigationRequest() && r.frame() === page.mainFrame() && !/^https:\/\//.test(r.url())) r.abort('blockedbyclient');
      else r.continue();
    });
    await page.setRequestInterception(true);
    const res = await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT_MS });
    if (!res) throw Object.assign(new Error('sidan svarade inte'), { status: 502 });
    if (res.status() >= 400) throw Object.assign(new Error(`sidan svarade http ${res.status()}`), { status: 502 });
    // Vänta tills sidans egna anrop är klara. Ett anrop som aldrig svarar (t.ex. en kalendertjänst
    // som hänger) ska inte stoppa bilden: efter IDLE_MS tas bilden ändå, med det som hunnit ritas.
    let slow = false;
    await page.waitForNetworkIdle({ idleTime: 500, timeout: IDLE_MS }).catch(() => {
      slow = true;
    });
    // Sidans skript ska hinna rita klart (mätare, listor som hämtas efter laddningen)
    await new Promise((r) => setTimeout(r, waitMs));
    const jpeg = await page.screenshot({ type: 'jpeg', quality: 85 });
    return { jpeg: Buffer.from(jpeg), ms: Date.now() - t0, slow };
  } catch (e) {
    if (e && e.name === 'TimeoutError') throw Object.assign(new Error(`sidan blev inte klar på ${TIMEOUT_MS / 1000} s`), { status: 504 });
    throw e;
  } finally {
    if (context) await context.close().catch(() => {});
    release();
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => {
      body += c;
      if (body.length > 10_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error('ogiltig JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const fail = (res, status, error) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error }));
};

http
  .createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }
    if (req.method !== 'POST' || req.url !== '/render') return fail(res, 404, 'okänd adress');
    let job;
    try {
      const b = await readJson(req);
      const width = Number(b.width), height = Number(b.height), waitMs = b.waitMs === undefined ? 2000 : Number(b.waitMs);
      const scale = b.scale === undefined ? 1 : Number(b.scale);
      if (scale !== 1 && scale !== 2) return fail(res, 400, 'ogiltig skala');
      if (typeof b.url !== 'string' || !/^https:\/\/[^\s/]+/.test(b.url)) return fail(res, 400, 'adressen måste börja med https://');
      if (![width, height].every((n) => Number.isInteger(n) && n >= 200 && n <= 3840)) return fail(res, 400, 'ogiltig storlek');
      if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 10_000) return fail(res, 400, 'ogiltig väntetid');
      job = { url: b.url, width, height, waitMs, scale };
      const { jpeg, ms, slow } = await render(job);
      console.log(`klar ${job.url} ${width}×${height}${scale === 2 ? ' ×2' : ''} ${jpeg.length} byte ${ms} ms${slow ? ' (anrop som inte blev klara)' : ''}`);
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': jpeg.length, 'X-Render-Ms': String(ms), 'X-Render-Slow': slow ? '1' : '0' });
      res.end(jpeg);
    } catch (e) {
      const msg = (e && e.message) || String(e);
      console.error(`misslyckades ${job ? job.url : ''}: ${msg}`);
      fail(res, (e && e.status) || 502, msg.replace(/^net::ERR_/, 'nätverksfel: ').slice(0, 300));
    }
  })
  .listen(PORT, () => console.log(`publicomtools-snap lyssnar på ${PORT}${RESOLVER_RULES.length ? `, ${LOCAL_HOSTS.join(', ')} via ${LOCAL_TARGET}` : ''}`));

for (const sig of ['SIGTERM', 'SIGINT'])
  process.on(sig, async () => {
    if (browser) await browser.close().catch(() => {});
    process.exit(0);
  });
