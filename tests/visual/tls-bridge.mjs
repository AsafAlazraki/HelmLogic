/**
 * Local TLS bridge for the Claude sandbox agent proxy.
 *
 * WHY THIS EXISTS
 * The sandbox forces all outbound HTTPS through a TLS-intercepting agent
 * proxy (HTTPS_PROXY). Chromium 147's TLS ClientHello is RESET by that
 * proxy's MITM endpoint during the handshake — and unlike older builds,
 * NO combination of --disable-features (ECH / PostQuantumKeyAgreement /
 * X25519MLKEM768 / --ssl-version-max=tls1.2 / --disable-http2) fixes it.
 * curl / Node's TLS stack handshakes with the same proxy fine.
 *
 * So instead of pointing Chromium at the agent proxy directly, we point it
 * at this bridge:
 *
 *   Chromium --CONNECT--> bridge (terminates TLS with a throwaway
 *   self-signed cert; Playwright runs with ignoreHTTPSErrors so Chromium
 *   accepts it) --Node https via HTTPS_PROXY + CA bundle--> internet
 *
 * The bridge speaks HTTP/1.1 only (no h2 ALPN), forwards request/response
 * bodies streaming, and opens a fresh proxy tunnel per request (no
 * keep-alive) — slower but simple and correct. Plain-http proxying and
 * WebSocket upgrades are not supported (Firebase Auth/Firestore/Storage
 * all use fetch/XHR-style HTTPS).
 *
 * Started/stopped by tests/visual/global-setup.ts. Standalone:
 *   node tests/visual/tls-bridge.mjs [port]     (default 39555)
 * Requires: openssl on PATH (cert generation), HTTPS_PROXY set.
 */
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PORT = Number(process.argv[2] || process.env.VISUAL_TLS_BRIDGE_PORT || 39555);
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
if (!PROXY) {
  console.error('tls-bridge: HTTPS_PROXY not set — bridge not needed, exiting.');
  process.exit(1);
}
const proxyUrl = new URL(PROXY);
const CA_PATH = process.env.NODE_EXTRA_CA_CERTS || '/root/.ccr/ca-bundle.crt';
const ca = fs.existsSync(CA_PATH) ? fs.readFileSync(CA_PATH) : undefined;

// ── throwaway self-signed cert (Chromium runs with ignoreHTTPSErrors) ──
const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-tls-bridge-'));
const keyFile = path.join(certDir, 'key.pem');
const certFile = path.join(certDir, 'cert.pem');
execFileSync('openssl', [
  'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
  '-keyout', keyFile, '-out', certFile, '-days', '2',
  '-subj', '/CN=visual-tls-bridge.local',
], { stdio: 'ignore' });

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding',
  'upgrade', 'te', 'trailer', 'proxy-authenticate', 'proxy-authorization',
]);

/** Open a CONNECT tunnel through the agent proxy, then TLS-handshake it. */
function openTunnel(host, port) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: proxyUrl.hostname,
      port: proxyUrl.port,
      method: 'CONNECT',
      path: `${host}:${port}`,
      headers: { Host: `${host}:${port}` },
      timeout: 30000,
    });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        return reject(new Error(`proxy CONNECT ${host}:${port} → ${res.statusCode}`));
      }
      const tlsSock = tls.connect(
        { socket, servername: host, ca },
        () => resolve(tlsSock),
      );
      tlsSock.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(new Error('proxy CONNECT timeout')); });
    req.on('error', reject);
    req.end();
  });
}

// ── internal HTTPS server: receives Chromium's decrypted requests ──
const inner = https.createServer({
  key: fs.readFileSync(keyFile),
  cert: fs.readFileSync(certFile),
  ALPNProtocols: ['http/1.1'],
});

inner.on('request', async (req, res) => {
  const host = (req.headers.host || '').replace(/:443$/, '');
  if (!host) { res.writeHead(400); return res.end('missing host'); }
  let tlsSock;
  try {
    tlsSock = await openTunnel(host, 443);
  } catch (e) {
    res.writeHead(502);
    return res.end(`bridge tunnel failed: ${e.message}`);
  }
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
  }
  headers.connection = 'close';
  const out = https.request({
    createConnection: () => tlsSock,
    agent: false,
    host,
    method: req.method,
    path: req.url,
    headers,
  }, (outRes) => {
    const respHeaders = {};
    for (const [k, v] of Object.entries(outRes.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase())) respHeaders[k] = v;
    }
    res.writeHead(outRes.statusCode || 502, respHeaders);
    outRes.pipe(res);
  });
  out.on('error', (e) => {
    if (!res.headersSent) { res.writeHead(502); res.end(`bridge upstream error: ${e.message}`); }
    else res.destroy();
    tlsSock.destroy();
  });
  req.pipe(out);
});

// ── outer server: Chromium's proxy endpoint (CONNECT only) ──
const outer = http.createServer((req, res) => {
  // Plain-http proxying isn't supported (the agent proxy 405s it anyway).
  res.writeHead(502);
  res.end('tls-bridge: only CONNECT (https) is supported');
});
outer.on('connect', (req, clientSocket, head) => {
  clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
  clientSocket.setNoDelay(true);
  if (head?.length) clientSocket.unshift(head);
  // Hand the raw socket to the TLS server — it terminates Chromium's TLS
  // with the throwaway cert and parses HTTP/1.1 requests off it.
  inner.emit('connection', clientSocket);
  clientSocket.on('error', () => clientSocket.destroy());
});
outer.on('clientError', (_e, socket) => socket.destroy());

outer.listen(PORT, '127.0.0.1', () => {
  console.log(`tls-bridge: listening on 127.0.0.1:${PORT} → ${PROXY}`);
});
