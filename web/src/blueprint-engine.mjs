// ---------------------------------------------------------------------------------------
// W4 §3.6/§3.8 — Blueprint completion engine (pure, deterministic, zero-LLM).
//
// selectBlueprint : goal-filtered pick via a seeded RNG (no Math.random).
// completeStack   : constraint-satisfaction slot fill for a blueprint's roles:
//                     seeds (owner/name verified against the packed catalog)  > exact
//                     requiredSubsystem match within the category pool        > rest of
//                     the category pool.  Ties broken by stars desc, then name;
//                     the final pick samples the top-3 with the seeded RNG so a
//                     given seed reproduces a stack while variety is preserved.
//                     A role with no candidate at all yields repo:null (honest gap).
//
// Same module exports mulberry32/hashSeed so UI + tests share one RNG (§3.8).
// ---------------------------------------------------------------------------------------

/** 32-bit FNV-1a — hashes seed strings (URL params) into rng states. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG; returns fn -> float in [0, 1). */
export function mulberry32(seed) {
  let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic pick from a list (empty list -> undefined). */
export function pickWith(rng, list) {
  if (!list || list.length === 0) return undefined;
  return list[Math.floor(rng() * list.length)];
}

const byStarsDesc = (a, b) =>
  (b.stars ?? 0) - (a.stars ?? 0) || String(a.name).localeCompare(String(b.name));

/**
 * Goal-filtered blueprint pick. Falls back to the full library when the goal
 * has no entries (never returns undefined for a non-empty library).
 */
export function selectBlueprint(blueprints, goal, rng) {
  if (!blueprints || blueprints.length === 0) return undefined;
  let pool = blueprints;
  if (goal && goal !== 'all') {
    const filtered = blueprints.filter(b => b.goal === goal);
    if (filtered.length > 0) pool = filtered;
  }
  return pickWith(rng, pool);
}

/**
 * Fill every role of `blueprint` from `pools` (category -> repo array) plus
 * `lookup` (Map "owner/name" -> repo over the WHOLE catalog, so seeds work even
 * when v1 subsystem labels placed them outside the category bucket).
 *
 * Returns { components: [{role, repo|null, via}], missing: [labels] }.
 */
export function completeStack(blueprint, pools, lookup, rng) {
  const components = [];
  const missing = [];
  for (const role of blueprint.roles || []) {
    const rankPool = list => [...list].sort(byStarsDesc);

    // 1) Curated seeds that exist in this catalog build.
    const seedRepos = (role.seeds || [])
      .map(key => (lookup && lookup.get ? lookup.get(key) : undefined))
      .filter(Boolean);
    let candidates = [];
    let via = 'seed';
    if (seedRepos.length > 0) {
      candidates = rankPool(seedRepos);
    } else {
      // 2) Category pool, boosted to the exact required subsystem when present.
      const pool = (pools && pools[role.category]) || [];
      if (pool.length === 0) {
        candidates = [];
      } else if (role.requiredSubsystem) {
        const matched = pool.filter(r => r.subsystem === role.requiredSubsystem);
        if (matched.length > 0) {
          candidates = rankPool(matched);
          via = 'subsystem';
        } else {
          candidates = rankPool(pool); // honest fallback: no exact-label match
          via = 'category';
        }
      } else {
        candidates = rankPool(pool);
        via = 'category';
      }
    }

    if (candidates.length === 0) {
      missing.push(role.label);
      components.push({ role: role.label, repo: null, via: 'missing' });
      continue;
    }
    // Variety within determinism: sample the top-3 (or fewer) candidates.
    const top = candidates.slice(0, Math.min(3, candidates.length));
    components.push({ role: role.label, repo: pickWith(rng, top), via });
  }
  return { components, missing };
}
