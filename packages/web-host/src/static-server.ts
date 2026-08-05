/**
 * WebUI static server.
 *
 * Serves out/renderer/ as the SPA and reverse-proxies /api/*, /ws, /api/stt/stream,
 * /login and /logout to aioncore. All auth goes to backend's aionui-auth crate;
 * /login and /logout are aionui-auth's top-level paths, the rest live under
 * /api/auth/*. /ws and /api/stt/stream are WebSocket/stream upgrades spliced at
 * TCP level; /api/stt/stream is the STT streaming endpoint.
 *
 * Design: Node native http + serve-handler. No Express. No business routes.
 */

import http, {
  type ClientRequest,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import net, { type Socket } from 'node:net';
import serveHandler from 'serve-handler';

export type OfficeProxyFrameOptions = 'preserve' | 'sameorigin' | 'deny' | 'remove';

export type StaticServerOptions = {
  staticDir: string;
  backendPort: number;
  port?: number;
  allowRemote?: boolean;
  /**
   * Controls X-Frame-Options only for Office/PPT preview proxy responses.
   * Default 'preserve' keeps the backend-provided header unchanged.
   */
  officeProxyFrameOptions?: OfficeProxyFrameOptions;
};

export type StaticServerHandle = {
  port: number;
  url: string;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  stop: () => Promise<void>;
};

const DEFAULT_PORT = 25808;
const OFFICE_PROXY_ROOT_RE = /^(\/api\/(?:office-watch-proxy|ppt-proxy)\/\d+)\/(\?.*)?$/;
const OFFICE_PROXY_PATH_RE = /^\/api\/(?:office-watch-proxy|ppt-proxy)\/\d+(?:[/?]|$)/;

function isBenignSocketClosedError(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  const message = typeof candidate?.message === 'string' ? candidate.message : '';
  return code === 'ERR_SOCKET_CLOSED' || code === 'ECONNRESET' || code === 'EPIPE' || /socket is closed/i.test(message);
}

function canWriteResponse(res: ServerResponse): boolean {
  return !res.destroyed && !res.writableEnded && res.socket !== null && !res.socket.destroyed;
}

function forwardRequestBody(req: IncomingMessage, proxy: ClientRequest): void {
  const abort = (): void => {
    req.pause();
    proxy.destroy();
  };
  const write = (chunk: Buffer): void => {
    if (proxy.destroyed || proxy.writableEnded) {
      abort();
      return;
    }
    try {
      if (!proxy.write(chunk)) {
        req.pause();
        proxy.once('drain', () => {
          if (!proxy.destroyed && !proxy.writableEnded) req.resume();
        });
      }
    } catch (error) {
      if (!isBenignSocketClosedError(error)) {
        console.error('[web-host] proxy request write error:', error);
      }
      abort();
    }
  };
  const end = (): void => {
    if (proxy.destroyed || proxy.writableEnded) return;
    try {
      proxy.end();
    } catch (error) {
      if (!isBenignSocketClosedError(error)) {
        console.error('[web-host] proxy request end error:', error);
      }
      abort();
    }
  };

  req.on('data', write);
  req.once('end', end);
  req.once('aborted', abort);
  req.once('error', abort);
}

function forwardBackendResponse(proxyRes: IncomingMessage, res: ServerResponse): void {
  const downstreamSocket = res.socket;
  let settled = false;
  const cleanup = (): void => {
    proxyRes.removeListener('data', write);
    proxyRes.removeListener('end', end);
    proxyRes.removeListener('error', onUpstreamError);
    res.removeListener('error', onResponseError);
    res.removeListener('close', onResponseClose);
    downstreamSocket?.removeListener('close', abort);
    downstreamSocket?.removeListener('error', abort);
  };
  const abort = (): void => {
    if (settled) return;
    settled = true;
    cleanup();
    proxyRes.pause();
    proxyRes.destroy();
  };
  const write = (chunk: Buffer): void => {
    if (!canWriteResponse(res)) {
      abort();
      return;
    }
    try {
      if (!res.write(chunk)) {
        proxyRes.pause();
        res.once('drain', () => {
          if (canWriteResponse(res)) proxyRes.resume();
          else abort();
        });
      }
    } catch (error) {
      if (!isBenignSocketClosedError(error)) {
        console.error('[web-host] proxy response write error:', error);
      }
      abort();
    }
  };
  const end = (): void => {
    if (!canWriteResponse(res)) {
      abort();
      return;
    }
    try {
      res.end();
      settled = true;
      cleanup();
    } catch (error) {
      if (!isBenignSocketClosedError(error)) {
        console.error('[web-host] proxy response end error:', error);
      }
      abort();
    }
  };
  const onUpstreamError = (): void => {
    if (settled) return;
    settled = true;
    cleanup();
    if (!res.destroyed) res.destroy();
  };
  const onResponseError = (error: Error): void => {
    if (!isBenignSocketClosedError(error)) {
      console.error('[web-host] proxy response socket error:', error);
    }
    abort();
  };
  const onResponseClose = (): void => {
    if (!res.writableEnded) abort();
  };

  proxyRes.on('data', write);
  proxyRes.once('end', end);
  proxyRes.once('error', onUpstreamError);
  res.once('error', onResponseError);
  res.once('close', onResponseClose);
  downstreamSocket?.once('close', abort);
  downstreamSocket?.once('error', abort);
}

function getLanIP(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

function forwardToBackend(
  req: IncomingMessage,
  res: ServerResponse,
  backendPort: number,
  officeProxyFrameOptions: OfficeProxyFrameOptions
): void {
  const requestPath = req.url ? normalizeBackendProxyPath(req.url) : req.url;
  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: backendPort,
    path: requestPath,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${backendPort}` },
  };
  const proxy = http.request(options, (proxyRes) => {
    if (!canWriteResponse(res)) {
      proxyRes.destroy();
      return;
    }
    const headers = applyOfficeProxyFrameOptions(proxyRes.headers, requestPath, officeProxyFrameOptions);
    try {
      res.writeHead(proxyRes.statusCode ?? 502, headers);
    } catch (error) {
      proxyRes.destroy();
      if (!isBenignSocketClosedError(error)) {
        console.error('[web-host] proxy response header error:', error);
      }
      return;
    }
    forwardBackendResponse(proxyRes, res);
  });
  proxy.on('error', () => {
    if (!canWriteResponse(res)) return;
    try {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'BACKEND_UNREACHABLE' }));
      } else {
        res.destroy();
      }
    } catch (error) {
      if (!isBenignSocketClosedError(error)) {
        console.error('[web-host] proxy failure response error:', error);
      }
    }
  });
  forwardRequestBody(req, proxy);
}

export function normalizeBackendProxyPath(url: string): string {
  return url.replace(OFFICE_PROXY_ROOT_RE, '$1$2');
}

export function normalizeOfficeProxyFrameOptions(value?: string | null): OfficeProxyFrameOptions {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case 'sameorigin':
    case 'same-origin':
      return 'sameorigin';
    case 'deny':
      return 'deny';
    case 'remove':
    case 'none':
      return 'remove';
    default:
      return 'preserve';
  }
}

export function applyOfficeProxyFrameOptions(
  headers: OutgoingHttpHeaders,
  requestPath: string | undefined,
  mode: OfficeProxyFrameOptions
): OutgoingHttpHeaders {
  if (!requestPath || mode === 'preserve' || !OFFICE_PROXY_PATH_RE.test(requestPath)) {
    return headers;
  }

  const next: OutgoingHttpHeaders = { ...headers };
  delete next['x-frame-options'];
  delete next['X-Frame-Options'];

  if (mode === 'remove') {
    return next;
  }

  next['x-frame-options'] = mode === 'sameorigin' ? 'SAMEORIGIN' : 'DENY';
  return next;
}

// Max bytes we peek before forcing a routing decision. An HTTP request-line
// on its own is typically < 100 bytes; a full header block is < 2 KB. If we
// haven't seen a newline after 4 KB the client is sending something weird —
// hand it to the internal HTTP server and let it return 400.
const PEEK_LIMIT_BYTES = 4096;

/**
 * Splice `client` to a TCP endpoint on `targetPort`. Any bytes already read
 * from `client` during peek are replayed to the upstream as the first write,
 * so the endpoint sees the full HTTP request as-sent.
 */
function spliceToTcpEndpoint(client: Socket, targetPort: number, initialBytes: Buffer): void {
  client.pause();
  client.setNoDelay(true);
  client.setKeepAlive(true);
  client.setTimeout(0);
  const upstream = net.connect({ host: '127.0.0.1', port: targetPort });
  upstream.setNoDelay(true);
  upstream.setKeepAlive(true);
  upstream.once('connect', () => {
    if (initialBytes.length > 0) upstream.write(initialBytes);
    upstream.pipe(client);
    client.pipe(upstream);
    client.resume();
  });
  const tearDown = (): void => {
    client.destroy();
    upstream.destroy();
  };
  upstream.on('error', tearDown);
  client.on('error', tearDown);
  upstream.on('close', tearDown);
  client.on('close', tearDown);
}

function forwardUpgradeToBackend(client: Socket, targetPort: number, initialBytes: Buffer): void {
  client.pause();
  const raw = initialBytes.toString('latin1');
  const headerEnd = raw.indexOf('\r\n\r\n');
  const headerBlock = headerEnd >= 0 ? raw.slice(0, headerEnd) : raw;
  const [requestLine = '', ...headerLines] = headerBlock.split('\r\n');
  const [method = 'GET', path = '/'] = requestLine.split(/\s+/);
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }

  const proxy = http.request({
    hostname: '127.0.0.1',
    port: targetPort,
    path,
    method,
    headers: { ...headers, host: `127.0.0.1:${targetPort}` },
  });

  const tearDown = (): void => {
    client.destroy();
    proxy.destroy();
  };

  proxy.on('upgrade', (res, upstream, head) => {
    client.write(`HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage}\r\n`);
    for (const [name, value] of Object.entries(res.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) client.write(`${name}: ${item}\r\n`);
      } else if (value !== undefined) {
        client.write(`${name}: ${value}\r\n`);
      }
    }
    client.write('\r\n');
    if (head.length > 0) client.write(head);
    upstream.pipe(client);
    client.pipe(upstream);
    client.resume();
    upstream.on('error', tearDown);
    client.on('error', tearDown);
    upstream.on('close', () => client.destroy());
    client.on('close', () => upstream.destroy());
  });

  proxy.on('response', (res) => {
    client.write(`HTTP/${res.httpVersion} ${res.statusCode ?? 502} ${res.statusMessage}\r\n`);
    for (const [name, value] of Object.entries(res.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) client.write(`${name}: ${item}\r\n`);
      } else if (value !== undefined) {
        client.write(`${name}: ${value}\r\n`);
      }
    }
    client.write('\r\n');
    res.pipe(client);
  });
  proxy.on('error', tearDown);
  proxy.end();
}

/**
 * Decide routing from the first chunk of an incoming HTTP connection:
 *  - `true`  → `GET /ws[...] HTTP/1.x` or `GET /api/stt/stream[...] HTTP/1.x` (WebSocket/stream upgrades), splice to backend
 *  - `false` → any other HTTP method / path, hand to internal HTTP server
 *  - `null`  → need more bytes (no CRLF yet)
 *
 * We only check the request-line; `Upgrade: websocket` is not strictly
 * required — the backend will reject a non-upgrade GET on these paths on its own.
 * Keeping the rule simple means we can decide after the first ~50 bytes
 * instead of waiting for the full header block.
 */
function peekWsRoute(buf: Buffer): boolean | null {
  const newlineIdx = buf.indexOf(0x0a); // \n
  if (newlineIdx < 0) return null;
  const firstLine = buf.slice(0, newlineIdx).toString('ascii');
  const isWsRoute = /^GET\s+\/(?:ws|api\/stt\/stream)(?:\?[^\s]*)?\s+HTTP\/1\.[01]\r?$/.test(firstLine);
  if (!isWsRoute) return false;
  return buf.indexOf('\r\n\r\n') >= 0 ? true : null;
}

export async function startStaticServer(opts: StaticServerOptions): Promise<StaticServerHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const allowRemote = opts.allowRemote === true;
  const host = allowRemote ? '0.0.0.0' : '127.0.0.1';
  const officeProxyFrameOptions = opts.officeProxyFrameOptions ?? 'preserve';

  // The HTTP server listens only on loopback — user traffic hits the outer
  // net.Server first. We route to this server for everything except WS
  // upgrades and STT stream upgrades, which go straight to the backend via a raw TCP splice.
  //
  // Why two listeners instead of using `http.Server`'s native `upgrade` event:
  // bun 1.3's http-compat layer does not faithfully forward writes on the
  // socket delivered to the `upgrade` handler, so the backend's 101 response
  // never reaches the browser (see #2824). Making the outer listener pure
  // TCP avoids touching that code path on both bun and node.
  const httpSockets = new Set<Socket>();
  const tcpSockets = new Set<Socket>();

  const http_server: Server = http.createServer(async (req, res) => {
    try {
      if (!req.url || !req.method) {
        res.writeHead(400).end();
        return;
      }

      // /api/* — reverse proxy to backend (includes /api/auth/*).
      // /login and /logout are aionui-auth's top-level auth endpoints: proxy them too
      // so WebUI browser clients reach the backend without a path-rewrite.
      if (req.url.startsWith('/api/') || req.url.startsWith('/api?') || req.url === '/login' || req.url === '/logout') {
        forwardToBackend(req, res, opts.backendPort, officeProxyFrameOptions);
        return;
      }

      // Hashed assets must return a real 404 when an open tab still references
      // a chunk removed by an upgrade. Returning index.html here turns a
      // recoverable Vite preload error into a misleading MIME failure.
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      const isAssetRequest = pathname.startsWith('/assets/');

      if (isAssetRequest) {
        const assetPath = path.resolve(opts.staticDir, `.${pathname}`);
        try {
          const assetStat = await stat(assetPath);
          if (!assetStat.isFile()) throw new Error('Asset path is not a file');
        } catch {
          res.writeHead(404, {
            'cache-control': 'no-store',
            'content-type': 'text/plain; charset=utf-8',
          });
          res.end('Not found');
          return;
        }
      }

      // static files + SPA fallback
      await serveHandler(req, res, {
        public: opts.staticDir,
        rewrites: isAssetRequest ? [] : [{ source: '**', destination: '/index.html' }],
        headers: [
          {
            source: 'index.html',
            headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
          },
          {
            source: 'sw.js',
            headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
          },
          {
            source: 'assets/**',
            headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
          },
        ],
      });
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'INTERNAL_ERROR' }));
      } else {
        res.destroy();
      }
    }
  });
  http_server.on('connection', (socket: Socket) => {
    httpSockets.add(socket);
    socket.on('close', () => httpSockets.delete(socket));
  });

  // Internal HTTP server — 127.0.0.1 ephemeral port, never visible to the user.
  await new Promise<void>((resolve, reject) => {
    http_server.once('error', reject);
    http_server.listen(0, '127.0.0.1', () => {
      http_server.off('error', reject);
      resolve();
    });
  });
  const internalPort = (http_server.address() as { port: number } | null)?.port;
  if (!internalPort) {
    throw new Error('internal HTTP server failed to bind to a port');
  }

  // User-facing listener: inspect the first line of every TCP connection and
  // route to either the backend (for /ws and /api/stt/stream upgrades) or the internal HTTP
  // server (everything else). Both routes use raw TCP splice — no reliance
  // on http.Server's upgrade event.
  const tcp_server = net.createServer((client: Socket) => {
    tcpSockets.add(client);
    client.on('close', () => tcpSockets.delete(client));
    let peeked = Buffer.alloc(0);
    let settled = false;
    const cleanup = (): void => {
      if (settled) return;
      settled = true;
      client.removeListener('data', onData);
      client.removeListener('error', onEarlyError);
      client.removeListener('end', onEarlyEnd);
    };
    const onData = (chunk: Buffer): void => {
      peeked = Buffer.concat([peeked, chunk]);
      const decision = peekWsRoute(peeked);
      if (decision === null && peeked.length < PEEK_LIMIT_BYTES) return;
      cleanup();
      if (decision === true) {
        forwardUpgradeToBackend(client, opts.backendPort, peeked);
      } else {
        spliceToTcpEndpoint(client, internalPort, peeked);
      }
    };
    const onEarlyError = (): void => {
      cleanup();
      client.destroy();
    };
    const onEarlyEnd = (): void => {
      // Client closed before we saw a request line — nothing to route.
      cleanup();
      client.destroy();
    };
    client.on('data', onData);
    client.on('error', onEarlyError);
    client.on('end', onEarlyEnd);
    client.resume();
  });

  await new Promise<void>((resolve, reject) => {
    tcp_server.once('error', reject);
    tcp_server.listen(port, host, () => {
      tcp_server.off('error', reject);
      resolve();
    });
  });

  const actualPort = (tcp_server.address() as { port: number } | null)?.port ?? port;
  const lanIP = allowRemote ? (getLanIP() ?? undefined) : undefined;
  const localUrl = `http://127.0.0.1:${actualPort}`;
  const networkUrl = lanIP ? `http://${lanIP}:${actualPort}` : undefined;

  return {
    port: actualPort,
    url: networkUrl ?? localUrl,
    localUrl,
    networkUrl,
    lanIP,
    stop: () =>
      new Promise<void>((resolve) => {
        for (const socket of tcpSockets) socket.destroy();
        for (const socket of httpSockets) socket.destroy();
        tcp_server.close(() => {
          http_server.close(() => resolve());
        });
      }),
  };
}

export async function stopStaticServer(handle: StaticServerHandle): Promise<void> {
  await handle.stop();
}
