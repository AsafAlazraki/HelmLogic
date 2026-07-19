// v1.34 — harvest Incapsula-walled Yamaha CDN motor images via a REAL
// browser (the only fetch path that passes the challenge; weserv and
// server-side fetch are both blocked — see mirror-motor-images.py).
// Navigates once to establish challenge cookies, then in-page fetches
// every target same-origin and writes bytes to the scratch dir.
// Run through the sandbox TLS bridge (tests/visual/tls-bridge.mjs 39555).
import { chromium } from '@playwright/test';
import fs from 'fs';
import crypto from 'crypto';

const SCRATCH = process.argv[2];
if (!SCRATCH) { console.error('usage: node browser-harvest-motor-images.mjs <scratch-dir>'); process.exit(1); }
const targets = JSON.parse(fs.readFileSync(`${SCRATCH}/motor-image-targets.json`, 'utf8'));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined,
  proxy: { server: 'http://127.0.0.1:39555' },
  args: ['--disable-features=EncryptedClientHello,PostQuantumKeyAgreement,X25519MLKEM768,X25519Kyber768,UseDnsHttpsSvcb'],
});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' });
const page = await ctx.newPage();

// Establish the Incapsula session once.
await page.goto(targets[0].url, { timeout: 60000, waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(5000);

const manifest = [];
let ok = 0, fail = 0;
for (const [i, t] of targets.entries()) {
  try {
    const result = await page.evaluate(async (u) => {
      const r = await fetch(u, { credentials: 'include' });
      if (r.status !== 200) return { status: r.status };
      const type = r.headers.get('content-type') || '';
      if (!/image/.test(type)) return { status: r.status, type };
      const buf = await r.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      const CHUNK = 0x8000;
      for (let o = 0; o < bytes.length; o += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(o, o + CHUNK));
      return { status: 200, type, b64: btoa(bin), size: buf.byteLength };
    }, t.url);
    if (result.status === 200 && result.b64 && result.size > 2000) {
      const ext = /png/.test(result.type) ? 'png' : /webp/.test(result.type) ? 'webp' : 'jpg';
      const sha = crypto.createHash('sha1').update(t.url).digest('hex').slice(0, 16);
      const file = `${sha}.${ext}`;
      fs.writeFileSync(`${SCRATCH}/motor-images/${file}`, Buffer.from(result.b64, 'base64'));
      manifest.push({ ...t, file, ext, size: result.size });
      ok++;
      console.log(`[${i + 1}/${targets.length}] OK ${t.code} (${Math.round(result.size / 1024)}KB)`);
    } else {
      fail++;
      console.log(`[${i + 1}/${targets.length}] FAIL ${t.code}: ${JSON.stringify({ status: result.status, type: result.type })}`);
    }
  } catch (e) {
    fail++;
    console.log(`[${i + 1}/${targets.length}] ERR ${t.code}: ${String(e).slice(0, 120)}`);
  }
  await page.waitForTimeout(250);
}
fs.writeFileSync(`${SCRATCH}/motor-image-manifest.json`, JSON.stringify(manifest, null, 1));
console.log(`HARVEST DONE: ${ok} fetched, ${fail} failed`);
await browser.close();
