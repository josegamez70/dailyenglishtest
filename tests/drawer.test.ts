import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the mobile menu scrolls inside the drawer and does not lock the page', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /viewport-fit=cover/);
  const start = html.indexOf('.menu-drawer');
  const rule = html.slice(start, html.indexOf('</style>', start));
  assert.match(rule, /height:\s*100vh;/);
  assert.match(rule, /height:\s*100dvh;/);
  assert.ok(rule.indexOf('100vh') < rule.indexOf('100dvh'));
  assert.match(rule, /overflow-y:\s*auto;/);
  assert.match(rule, /-webkit-overflow-scrolling:\s*touch;/);
  assert.match(rule, /overscroll-behavior:\s*contain;/);
  assert.match(rule, /padding-bottom:\s*env\(safe-area-inset-bottom\);/);
  const shell = readFileSync(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /className="menu-drawer /);
  assert.match(shell, /layout="drawer"/);
  assert.match(shell, /menu-item/);
  const css = readFileSync(new URL('../phase2.css', import.meta.url), 'utf8');
  assert.match(css, /\.menu-drawer \{[^}]*width:\s*min\(24rem/);
  assert.match(css, /\.menu-drawer \.menu-item[\s\S]*font-size:\s*0\.96rem/);
  const retro = readFileSync(new URL('../retro95.css', import.meta.url), 'utf8');
  assert.match(retro, /\.menu-drawer \.menu-item[\s\S]*font-size:\s*1\.36rem/);
  assert.equal(shell.includes('document.body.style.overflow'), false);
  assert.equal(shell.includes("touch-action: none"), false);
});
