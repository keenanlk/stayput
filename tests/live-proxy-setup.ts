import { createServer, type Server } from 'node:http';
import { connect } from 'node:net';
import { appendFileSync, writeFileSync } from 'node:fs';
import { LIVE_BLOCKED_HOSTS, LIVE_PROXY_PORT } from '../playwright.live.config';

/**
 * Local forward proxy for live runs. Every browser (Chromium and WebKit) is pointed at it,
 * it tunnels HTTPS and refuses the analytics hosts, so no event can leave the test browser.
 * Set PW_LIVE_HOST_LOG=<file> to record every host the browsers contacted.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const log = process.env.PW_LIVE_HOST_LOG;
  if (log) writeFileSync(log, '');
  const note = (verdict: string, host: string) => log && appendFileSync(log, `${verdict} ${host}\n`);
  const blocked = (host: string) => LIVE_BLOCKED_HOSTS.includes(host.toLowerCase());

  const server: Server = createServer((req, res) => {
    // Plain-HTTP requests are not expected from a https site; refuse rather than forward.
    note('REFUSED-HTTP', req.headers.host ?? '?');
    res.writeHead(403).end();
  });
  server.on('connect', (req, socket, head) => {
    const [host, port] = (req.url ?? '').split(':');
    if (blocked(host)) {
      note('BLOCKED', host);
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    note('ALLOWED', host);
    const upstream = connect(Number(port) || 443, host, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    const close = () => { upstream.destroy(); socket.destroy(); };
    upstream.on('error', close);
    socket.on('error', close);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(LIVE_PROXY_PORT, '127.0.0.1', resolve);
  });
  return async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); };
}
