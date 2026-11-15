import test from 'node:test';
import assert from 'node:assert/strict';
import { invitePreviewHtml, invitePreviewMeta, isInviteCrawler, publicAcademyName } from '../invitePreview.ts';

test('a chat app gets an invite card whose only link is the join URL', () => {
  const joinUrl = 'https://dailyenglishtest.es/join?code=4WFXV3ZL';
  const meta = invitePreviewMeta({ joinUrl, academyName: 'Academia Demo' });
  assert.equal(meta.title, 'Invitation to join Academia Demo on Daily English Test');
  assert.equal(meta.url, joinUrl);
  assert.equal(meta.description.includes('http'), false);
  const html = invitePreviewHtml({ joinUrl, academyName: 'Academia Demo' });
  assert.match(html, /property="og:url" content="https:\/\/dailyenglishtest\.es\/join\?code=4WFXV3ZL"/);
  assert.match(html, /name="twitter:url" content="https:\/\/dailyenglishtest\.es\/join\?code=4WFXV3ZL"/);
  assert.equal(html.includes('og:image'), false);
  assert.equal(html.includes('canonical'), false);
  assert.equal((html.match(/https:\/\/dailyenglishtest\.es\/join\?code=4WFXV3ZL/g) || []).length >= 2, true);
  assert.equal(html.includes('https://dailyenglishtest.es/"'), false);
  assert.equal(html.includes('https://dailyenglishtest.es<'), false);
  const generic = invitePreviewMeta({ joinUrl, academyName: publicAcademyName('see www.example.com') });
  assert.equal(generic.title, 'Academy invitation');
  assert.equal(isInviteCrawler('WhatsApp/2.23.20'), true);
  assert.equal(isInviteCrawler('facebookexternalhit/1.1'), true);
  assert.equal(isInviteCrawler('Mozilla/5.0'), false);
});
