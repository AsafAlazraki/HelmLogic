// v1.34 — can a REAL browser get past Incapsula for the Yamaha CDN images?
// Probe 3 URLs: navigate (runs the challenge), then same-origin fetch the
// image from inside the page and report byte counts.
import { chromium } from '@playwright/test';
import fs from 'fs';

const URLS = [
  'https://www.yamaha-motor.com.au/-/media/products/marine/outboard/mid-range-four-stroke-30---90hp/2017/f90lb/overview-panel/f90-product-colour-grey-800-x-600.ashx',
];

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined,
  proxy: { server: 'http://127.0.0.1:39555' },
  args: ['--disable-features=EncryptedClientHello,PostQuantumKeyAgreement,X25519MLKEM768,X25519Kyber768,UseDnsHttpsSvcb'],
});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' });
const page = await ctx.newPage();

for (const url of URLS) {
  try {
    const resp = await page.goto(url, { timeout: 45000, waitUntil: 'domcontentloaded' });
    console.log('goto status:', resp?.status(), 'content-type:', resp?.headers()['content-type']);
    await page.waitForTimeout(6000); // let any Incapsula JS challenge settle
    // Same-origin in-page fetch with challenge cookies applied.
    const result = await page.evaluate(async (u) => {
      const r = await fetch(u, { credentials: 'include' });
      const buf = await r.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < Math.min(bytes.length, 64); i++) bin += bytes[i].toString(16).padStart(2, '0');
      return { status: r.status, type: r.headers.get('content-type'), size: buf.byteLength, head: bin.slice(0, 24) };
    }, url);
    console.log('in-page fetch:', JSON.stringify(result));
    if (result.size > 5000 && /image/.test(result.type || '')) {
      console.log('VERDICT: BROWSER PATH WORKS');
    } else {
      // maybe the goto response itself was the image
      const body = await resp.body().catch(() => null);
      console.log('goto body bytes:', body?.length ?? 'n/a');
      if (body && body.length > 5000) {
        fs.writeFileSync('/tmp/probe-img.bin', body);
        console.log('VERDICT: GOTO BODY IS THE IMAGE');
      } else {
        console.log('VERDICT: STILL BLOCKED');
      }
    }
  } catch (e) {
    console.log('ERROR:', String(e).slice(0, 200));
  }
}
await browser.close();
