// Run against a production preview: npm run test:browser
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { detailShard } from './src/catalog-shards.mjs';

const url = new URL(process.env.GITSCOUR_TEST_URL || 'http://localhost:4173/');
const packed = JSON.parse(await readFile(new URL('./dist/catalog-packed.json', import.meta.url)));
const history = JSON.parse(await readFile(new URL('./dist/changelog.json', import.meta.url)));
const facets = JSON.parse(await readFile(new URL('./dist/facets.json', import.meta.url)));
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fmt = (n) => n.toLocaleString('en-US');
const total = fmt(packed.rows.length);
const firstSplit = packed.rows.find((r) => detailShard(packed.domains[r[6]], r[0], packed.shard_parts).includes('--')) || packed.rows[0];
const repoName = `${firstSplit[2]} / ${firstSplit[1]}`;
const shard = detailShard(packed.domains[firstSplit[6]], firstSplit[0], packed.shard_parts);
const deep = JSON.parse(await readFile(new URL(`./dist/data/details/${shard}.json`, import.meta.url)))[firstSplit[0]];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const problems = [];
context.on('page', (p) => p.on('pageerror', (e) => problems.push(e.message)));
page.on('pageerror', (e) => problems.push(e.message));
const network = [];
page.on('response', (r) => { if (!r.ok() && r.url().startsWith(url.origin)) network.push(`${r.status()} ${r.url()}`); });
const read = (label) => page.getByRole('button', { name: label, exact: typeof label === 'string' });
const nav = (label) => page.locator('header').getByRole('button', { name: label, exact: true });
const show = async (l) => l.waitFor({ state: 'visible' });
const count = (n) => page.locator('main strong').getByText(fmt(n), { exact: true });
const load = async (p, query = '') => {
  await p.goto(new URL(query || './', url).href, { timeout: 45_000 });
  await show(p.getByText(`${total} Repos`, { exact: true }));
};

try {
  await load(page);
  await show(page.getByText(`Snapshot ${history.generated}`, { exact: true }));
  await show(count(packed.rows.length));
  await page.getByRole('button', { name: /Load More Repositories/ }).click();
  await show(page.getByText(/showing top 72/));
  const input = page.getByPlaceholder(/^Search repositories/);
  await input.fill('duckdb');
  await show(page.getByRole('heading', { name: 'duckdb / duckdb', exact: true }));
  await input.fill('');
  await page.getByRole('checkbox', { name: 'Hide dormant' }).check();
  await show(count(packed.activity.filter(([status]) => status === 'active').length));
  await page.getByRole('checkbox', { name: 'Hide dormant' }).uncheck();
  await page.locator('input[type=range][max="90"]').fill('60');
  await show(count(packed.signal.filter((v) => v >= 60).length));
  await page.locator('input[type=range][max="90"]').fill('0');
  console.log('PASS catalog load, ranked search, activity and signal filters, pagination');

  await load(page, `?inspect=${encodeURIComponent(`${firstSplit[2]}/${firstSplit[1]}`)}`);
  await show(page.getByRole('heading', { level: 2, name: new RegExp(escapeRegex(repoName)) }));
  await show(page.getByText(deep.beginner_intel.what_it_does, { exact: true }));
  await read('Similar Repositories').click();
  const ordinal = packed.rows.indexOf(firstSplit);
  const edges = JSON.parse(await readFile(new URL('./dist/edges.json', import.meta.url))).edges;
  const neighbor = packed.rows[edges[ordinal][0][0]];
  await read(new RegExp(`^${escapeRegex(`${neighbor[2]}/${neighbor[1]}`)}(?:\\s|$)`)).click();
  await show(page.getByRole('heading', { level: 2, name: new RegExp(escapeRegex(`${neighbor[2]} / ${neighbor[1]}`)) }));
  console.log('PASS deep-link inspector, shard content, similar-repository navigation');

  await load(page, '?tab=sql');
  const editor = page.locator('textarea');
  await editor.fill('SELECT count(*) AS total FROM repos');
  await read('Run Query').click();
  await show(page.getByRole('cell', { name: String(packed.rows.length), exact: true }));
  const download = page.waitForEvent('download');
  await read('Export CSV').click();
  assert.match(await readFile(await (await download).path(), 'utf8'), new RegExp(`total\\r?\\n${packed.rows.length}`));
  await editor.fill('SELECT 1; CREATE TABLE should_not_run(x);');
  await read('Run Query').click();
  await show(page.getByText(/SQL Studio is read-only/));
  console.log('PASS SQL WebAssembly, full catalog query, CSV download, read-only rejection');

  await nav('Rising').click();
  await show(page.getByRole('heading', { name: 'Catalog changelog' }));
  if (history.period) {
    await show(page.getByText(`+${fmt(history.added_count)}`, { exact: true }));
    if (history.added_count > 8) {
      await page.getByRole('button', { name: /Show more/ }).click();
      const ninth = page.getByRole('link', { name: history.added[8].full_name, exact: true });
      await show(ninth);
      assert.equal(await ninth.getAttribute('href'), `https://github.com/${history.added[8].full_name}`);
    }
  } else {
    await show(page.getByText(history.note, { exact: true }));
  }
  await nav('Ecosystems').click();
  await show(page.getByRole('heading', { name: 'Ecosystems' }));
  const topic = facets.topics[0];
  if (topic) {
    const node = page.locator('g:has(> title)').filter({ has: page.locator('title').getByText(`${topic.name} — ${topic.count} repos`, { exact: true }) }).locator('circle');
    await show(node);
    const box = await node.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + 30, { steps: 3 });
    await page.mouse.up();
    await show(page.getByRole('heading', { name: 'Ecosystems' }));
    assert.notDeepEqual(await node.boundingBox(), box, 'Dragging should pan the map');
    await node.click();
    await show(count(topic.count));
  }
  console.log('PASS dated changelog, additions pagination and Ecosystems-to-catalog filtering');

  await nav('3D Galaxy').click();
  await show(page.getByRole('heading', { name: /3D Topological Knowledge Galaxy.*rendered/ }));
  await show(page.locator('canvas'));
  await read('Galaxy Spiral').click();
  await page.getByPlaceholder(/^Find node in 3D/).fill('duckdb');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    const pixels = canvas?.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels?.some((value, i) => i % 4 === 3 && value !== 0);
  });
  await load(page, '?tab=inspire&seed=browser-e2e');
  await show(page.getByRole('heading', { name: 'Test & Pool Your Custom Tech Stack' }));
  await show(read('Shuffle Blueprint'));
  const before = await page.locator('main h3, main h4').allTextContents();
  await load(page, '?tab=inspire&seed=browser-e2e');
  await show(read('Shuffle Blueprint'));
  assert.deepEqual(await page.locator('main h3, main h4').allTextContents(), before, 'Same seed should rebuild the same blueprint');
  await read('systems').click();
  await show(read('Copy Blueprint'));
  await read('Add Custom Layer').click();
  await show(page.getByText(/Auxiliary Layer/).first());
  console.log('PASS 3D canvas and layout controls, seeded Stack Architect and custom layers');

  assert.deepEqual(network, [], 'Unexpected failed first-party responses');
  const fallback = await context.newPage();
  await fallback.route('**/catalog-packed.json', (route) => route.fulfill({ status: 503, body: 'test' }));
  await load(fallback, `?inspect=${encodeURIComponent(`${firstSplit[2]}/${firstSplit[1]}`)}`);
  await show(fallback.getByText(deep.beginner_intel.what_it_does, { exact: true }));
  await fallback.route('**/catalog-index.json', (route) => route.fulfill({ status: 503, body: 'test' }));
  await fallback.reload();
  await show(fallback.getByRole('alert').filter({ hasText: 'Could not load the repository catalog.' }));
  await fallback.unroute('**/catalog-index.json');
  await fallback.unroute('**/catalog-packed.json');
  await fallback.getByRole('button', { name: 'Try again' }).click();
  await show(fallback.getByText(deep.beginner_intel.what_it_does, { exact: true }));
  console.log('PASS readable fallback, dual-fetch failure and retry');

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await load(mobile);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile page overflows horizontally');
  await mobile.locator('header').getByRole('button', { name: 'SQL Studio', exact: true }).click();
  await show(mobile.getByRole('heading', { name: 'SQL Studio' }));
  console.log('PASS narrow-screen catalog and navigation');
  assert.deepEqual(problems, [], 'Browser emitted uncaught errors');
} finally {
  await browser.close();
}
