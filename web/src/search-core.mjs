// Shared query core for ranked search (W3 §2.1/§2.2).
//
// Single source of truth for the client query path — imported by App.jsx (Vite)
// AND by web/smoke-test.mjs (plain node), so the gate tests the exact code the
// browser runs. Must stay in lockstep with pipeline/search_index.py:
//   - identical tokenizer: /[^a-z0-9]+/ split on the lowered text
//   - identical FIELD order/bits and FIELD_WEIGHTS
//   - posting pairs: [ord0_abs, code0, delta, code, ...], code = (tf<<10)|mask

export const FIELD_NAMES = [
  'name', 'owner', 'subsystem', 'domain', 'topics',
  'primitives', 'compatibility', 'hook', 'language', 'license',
];

export const FIELD_WEIGHTS = [5, 4, 3, 1.5, 2.5, 2, 1.5, 1, 0.5, 0.5];

export function tokenize(text) {
  return String(text == null ? '' : text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function fieldWeightLut(index) {
  if (index._lut) return index._lut;
  const bits = index.f.length;
  const lut = new Float64Array(1 << bits);
  for (let mask = 1; mask < lut.length; mask++) {
    const low = mask & -mask;
    lut[mask] = lut[mask ^ low] + index.w[low.toString(2).length - 1];
  }
  index._lut = lut;
  return lut;
}

function tokenMap(index) {
  if (index._map) return index._map;
  const map = new Map();
  for (let i = 0; i < index.t.length; i++) map.set(index.t[i], i);
  index._map = map;
  return map;
}

/**
 * Rank row ordinals for `query` against a packed search index.
 * BM25-lite: idf = ln(1 + N/df), tf saturation tf/(1+tf), field-weighted,
 * plus a two-level coverage rule: rows matching MORE query tokens always
 * outrank rows matching fewer (so 'sql vector' never drowns both-token rows
 * under one strong single), then the 1 + 0.5*(matched-1) score bonus,
 * ln(1+stars) and ordinal as deterministic tie-breaks.
 * Returns [[ord, score], ...] best-first. Deterministic.
 */
export function rankQuery(index, query, stars) {
  const qtoks = tokenize(query);
  if (!qtoks.length || !index || !index.t || !index.t.length) return [];
  const map = tokenMap(index);
  const lut = fieldWeightLut(index);
  const scores = new Map(); // ord -> score
  const matched = new Map(); // ord -> number of distinct query tokens hit
  for (const qt of qtoks) {
    const ti = map.get(qt);
    if (ti === undefined) continue;
    const df = index.d[ti];
    const idf = Math.log(1 + index.n / df);
    if (idf <= 0) continue;
    const pairs = index.p[ti];
    let pos = 0;
    let ord = -1;
    while (pos < pairs.length) {
      ord = pos === 0 ? pairs[0] : ord + pairs[pos];
      const code = pairs[pos + 1];
      pos += 2;
      const tf = (code >> 10) & 7;
      const mask = code & 1023;
      const s = idf * (tf / (1 + tf)) * lut[mask];
      scores.set(ord, (scores.get(ord) || 0) + s);
      matched.set(ord, (matched.get(ord) || 0) + 1);
    }
  }
  const ranked = [];
  for (const [ord, s] of scores) {
    const m = matched.get(ord) || 1;
    const final = s * (1 + 0.5 * (m - 1));
    const starKey = Math.log(1 + (stars[ord] || 0));
    // [-m, -final, -starKey, ord] → match-count first, then score/stars/ordinal
    ranked.push([-m, -final, -starKey, ord, final]);
  }
  ranked.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
  return ranked.map((r) => [r[3], r[4]]);
}
