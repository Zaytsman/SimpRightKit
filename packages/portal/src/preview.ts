// preview: serves a portal site on this machine (127.0.0.1 only), to look at a locally published site before it goes
// out, or (--sample) the sample site this package ships, before there's a site of your own. The sample has the data of
// a made-up project; its pages are this package's, so the preview shows the current pages with the sample's data.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES_DIR } from './site.ts';

/** The sample site's data (no pages): built from the kit's sample project by its scripts/sample-site.ts. */
export const SAMPLE_DIR = fileURLToPath(new URL('../sample/', import.meta.url));
export const DEFAULT_PORT = 4173;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
};

/** The sample's pages: the URL of each one in a site, and the file of this package that is that page. */
function samplePage(urlPath: string): string | undefined {
  if (urlPath === '/index.html') return path.join(PAGES_DIR, 'dashboard.html');
  if (/^\/test-cases\/[^/]+\/index\.html$/.test(urlPath)) return path.join(PAGES_DIR, 'test-cases.html');
  if (urlPath === '/bugs/index.html') return path.join(PAGES_DIR, 'bugs.html');
  return undefined;
}

export interface PreviewOptions {
  /** The site folder to serve; left out with `sample`. */
  site?: string;
  /** Serve the sample site with this package's pages. */
  sample?: boolean;
  port?: number;
}

/** Starts the preview server; resolves once it listens. */
export function preview(options: PreviewOptions): Promise<Server> {
  const root = path.resolve(options.sample ? SAMPLE_DIR : (options.site ?? '.'));
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`No site folder at ${root}.`);

  const server = createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    let urlPath: string;
    try {
      urlPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const file = path.join(root, urlPath);
    // Nothing outside the site folder.
    if (file !== root && !file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    // A folder: its index.html, with a trailing slash so the page's relative links resolve inside it.
    const isFolder = existsSync(file) && statSync(file).isDirectory();
    if (isFolder && !urlPath.endsWith('/')) {
      response.writeHead(301, { location: `${urlPath}/` }).end();
      return;
    }
    const pagePath = isFolder || urlPath.endsWith('/') ? `${urlPath.replace(/\/$/, '')}/index.html` : urlPath;
    const target = (options.sample ? samplePage(pagePath) : undefined) ?? path.join(root, pagePath);
    if (!existsSync(target) || !statSync(target).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`Not found: ${urlPath}\n`);
      return;
    }
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
      'content-length': statSync(target).size,
      'cache-control': 'no-store',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(target).pipe(response);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? DEFAULT_PORT, '127.0.0.1', () => resolve(server));
  });
}
