import {build} from 'esbuild';import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
await build({entryPoints:[resolve(root,'server/worker.mjs')],outfile:resolve(root,'.build/test-api/worker.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
console.log('Bundled the separate mobile test deletion worker. No deployment or account request performed.');
