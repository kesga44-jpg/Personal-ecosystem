import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/landing.css', ['landing.css', 'text/css; charset=utf-8']],
  ['/app-urls.js', ['app-urls.js', 'text/javascript; charset=utf-8']],
  ['/landing.js', ['landing.js', 'text/javascript; charset=utf-8']]
]);

createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1:4176').pathname;
  const file = files.get(pathname);

  if (!file) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  try {
    const contents = await readFile(resolve(file[0]));
    response.writeHead(200, { 'Content-Type': file[1] });
    response.end(contents);
  } catch (error) {
    console.error(`Unable to serve ${file[0]}`, error);
    response.writeHead(500);
    response.end('Unable to serve page');
  }
}).listen(4176, '127.0.0.1');
