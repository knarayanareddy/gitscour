// Mirrors App.jsx's decode + search + modal-merge contract against built artefacts.
// Run: node smoke-test.mjs [distDir]
//
// The query path is NOT mirrored: this test imports `src/search-core.mjs`, the
// exact module App.jsx uses, so the gate exercises the shipped algorithm.
import { readFileSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';
import { rankQuery, tokenize } from './src/search-core.mjs';

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
    // W3 §2.2/2.4: optional 14th/15th fields (topics, compatibility)
    topics: Array.isArray(r[13]) ? r[13] : [],
    compatibility: Array.isArray(r[14]) ? r[14] : [],
  };
});
check(unpacked.length === rows.length, 'row count changed during unpack');
check(rows.every((r) => r.length >= 12 && r.length <= 15), 'row arity outside 12..15');
check(rows.every((r) => r.length <= 12 || (Number.isInteger(r[12]) && r[12] >= 0 && r[12] <= 9)),
  'row[12] domainMargin is not an integer in 0..9');
check(rows.every((r) => r.length <= 13 || (Array.isArray(r[13]) && r[13].every((t) => typeof t === 'string'))),
  'row[13] topics is not a string array');
check(rows.every((r) => r.length <= 14 || (Array.isArray(r[14]) && r[14].every((t) => typeof t === 'string'))),
  'row[14] compatibility is not a string array');
check(unpacked.every((x) => x.domainMargin === null ||
  (Number.isInteger(x.domainMargin) && x.domainMargin >= 0 && x.domainMargin <= 9)),
  'domainMargin decoded outside 0..9');
check(unpacked.every((x) => x.name && x.owner && Number.isFinite(x.stars)), 'row unpacked without name/owner/stars');
check(unpacked.every((x) => x.stars >= 500), 'a row is below the 500 star floor');
check(unpacked.every((x) => x.domain && x.subsystem && x.artifact && x.language), 'a row decoded to an empty facet');
check(unpacked.every((x) => Array.isArray(x.primitives) && Array.isArray(x.topics) && Array.isArray(x.compatibility)),
  'primitives/topics/compatibility is not an array');
const ids = new Set(unpacked.map((x) => x.id));
check(ids.size === unpacked.length, `duplicate ids in Tier-1 (${unpacked.length - ids.size} collisions)`);

// 2. Sort order (the UI assumes stars-desc)
let sorted = true;
for (let i = 1; i < unpacked.length; i++) if (unpacked[i].stars > unpacked[i - 1].stars) { sorted = false; break; }
check(sorted, 'rows are not sorted by stars descending');

// 3. W3 §2.1/2.2 — ranked search over the pack-time index (exact shipped code)
const searchIndex = JSON.parse(readFileSync(join(dir, 'search-index.json'), 'utf8'));
check(searchIndex.n === rows.length, `search index n=${searchIndex.n} != rows ${rows.length}`);
check(searchIndex.t.length === searchIndex.d.length && searchIndex.t.length === searchIndex.p.length,
  'search index token/df/postings arrays are ragged');
check(searchIndex.f.length === searchIndex.w.length, 'search index field/weight arrays are ragged');
const starsByOrdinal = unpacked.map((r) => r.stars);
const rankOnce = (q) => rankQuery(searchIndex, q, starsByOrdinal);

// warm-up + deterministic ordering
const warm = rankOnce('raft');
check(rankOnce('raft').map(([o]) => o).join(',') === warm.map(([o]) => o).join(','),
  'rankQuery is not deterministic');

const queryGates = [
  // [query, min hits, ms budget]
  ['sql vector', 20, 5],
  ['simd', 100, 5],
  ['raft', 150, 5],   // exact-token matches only (old substring's 654 included draft/craft)
];
const queryReport = [];
for (const [q, minHits, budget] of queryGates) {
  const runs = [];
  let res = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    res = rankOnce(q);
    runs.push(performance.now() - t0);
  }
  runs.sort((a, b) => a - b);
  const median = runs[2];
  queryReport.push(`'${q}': ${res.length} hits, median ${median.toFixed(2)}ms`);
  check(res.length >= minHits, `query ${q} returned ${res.length} hits, need >= ${minHits}`);
  check(median < budget, `query ${q} took ${median.toFixed(2)}ms, budget ${budget}ms`);
}
// relevance: top rows must actually be about the query
const topNames = (q, n) => rankOnce(q).slice(0, n).map(([o]) => `${unpacked[o].owner}/${unpacked[o].name}`.toLowerCase());
const duckTop = topNames('duckdb', 3);
check(duckTop.every((s) => s.includes('duckdb')), `duckdb top-3 not duckdb repos: ${duckTop}`);
const simdTop = topNames('simd', 5);
check(simdTop.some((s) => s.includes('simd')), `simd top-5 has no simd repo: ${simdTop}`);
// multi-token: most of the top-10 must mention BOTH tokens somewhere searchable
const sv = rankOnce('sql vector').slice(0, 10);
const bothTokens = sv.filter(([o]) => {
  const r = unpacked[o];
  // full searchable field set (mirror of the index's doc fields)
  const text = [r.name, r.owner, r.hook, r.subsystem, r.domain, r.language,
    r.license, ...r.primitives, ...r.topics, ...r.compatibility].join(' ').toLowerCase();
  return text.includes('sql') && text.includes('vector');
}).length;
check(bothTokens >= 4, `sql vector top-10: only ${bothTokens}/10 rows mention both tokens`);
console.log(`\nsearch gates: ${queryReport.join(' | ')}`);
console.log(`  relevance: duckdb top-3 all duckdb ✓ | sql+vector both-token top-10: ${bothTokens}/10`);

// 4. W3 §2.4 — edges invariants
const edgesData = JSON.parse(readFileSync(join(dir, 'edges.json'), 'utf8'));
const edges = edgesData.edges;
check(edges.length === rows.length, `edges length ${edges.length} != rows ${rows.length}`);
let minDeg = Infinity, badNb = 0, selfEdge = 0;
const bucketCount = new Map();
for (let i = 0; i < edges.length; i++) {
  const list = edges[i];
  if (!Array.isArray(list) || list.length === 0) { badNb++; continue; }
  minDeg = Math.min(minDeg, list.length);
  for (const [j, w] of list) {
    if (!(j >= 0 && j < rows.length)) badNb++;
    if (j === i) selfEdge++;
    if (!(w > 0 && w <= 1)) badNb++;
    const sub = subsystems[rows[j][7]] || 'General Components';
    bucketCount.set(sub, (bucketCount.get(sub) || 0) + 1);
  }
}
check(badNb === 0, `${badNb} malformed edge endpoints`);
check(selfEdge === 0, `${selfEdge} self-edges`);
check(minDeg >= 1, `min degree ${minDeg}: some node has no edge`);
const totalEdgeEnds = [...bucketCount.values()].reduce((a, b) => a + b, 0);
const [topName, topN] = [...bucketCount.entries()].sort((a, b) => b[1] - a[1])[0];
const topPct = (100 * topN / totalEdgeEnds);
check(topPct <= 25, `top edge bucket ${topName} holds ${topPct.toFixed(1)}% (>25%)`);
console.log(`\nedges: ${totalEdgeEnds.toLocaleString()} endpoints | min degree ${minDeg} | ` +
  `top bucket ${topName} ${topPct.toFixed(1)}%`);

// 5. W3 §2.8 — facet counts must equal a recount from the rows (exact truth)
const facets = JSON.parse(readFileSync(join(dir, 'facets.json'), 'utf8'));
check(facets.total === rows.length, `facets.total ${facets.total} != rows ${rows.length}`);
const recount = new Map();
for (const r of rows) {
  const d = domains[r[6]] || 'Other / General';
  recount.set(d, (recount.get(d) || 0) + 1);
}
for (const f of facets.domains) {
  check(recount.get(f.name) === f.count, `facet ${f.name}: ${f.count} != recount ${recount.get(f.name) || 0}`);
}
check(recount.size === facets.domains.length, 'facet domain list does not cover every domain');
console.log(`facets: ${facets.domains.length} domains verified against row recount ` +
  `(${facets.domains.slice(0, 3).map((f) => `${f.name} (${f.count})`).join(', ')}, ...)`);

// 6. Tier-2 lazy shard fetch + modal merge for a sample across every domain
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

// 7. Fallback path: catalog-index.json must describe the same catalog
const index = JSON.parse(readFileSync(join(dir, 'catalog-index.json'), 'utf8'));
check(index.length === unpacked.length, `fallback index holds ${index.length} records vs packed ${unpacked.length}`);
const idxIds = new Set(index.map((r) => r.id));
check(unpacked.every((r) => idxIds.has(r.id)), 'fallback index is missing packed ids');
check(index.every((r) => r.url && r.shard && (r.hook || r.description)), 'fallback record lacks url/shard/hook');
console.log(`\nfallback index: ${index.length.toLocaleString()} records (matches packed: ${index.length === unpacked.length})`);

console.log(fail.length ? `\nFAILED (${fail.length}):\n  ` + fail.slice(0, 10).join('\n  ')
  : `\nOK: packed decode, ranked search, edges, facets, Tier-2 merge, and fallback index consistent for ${rows.length.toLocaleString()} repos.`);
process.exit(fail.length ? 1 : 0);
