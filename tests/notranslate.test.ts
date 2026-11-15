import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the site asks browsers not to translate the English exercises', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<html[^>]*\slang="en"/);
  assert.match(html, /<html[^>]*\stranslate="no"/);
  assert.match(html, /<meta name="google" content="notranslate"\s*\/?>/);
  assert.match(html, /<div id="root"[^>]*class="notranslate"/);
  assert.match(html, /<div id="root"[^>]*translate="no"/);
  const boot = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
  assert.match(boot, /setAttribute\('translate', 'no'\)/);
  assert.match(boot, /classList\.add\('notranslate'\)/);
});
