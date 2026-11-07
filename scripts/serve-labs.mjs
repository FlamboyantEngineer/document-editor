#!/usr/bin/env node
// Plain static file server for labs/. Labs need nothing beyond static serving.
//   node scripts/serve-labs.mjs [--port $LABS_PORT] [--host 127.0.0.1] [--dir labs]

import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { LABS_HOST, LABS_PORT } from './lib/labs.mjs';
import { option, root } from './lib/script.mjs';

const port = Number(option('port', String(LABS_PORT)));
const host = option('host', LABS_HOST);
const dir = realpathSync(resolve(root, option('dir', 'labs')));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((request, response) => {
  let pathname;
  try {
    const url = new URL(request.url ?? '/', `http://${host}`);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400, { 'content-type': 'text/plain' }).end('Bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = normalize(join(dir, pathname));
  if (file !== dir && !file.startsWith(dir + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  let stat;
  let realFile;
  try {
    realFile = realpathSync(file);
    if (realFile !== dir && !realFile.startsWith(dir + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    stat = statSync(realFile);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  if (!stat.isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  const extension = extname(file).toLowerCase();
  const type = TYPES[extension];
  if (!type) {
    // A guessed type breaks the files that need theirs, such as WebAssembly, so fail loudly.
    console.error(`No content type for ${extension} files (${pathname}); add one to TYPES.`);
    response
      .writeHead(500, { 'content-type': 'text/plain' })
      .end(`No content type for ${extension} files`);
    return;
  }
  response.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    'cache-control': 'no-store',
  });
  createReadStream(realFile).pipe(response);
});

server.listen(port, host, () => {
  console.log(
    `Serving ${dir} at http://${host}:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}/`,
  );
});
