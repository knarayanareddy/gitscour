// W4 §3.7 — the complete filter/search/sort pipeline as a pure module.
// Used by BOTH the Web Worker (hot path) and App.jsx's synchronous fallback,
// so the two can never diverge: same rows shape, same rules, same order.
//
// Row shape: anything with the fields App's unpack produces (id, name, owner,
// stars, forks, language, domain, subsystem, artifact, license, licenseTier,
// primitives, hook, topics, compatibility, activity, searchCorpus).

import { rankQuery } from './search-core.mjs';

/** Sentinel for the grouped long-tail language option (facet display only). */
export const LONG_TAIL_LANGUAGE = '__long_tail__';
export const LONG_TAIL_MIN_COUNT = 50;

/**
 * Packed payload -> light row projection (the worker's copy). Field-for-field
 * compatible with App.jsx's full unpack for everything `filterOrdinals` reads,
 * including the memoized lowercase search corpus (W3 §2.3/§2.2 parity).
 */
export function unpackLight(packed) {
  const { domains, subsystems, languages, artifacts, rows, activity, license_tiers } = packed;
  return rows.map((r, i) => {
    const domName = domains[r[6]] || 'Other / General';
    const subsystem = subsystems[r[7]] || 'General Components';
    const language = languages[r[5]] || 'Other';
    const act = Array.isArray(activity) ? activity[i] : null;
    return {
      id: r[0],
      name: r[1],
      owner: r[2],
      stars: r[3],
      forks: r[4],
      language,
      domain: domName,
      subsystem,
      artifact: artifacts[r[8]] || 'Application / Service',
      license: r[9],
      licenseTier: Array.isArray(license_tiers) ? license_tiers[i] : null,
      primitives: r[10] || [],
      hook: r[11] || '',
      topics: Array.isArray(r[13]) ? r[13] : [],
      compatibility: Array.isArray(r[14]) ? r[14] : [],
      activity: act && act[0] ? { status: act[0], pushedAt: act[1] } : null,
      searchCorpus: [
        r[1], r[2], r[11] || '', language, domName, subsystem,
        ...(r[10] || []), r[9] || '',
        ...(Array.isArray(r[14]) ? r[14] : []),
        ...(Array.isArray(r[13]) ? r[13] : []),
      ].join(' ').toLowerCase(),
    };
  });
}

/** Languages with >= LONG_TAIL_MIN_COUNT rows stay individual facet entries. */
export function majorLanguages(rows) {
  const counts = new Map();
  for (const r of rows) {
    if (r.language) counts.set(r.language, (counts.get(r.language) || 0) + 1);
  }
  const majors = [];
  const tail = [];
  for (const [name, count] of counts) {
    if (count >= LONG_TAIL_MIN_COUNT) majors.push(name);
    else tail.push({ name, count });
  }
  majors.sort();
  tail.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return {
    majors,
    majorsSet: new Set(majors),
    tail,
    tailRows: tail.reduce((a, x) => a + x.count, 0),
  };
}

const starsCache = new WeakMap();
function starsArray(rows) {
  let arr = starsCache.get(rows);
  if (!arr) {
    arr = rows.map((r) => r.stars || 0);
    starsCache.set(rows, arr);
  }
  return arr;
}

/**
 * Ordered row ordinals for a filter+query request. Deterministic:
 * rank order for non-empty queries (index present), stars-desc otherwise,
 * recently-pushed first when sortBy==='recent' and no query is active.
 */
export function filterOrdinals(rows, index, opts, majorsSet) {
  const {
    q = '',
    domain = 'all',
    subsystem = 'all',
    artifact = 'all',
    language = 'all',
    primitive = 'all',
    licenseTier = 'all',
    minStars = 500,
    hideDormant = false,
    sortBy = 'stars',
  } = opts || {};

  const facetOk = (repo) => {
    if (repo.stars < minStars) return false;
    if (domain !== 'all' && repo.domain !== domain) return false;
    if (subsystem !== 'all' && repo.subsystem !== subsystem) return false;
    if (artifact !== 'all' && repo.artifact !== artifact) return false;
    if (language !== 'all') {
      if (language === LONG_TAIL_LANGUAGE) {
        if (majorsSet && majorsSet.has(repo.language)) return false;
      } else if (repo.language !== language) return false;
    }
    if (primitive !== 'all' && !(repo.primitives || []).includes(primitive)) return false;
    if (licenseTier !== 'all' && repo.licenseTier !== licenseTier) return false;
    return true;
  };

  const activityOk = (repo) => {
    if (!hideDormant) return true;
    const s = repo.activity && repo.activity.status;
    return s !== 'idle' && s !== 'archived';
  };

  const trimmed = (q || '').trim();
  if (trimmed && index) {
    const ranked = rankQuery(index, trimmed, starsArray(rows));
    const out = [];
    for (const [ord] of ranked) {
      const repo = rows[ord];
      if (repo && facetOk(repo) && activityOk(repo)) out.push(ord);
    }
    return out;
  }

  const queryTokens = trimmed ? trimmed.toLowerCase().split(/\s+/).filter(Boolean) : [];
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const repo = rows[i];
    if (!facetOk(repo) || !activityOk(repo)) continue;
    if (queryTokens.length) {
      const corpus = repo.searchCorpus || repo.corpus || '';
      let all = true;
      for (const token of queryTokens) {
        if (!corpus.includes(token)) { all = false; break; }
      }
      if (!all) continue;
    }
    out.push(i);
  }
  if (!queryTokens.length && sortBy === 'recent') {
    out.sort((a, b) => {
      const ta = (rows[a].activity && rows[a].activity.pushedAt) || 0;
      const tb = (rows[b].activity && rows[b].activity.pushedAt) || 0;
      return tb - ta || rows[b].stars - rows[a].stars;
    });
  }
  return out;
}
