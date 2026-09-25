// Mirrors App.jsx's decode + modal-merge contract against the built artefacts.
// Run: node smoke-test.mjs [distDir]
import { readFileSync } from 'fs';
import { join } from 'path';

const dir = process.argv[2] || 'dist';
const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

const packed = JSON.parse(readFileSync(join(dir, 'catalog-packed.json'), 'utf8'));
const { domains, subsystems, languages, artifacts, rows } = packed;
console.log(`packed: ${rows.length.toLocaleString()} rows | ${Object.keys(domains).length} domains / ` +
  `${Object.keys(subsystems).length} subsystems / ${Object.keys(languages).length} languages / ` +
  `${Object.keys(artifacts).length} artifacts`);

const slugify = (t) => (t || 'other-general').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// 1. Tier-1 unpack, exactly as App.jsx does it
const unpacked = rows.map((r) => {
  const domName = domains[r[6]] || 'Other / General';
  return {
    id: r[0], name: r[1], owner: r[2], stars: r[3], forks: r[4],
    language: languages[r[5]] || 'Other', domain: domName,
    subsystem: subsystems[r[7]] || 'General Components',
    artifact: artifacts[r[8]] || 'Application / Service',
    license: r[9], primitives: r[10] || [], hook: r[11] || '',
    description: r[11] || '', url: `https://github.com/${r[2]}/${r[1]}`, shard: slugify(domName),
    // W2 §1.1: optional 13th field (domain margin); null when absent
    domainMargin: r.length > 12 && typeof r[12] === 'number' ? r[12] : null,
  };
});
check(unpacked.length === rows.length, 'row count changed during unpack');
check(rows.every((r) => r.length === 12 || r.length === 13), 'row arity is not 12 or 13');
check(rows.every((r) => r.length !== 13 || (Number.isInteger(r[12]) && r[12] >= 0 && r[12] <= 9)),
  'row[12] domainMargin is not an integer in 0..9');
check(unpacked.every((x) => x.domainMargin === null ||
  (Number.isInteger(x.domainMargin) && x.domainMargin >= 0 && x.domainMargin <= 9)),
  'domainMargin decoded outside 0..9');
check(unpacked.every((x) => x.name && x.owner && Number.isFinite(x.stars)), 'row unpacked without name/owner/stars');
check(unpacked.every((x) => x.stars >= 500), 'a row is below the 500 star floor');
check(unpacked.every((x) => x.domain && x.subsystem && x.artifact && x.language), 'a row decoded to an empty facet');
check(unpacked.every((x) => Array.isArray(x.primitives)), 'primitives is not an array');
const ids = new Set(unpacked.map((x) => x.id));
check(ids.size === unpacked.length, `duplicate ids in Tier-1 (${unpacked.length - ids.size} collisions)`);

// 2. Sort order (the UI assumes stars-desc)
let sorted = true;
for (let i = 1; i < unpacked.length; i++) if (unpacked[i].stars > unpacked[i - 1].stars) { sorted = false; break; }
check(sorted, 'rows are not sorted by stars descending');

// 3. Tier-2 lazy shard fetch + modal merge for a sample across every domain
const byShard = new Map();
for (const r of unpacked) if (!byShard.has(r.shard)) byShard.set(r.shard, r);
console.log(`\nshards referenced by Tier-1: ${byShard.size}`);
let deepCoverage = 0, pushedAt = 0, quickstart = 0, beginner = 0, sampled = 0;
for (const [shard, repo] of byShard) {
  const data = JSON.parse(readFileSync(join(dir, 'data', 'details', `${shard}.json`), 'utf8'));
  const rec = data[repo.id];
  sampled++;
  check(!!rec, `no Tier-2 deep record for ${repo.owner}/${repo.name} in ${shard}`);
  if (!rec) continue;
  deepCoverage++;
  const merged = { ...repo, ...(rec || {}) };
  if (merged.pushed_at && !Number.isNaN(Date.parse(merged.pushed_at))) pushedAt++;
  if (merged.quickstart_code) quickstart++;
  if (merged.beginner_intel && merged.beginner_intel.what_it_does) beginner++;
  check(merged.stars === repo.stars, `Tier-2 mirror overrode Tier-1 stars for ${repo.name}`);
}
console.log(`sampled one repo per shard: ${sampled} | deep record found ${deepCoverage} | ` +
  `valid pushed_at ${pushedAt} | quickstart ${quickstart} | beginner_intel ${beginner}`);
check(deepCoverage === sampled, 'some shards did not resolve the sampled id');
check(pushedAt === sampled, 'pushed_at missing/invalid on a deep record (modal "Pushed:" line would read Invalid Date)');
check(beginner === sampled, 'beginner_intel.what_it_does missing on a deep record');

// 4. Fallback path: catalog-index.json must describe the same catalog
const index = JSON.parse(readFileSync(join(dir, 'catalog-index.json'), 'utf8'));
check(index.length === unpacked.length, `fallback index holds ${index.length} records vs packed ${unpacked.length}`);
const idxIds = new Set(index.map((r) => r.id));
check(unpacked.every((r) => idxIds.has(r.id)), 'fallback index is missing packed ids');
check(index.every((r) => r.url && r.shard && (r.hook || r.description)), 'fallback record lacks url/shard/hook');
console.log(`\nfallback index: ${index.length.toLocaleString()} records (matches packed: ${index.length === unpacked.length})`);

console.log(fail.length ? `\nFAILED (${fail.length}):\n  ` + fail.slice(0, 10).join('\n  ')
  : `\nOK: packed decode, Tier-2 lazy merge, and fallback index all consistent for ${rows.length.toLocaleString()} repos.`);
process.exit(fail.length ? 1 : 0);
