#!/usr/bin/env node
/*
 * Builds demo/index.html: one self-contained HTML file with the CSS and JS
 * inlined (no other files needed). Used for the showcase page and for sharing
 * the planner as a single file.
 *   node tools/build-demo.js                 -> demo/index.html
 *   node tools/build-demo.js --fragment out  -> also writes a body-only fragment
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const TITLE = 'Showcase · Hulog Paluwagan Planner';

let html = read('index.html');
const css = read('css/hulog.css');
const js = read('js/hulog-core.js') + '\n' + read('js/hulog-app.js');
const icon = 'data:image/svg+xml,' + encodeURIComponent(read('favicon.svg').trim());

html = html
  .replace(/<!--INLINE-CSS-->[\s\S]*?<!--\/INLINE-CSS-->/, () => '<style>\n' + css + '\n</style>')
  .replace(/<!--INLINE-JS-->[\s\S]*?<!--\/INLINE-JS-->/, () => '<script>\n' + js.replace(/<\/script/gi, '<\\/script') + '\n</script>')
  .replace('data-build="site"', 'data-build="standalone"')
  .replace(/<title>[^<]*<\/title>/, '<title>' + TITLE + '</title>')
  .replace('href="favicon.svg"', 'href="' + icon + '"')
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<meta property="og:image"[^>]*>/, '');

fs.mkdirSync(path.join(root, 'demo'), { recursive: true });
fs.writeFileSync(path.join(root, 'demo', 'index.html'), html);
console.log('demo/index.html', Buffer.byteLength(html), 'bytes');

const i = process.argv.indexOf('--fragment');
if (i > 0 && process.argv[i + 1]) {
  // Artifact publishing wraps the page in its own <html>/<head>/<body>.
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta charset[^>]*>|<meta name="viewport"[^>]*>/g, '')
    .replace(/<title>[^<]*<\/title>/, '<title>' + TITLE + '</title>\n<meta name="claude:viewport-fit-sides" content="cover">');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  const frag = head.replace(/^\s*<title>/, '<title>') + '\n<script>document.documentElement.setAttribute("data-build","standalone");</script>\n' + body;
  // Put the title first so it is within the first 8 KB.
  const t = frag.match(/<title>[\s\S]*?content="cover">/)[0];
  fs.writeFileSync(process.argv[i + 1], t + '\n' + frag.replace(t, ''));
  console.log('fragment', process.argv[i + 1]);
}
