import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDarkTheme, isThemeChoice } from '../themeChoice.ts';

test('retro 95 is optional and does not turn on dark mode', () => {
  assert.equal(isThemeChoice('retro95'), true);
  assert.equal(isThemeChoice('nope'), false);
  assert.equal(isDarkTheme('light', true), false);
  assert.equal(isDarkTheme('dark', false), true);
  assert.equal(isDarkTheme('system', true), true);
  assert.equal(isDarkTheme('system', false), false);
  assert.equal(isDarkTheme('retro95', true), false);
  const css = readFileSync(new URL('../retro95.css', import.meta.url), 'utf8');
  assert.match(css, /html\[data-theme="retro95"\]/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /VT323/);
  assert.equal(css.includes('html:not([data-theme'), false);
});
