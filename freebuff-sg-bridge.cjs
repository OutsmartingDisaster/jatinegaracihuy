// freebuff-sg-bridge.js
// Local HTTP proxy on 127.0.0.1:8888 that forwards through a SOCKS5 proxy on 127.0.0.1:1080.
// Lets Node-based apps (freebuff) use a plain http:// proxy exiting via Singapore.
const http = require('http');
const net = require('net');
const SOCKS_HOST = '127.0.0.1';
const SOCKS_PORT = 1080;
const SOCKET_TIMEOUT = 120_000;

function socksConnect(host, port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(SOCKS_PORT, SOCKS_HOST, () => {
      const hostBuf = Buffer.from(host, 'utf8');
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(port, 0);
      sock.write(Buffer.from([0x05, 0x01, 0x00]));
      sock.once('data', (g) => {
        if (g[1] !== 0x00) return reject(new Error('SOCKS auth rejected'));
        const req = Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]),
          hostBuf,
          portBuf,
        ]);
        sock.write(req);
        sock.once('data', (r) => {
          if (r[1] !== 0x00) return reject(new Error('SOCKS CONNECT failed: ' + r[1]));
          sock.setTimeout(SOCKET_TIMEOUT);
          resolve(sock);
        });
      });
    });
    sock.on('error', reject);
    sock.setTimeout(10_000, () => { sock.destroy(); reject(new Error('SOCKS connect timeout')); });
  });
}

function tunnelError(client, target, msg) {
  try { client.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch (_) {}
  client.end();
  if (target) target.destroy();
}

// HTTPS CONNECT tunnel
const server = http.createServer();
server.on('connect', (req, clientSocket) => {
  const idx = req.url.lastIndexOf(':');
  if (idx === -1) { clientSocket.end(); return; }
  const host = req.url.slice(0, idx).replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  const port = parseInt(req.url.slice(idx + 1), 10) || 443;
  socksConnect(host, port)
    .then((sock) => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      sock.on('error', () => { try { clientSocket.end(); } catch (_) {} });
      clientSocket.on('error', () => { try { sock.end(); } catch (_) {} });
      sock.pipe(clientSocket);
      clientSocket.pipe(sock);
    })
    .catch(() => tunnelError(clientSocket, null));
});

// Bare GET for http:// proxy (freebuff uses CONNECT almost exclusively)
server.on('request', (req, res) => {
  const u = new URL(req.url);
  socksConnect(u.hostname, parseInt(u.port, 10) || 80)
    .then((sock) => {
      const headers = [`${req.method} ${u.pathname}${u.search || ''} HTTP/1.1`, `Host: ${u.host}`, 'Connection: close'];
      sock.write(headers.join('\r\n') + '\r\n\r\n');
      sock.on('error', () => { try { res.end(); } catch (_) {} });
      res.on('error', () => { try { sock.end(); } catch (_) {} });
      sock.pipe(res);
    })
    .catch((e) => { res.writeHead(502); res.end('bridge error: ' + e.message); });
});

server.on('error', (err) => {
  console.error('[bridge] fatal:', err.message);
  process.exit(1);
});

server.listen(8888, '127.0.0.1', () => {
  console.log('[bridge] HTTP proxy listening on 127.0.0.1:8888 -> SOCKS5 127.0.0.1:1080');
});
