// Tests for edge-functions/link-preview.ts, kept out of that folder: Netlify deploys each file in it as a function.
// Run with `npm run test:edge` (node --test, which strips the types).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyPreview, handle, isPreviewAgent, lookUpBuildName, previewFor } from '../edge-functions/link-preview.ts';

const INDEX = `<!doctype html><html><head>
  <title>DDO Gear Planner</title>
  <meta name="description"
    content="Plan your Dungeons &amp; Dragons Online gear.">
  <meta property="og:type" content="website">
  <meta property="og:title" content="DDO Gear Planner">
  <meta property="og:description"
    content="Plan your gear.">
</head><body></body></html>`;

const names: Record<string, string> = { Abc12345: 'Tank Paladin', Def67890: 'Tank Paladin v2' };
const lookUp = async (id: string) => names[id] ?? null;

function page(): Response {
  return new Response(INDEX, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-length': String(INDEX.length) } });
}

const DISCORD = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

describe('which requests get a preview', () => {
  it('knows the common unfurlers', () => {
    for (const agent of [DISCORD, 'Slackbot-LinkExpanding 1.0', 'facebookexternalhit/1.1 Facebot Twitterbot/1.0',
      'TelegramBot (like TwitterBot)', 'WhatsApp/2.23', 'XenForo/2.x (https://forums.ddo.com)', 'Mozilla/5.0 (compatible; Googlebot/2.1)']) {
      assert.equal(isPreviewAgent(agent), true, agent);
    }
  });

  it('leaves people alone', () => {
    assert.equal(isPreviewAgent(CHROME), false);
    assert.equal(isPreviewAgent(null), false);
  });
});

describe('what a preview says', () => {
  it('names a build, with or without its slug', async () => {
    assert.equal((await previewFor('/build/Abc12345', lookUp))?.title, 'Tank Paladin');
    assert.equal((await previewFor('/build/Abc12345/tank-paladin', lookUp))?.title, 'Tank Paladin');
  });

  it('names what a friend\'s list is for', async () => {
    assert.equal((await previewFor('/still-needed/Abc12345/tank-paladin', lookUp))?.title, 'What Tank Paladin still needs');
  });

  it('names both sides of a comparison, or the one there is', async () => {
    assert.equal((await previewFor('/compare/Abc12345/Def67890', lookUp))?.title, 'Tank Paladin vs Tank Paladin v2');
    assert.equal((await previewFor('/compare/Abc12345', lookUp))?.title, 'Compare Tank Paladin with another build');
    assert.equal((await previewFor('/compare', lookUp))?.title, 'Compare builds');
  });

  it('keeps a group list\'s name out of it', async () => {
    assert.equal((await previewFor('/list/Xyz00000', lookUp))?.title, 'A shared shopping list');
  });

  it('leaves the site\'s own tags for a build it can\'t name', async () => {
    assert.equal(await previewFor('/build/Missing1', lookUp), null);
    assert.equal(await previewFor('/', lookUp), null);
  });
});

describe('looking a build up', () => {
  const answering = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('takes the name from the public lookup', async () => {
    assert.equal(await lookUpBuildName('Abc12345', answering(200, { name: ' Tank Paladin ', blob: 'z1.x' })), 'Tank Paladin');
  });

  it('gives up on a private or missing build, an error, or a short id that isn\'t one', async () => {
    assert.equal(await lookUpBuildName('Abc12345', answering(404, { error: 'No build found' })), null);
    assert.equal(await lookUpBuildName('Abc12345', (async () => { throw new Error('down'); }) as unknown as typeof fetch), null);
    let called = false;
    assert.equal(await lookUpBuildName('../users/me', (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch), null);
    assert.equal(called, false);
  });
});

describe('the page it serves', () => {
  it('rewrites the title, description and Open Graph tags, escaping the name', () => {
    const html = applyPreview(INDEX, { title: 'Tom & Jerry <"Tank">', description: 'Gear.' }, 'https://ddo-gear-planner.com/build/Abc12345');

    assert.match(html, /<title>Tom &amp; Jerry &lt;&quot;Tank&quot;&gt; – DDO Gear Planner<\/title>/);
    assert.match(html, /<meta property="og:title" content="Tom &amp; Jerry &lt;&quot;Tank&quot;&gt;">/);
    assert.match(html, /<meta name="description"\s+content="Gear.">/);
    assert.match(html, /<meta property="og:description"\s+content="Gear.">/);
    assert.match(html, /<meta property="og:url" content="https:\/\/ddo-gear-planner.com\/build\/Abc12345">/);
  });

  it('serves a crawler the rewritten page', async () => {
    const response = await handle(new Request('https://ddo-gear-planner.com/build/Abc12345/tank-paladin', { headers: { 'user-agent': DISCORD } }),
      { next: async () => page() }, lookUp);
    const html = await response.text();

    assert.match(html, /<meta property="og:title" content="Tank Paladin">/);
    assert.equal(response.headers.get('content-length'), null);
    assert.equal(response.headers.get('vary'), 'User-Agent');
  });

  it('serves a person the page untouched, without a lookup', async () => {
    let looked = false;
    const response = await handle(new Request('https://ddo-gear-planner.com/build/Abc12345', { headers: { 'user-agent': CHROME } }),
      { next: async () => page() }, async () => { looked = true; return 'x'; });

    assert.equal(await response.text(), INDEX);
    assert.equal(looked, false);
  });
});
