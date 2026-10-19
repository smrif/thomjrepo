import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const sandbox = { window: {}, location: { protocol: 'http:', origin: 'http://127.0.0.1:8000' } };
vm.runInNewContext(await readFile(new URL('supabase-config.js', root), 'utf8'), sandbox);
const { url, publishableKey } = sandbox.window.WHOSE_DAY_SUPABASE;
if (new URL(url).protocol !== 'https:' || !publishableKey.startsWith('sb_publishable_')) throw new Error('Invalid public project configuration.');
const files = new Map([
  ['/', ['index.html', 'text/html']], ['/qa.js', ['qa.js', 'text/javascript']],
  ['/checks.mjs', ['checks.mjs', 'text/javascript']], ['/styles.css', ['styles.css', 'text/css']],
  ['/vendor/supabase.js', [new URL('node_modules/@supabase/supabase-js/dist/umd/supabase.js', root), 'text/javascript']]
]);

export function createQaServer() {
  const server = createServer(async (request, response) => {
    const headers = {
      'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
      'content-security-policy': `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' ${url}; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`
    };
    const pathname = new URL(request.url, 'http://127.0.0.1:8000').pathname;
    if (request.headers.host !== `127.0.0.1:${server.address().port}` || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(403, headers).end(); return;
    }
    try {
      let content, type;
      if (pathname === '/config.js') {
        content = `window.QA_CONFIG=${JSON.stringify({ url, publishableKey })};`; type = 'text/javascript';
      } else {
        const file = files.get(pathname);
        if (!file) { response.writeHead(404, headers).end(); return; }
        type = file[1];
        content = await readFile(file[0] instanceof URL ? file[0] : new URL(file[0], import.meta.url));
      }
      response.writeHead(200, { ...headers, 'content-type': `${type}; charset=utf-8` });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch { response.writeHead(500, headers).end('QA file unavailable.'); }
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createQaServer();
  server.on('error', () => { console.error('Could not bind 127.0.0.1:8000. Do not stop another server or change auth redirects blindly.'); process.exitCode = 1; });
  server.listen(8000, '127.0.0.1', () => console.log('Local security QA: http://127.0.0.1:8000/ (not included in production builds).'));
}
