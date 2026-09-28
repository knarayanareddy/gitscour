// ---------------------------------------------------------------------------------------
// W4 §3.8 — Synergy scoring core (pure, deterministic, zero-LLM).
//
// Extracted from InspirationGenerator's custom-pool harness so the math is unit
// -testable (tests/test_synergy_core.mjs) and the UI can only render it:
//
//   * Score = MEAN over pair scores  → a 2-slot pool and a 6-slot pool are
//     directly comparable (the old formula summed raw positives across pairs,
//     so bigger pools mechanically scored higher).
//   * Same language alone never reaches "High Synergy" (needs a second signal:
//     shared primitives, shared protocol, or a genuinely close ecosystem).
//   * Protocol compatibility matrix is derived from COMPATIBILITY_RULES labels
//     (web/src/compatibility.js — the port of pipeline COMPATIBILITY_RULES):
//     shared labels on both sides, plus the deterministic client pairings
//     (Postgres-compatible ↔ pg drivers, OpenAI-compatible ↔ OpenAI clients …).
// ---------------------------------------------------------------------------------------

import { deriveCompatibility, tier1Corpus } from './compatibility.js';

export const PAIR_WEIGHTS = Object.freeze({
  base: 50,
  sameLang: 18,       // alone: 68 < 75 ⇒ never "High Synergy" (§3.8)
  siblingLang: 15,    // ts/js, c/c++
  ffiLang: 12,        // python ↔ rust/c++/c
  ipcPenalty: -5,     // unrelated languages ⇒ serialized boundary
  sharedPrimitive: 18,
  sharedProtocol: 10, // per matched protocol label…
  protocolCap: 20,    // …capped at two labels
  licenseAsymmetry: -15, // copyleft ↔ permissive mixing
});

// Deterministic client pairings for COMPATIBILITY_RULES labels: when one side
// carries label L, the other side's corpus may identify it as a *client* of L
// even without the label itself (e.g. psycopg never says "PostgreSQL" in its
// name). Fixed regexes only — no models, no heuristics beyond these tables.
export const PROTOCOL_CLIENTS = Object.freeze({
  'PostgreSQL Compatible': /\bpsycopg\b|\bpgx\b|\bnode-postgres\b|\blibpq\b|\bpgdriver\b|\bpostgres[-_ ]?js\b/i,
  'OpenAI API Compatible': /\bopenai\b|\blitellm\b|\bllm[-_ ]?client\b/i,
  'Redis Compatible': /\biredis\b|\bredis[-_ ]?py\b|\bjedis\b|\blettuce\b|\bgo[-_ ]?redis\b/i,
  'gRPC / Protobuf': /\bgrpc\b|\bprotobuf\b/i,
  'GraphQL Native': /\bgraphql[-_ ]?yoga\b|\bapollo[-_ ]?client\b|\burql\b/i,
});

/** Protocol labels for a repo: packed list when present, else corpus derive. */
export function labelsOf(repo) {
  if (Array.isArray(repo.compatibility) && repo.compatibility.length > 0) {
    return repo.compatibility;
  }
  return deriveCompatibility(tier1Corpus(repo));
}

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Pairwise evaluation for one (a, b) combination.
 * Returns { score, status, notes, positives, frictions, harmonies, sharedProtocols }
 * with the exact positive/friction/harmony shapes the UI already renders.
 */
export function evaluatePair(a, b) {
  const notes = [];
  const positives = [];
  const frictions = [];
  const harmonies = [];
  let score = PAIR_WEIGHTS.base;
  const pairLabel = `${a.name} ↔ ${b.name}`;

  // 1. Runtime harmony -------------------------------------------------------
  const langA = (a.language || 'Other').toLowerCase();
  const langB = (b.language || 'Other').toLowerCase();
  if (langA === langB && langA !== 'other') {
    score += PAIR_WEIGHTS.sameLang;
    const note = `Native ${a.language} ecosystem: direct in-process binding without FFI overhead.`;
    notes.push(note);
    harmonies.push({ pair: pairLabel, text: note });
  } else if (
    (langA === 'typescript' && langB === 'javascript') ||
    (langA === 'javascript' && langB === 'typescript') ||
    (langA === 'c++' && langB === 'c') ||
    (langA === 'c' && langB === 'c++')
  ) {
    score += PAIR_WEIGHTS.siblingLang;
    notes.push(`Native interop between ${a.language} and ${b.language}.`);
  } else if (
    (langA === 'python' && ['rust', 'c++', 'c'].includes(langB)) ||
    (langB === 'python' && ['rust', 'c++', 'c'].includes(langA))
  ) {
    score += PAIR_WEIGHTS.ffiLang;
    notes.push(`High-performance C-extension / PyO3 binding: ${b.name} natively accelerates ${a.name}.`);
  } else {
    score += PAIR_WEIGHTS.ipcPenalty;
    frictions.push({
      pair: pairLabel,
      type: 'Network / IPC Boundary',
      severity: 'low',
      desc: 'Requires serialized communication (HTTP/JSON, gRPC, or WebSockets) across processes.',
    });
    notes.push('IPC / Network protocol bridge required.');
  }

  // 2. Shared architectural primitives ---------------------------------------
  const primsA = a.primitives || [];
  const primsB = b.primitives || [];
  const sharedPrims = primsA.filter(p => primsB.includes(p));
  if (sharedPrims.length > 0) {
    score += PAIR_WEIGHTS.sharedPrimitive;
    const note = `Aligned on architectural primitive [${sharedPrims.join(', ')}].`;
    notes.push(note);
    positives.push({
      pair: pairLabel,
      primitive: sharedPrims.join(', '),
      desc: `Both components are optimized for ${sharedPrims.join(', ')}, eliminating memory transcode bottlenecks.`,
    });
  }

  // 3. License reciprocity ----------------------------------------------------
  const licA = (a.license || 'Open Source').toLowerCase();
  const licB = (b.license || 'Open Source').toLowerCase();
  const isCopyleftA = licA.includes('gpl') && !licA.includes('lgpl');
  const isCopyleftB = licB.includes('gpl') && !licB.includes('lgpl');
  if (isCopyleftA !== isCopyleftB && (isCopyleftA || isCopyleftB)) {
    score += PAIR_WEIGHTS.licenseAsymmetry;
    frictions.push({
      pair: `${a.name} (${a.license}) ↔ ${b.name} (${b.license})`,
      type: 'License Reciprocity Asymmetry',
      severity: 'medium',
      desc: `Copyleft license terms (${isCopyleftA ? a.name : b.name}) may mandate open-sourcing client proprietary source code if statically linked.`,
    });
    notes.push('GPL reciprocity considerations.');
  }

  // 4. Protocol compatibility matrix (from COMPATIBILITY_RULES labels) --------
  const la = labelsOf(a);
  const lb = labelsOf(b);
  const paired = la.filter(l => lb.includes(l));
  for (const l of la) {
    if (!lb.includes(l) && PROTOCOL_CLIENTS[l] && PROTOCOL_CLIENTS[l].test(tier1Corpus(b))) paired.push(l);
  }
  for (const l of lb) {
    if (!la.includes(l) && PROTOCOL_CLIENTS[l] && PROTOCOL_CLIENTS[l].test(tier1Corpus(a))) paired.push(l);
  }
  const sharedProtocols = [...new Set(paired)];
  if (sharedProtocols.length > 0) {
    score += Math.min(sharedProtocols.length * PAIR_WEIGHTS.sharedProtocol, PAIR_WEIGHTS.protocolCap);
    const note = `Shared protocol surface: ${sharedProtocols.join(', ')}.`;
    notes.push(note);
    positives.push({
      pair: pairLabel,
      primitive: sharedProtocols.join(', '),
      desc: `Both sides speak ${sharedProtocols.join(', ')} — drop-in drivers/clients instead of bespoke adapters.`,
    });
  }

  score = clamp(Math.round(score), 10, 100);
  let status;
  if (score >= 75) status = 'High Synergy';
  else if (score >= 50) status = 'Compatible';
  else status = 'Friction Warning';

  return { score, status, notes, positives, frictions, harmonies, sharedProtocols };
}

/** Grade bands — unchanged strings from the original harness. */
export function gradeFor(score) {
  if (score >= 80) return { grade: 'High Architectural Synergy', gradeColor: 'text-signal-ok' };
  if (score >= 60) return { grade: 'Production Viable (Standard IPC)', gradeColor: 'text-signal-info' };
  if (score >= 40) return { grade: 'Architectural Friction Detected', gradeColor: 'text-signal-star' };
  return { grade: 'High Coupling / License Conflict', gradeColor: 'text-signal-risk' };
}

/**
 * Aggregate a pool's pair scores: ARITHMETIC MEAN, so pool size does not
 * inflate the result. No pairs (single component) → neutral "awaiting" grade.
 */
export function synergyFromPairs(pairScores) {
  if (!pairScores || pairScores.length === 0) {
    return { score: 50, grade: 'Awaiting Second Component', gradeColor: 'text-signal-info' };
  }
  const mean = pairScores.reduce((s, x) => s + x, 0) / pairScores.length;
  const score = clamp(Math.round(mean), 15, 98);
  return { score, ...gradeFor(score) };
}
