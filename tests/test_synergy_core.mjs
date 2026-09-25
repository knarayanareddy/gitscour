// W4 §3.8 — unit pins for synergy-core (run by tests/test_synergy_core.py via node).
import {
  evaluatePair,
  synergyFromPairs,
  gradeFor,
  labelsOf,
  PAIR_WEIGHTS,
} from '../web/src/synergy-core.mjs';

const fail = [];
let n = 0;
const ok = (cond, msg) => { n++; if (!cond) fail.push(msg); };

const repo = over => ({
  name: 'x',
  owner: 'o',
  stars: 1000,
  language: 'Python',
  primitives: [],
  license: 'MIT',
  description: '',
  compatibility: [],
  ...over,
});

// ── G5: same language ALONE never yields "High Synergy" ──────────────────────
const a = repo({ name: 'alpha' });
const b = repo({ name: 'beta' });
const sameOnly = evaluatePair(a, b);
ok(sameOnly.status !== 'High Synergy',
  `same-language alone got status=${sameOnly.status} score=${sameOnly.score}`);
ok(sameOnly.score < 75,
  `same-language alone reached pair score ${sameOnly.score} (must stay < 75)`);
ok(PAIR_WEIGHTS.base + PAIR_WEIGHTS.sameLang < 75,
  'weights allow same-language alone to reach High Synergy');

// adding a SECOND signal can legitimately reach High Synergy
const primPair = evaluatePair(
  repo({ name: 'alpha2', primitives: ['vector-search'] }),
  repo({ name: 'beta2', primitives: ['vector-search'] }),
);
ok(primPair.status === 'High Synergy',
  `lang+primitives should reach High Synergy, got ${primPair.status} (${primPair.score})`);

// ── G1: score = mean over pairs; 2-slot and 6-slot comparable ────────────────
ok(synergyFromPairs([80]).score === 80, 'single pair mean wrong');
ok(synergyFromPairs([60, 100]).score === 80, 'two-pair mean wrong');
ok(synergyFromPairs([60, 100]).score === synergyFromPairs([80]).score,
  '2-slot vs 1-pair not comparable');
ok(synergyFromPairs([80, 80, 80, 80, 80, 80]).score === synergyFromPairs([80]).score,
  '6-slot pool inflates the score vs 2-slot');
ok(synergyFromPairs([90, 70, 80]).score === 80, 'three-pair mean wrong');
ok(synergyFromPairs([]).score === 50 && synergyFromPairs([]).grade === 'Awaiting Second Component',
  'no-pair pool must be neutral, not graded');

// monotonic bands unchanged
ok(gradeFor(85).grade === 'High Architectural Synergy', 'grade band 80+ broken');
ok(gradeFor(65).grade === 'Production Viable (Standard IPC)', 'grade band 60+ broken');
ok(gradeFor(45).grade === 'Architectural Friction Detected', 'grade band 40+ broken');
ok(gradeFor(20).grade === 'High Coupling / License Conflict', 'grade band <40 broken');

// ── G3: protocol matrix derived from COMPATIBILITY_RULES labels ──────────────
// shared labels on both sides
const promA = repo({ name: 'prom-a', compatibility: ['Prometheus Native'] });
const promB = repo({ name: 'prom-b', compatibility: ['Prometheus Native'] });
const shared = evaluatePair(promA, promB);
ok(shared.sharedProtocols.includes('Prometheus Native'), 'shared protocol label missed');

// asymmetric pairing: server labelled, client identified lexically (pg driver)
const pgServer = repo({ name: 'pgserver', language: 'Go', compatibility: ['PostgreSQL Compatible'] });
const pgDriver = repo({ name: 'psycopg-lite', language: 'Python' });
const paired = evaluatePair(pgServer, pgDriver);
ok(paired.sharedProtocols.includes('PostgreSQL Compatible'),
  `pg driver pairing missed: ${JSON.stringify(paired.sharedProtocols)}`);

// protocol bump is exactly +10 when languages differ (no other signals)
const plainA = repo({ name: 'plain-a', language: 'Go' });
const plainB = repo({ name: 'plain-b', language: 'Python' });
const baseline = evaluatePair(plainA, plainB);
const pgBaselinePair = evaluatePair(
  repo({ name: 'pgserver', language: 'Go', compatibility: ['PostgreSQL Compatible'] }),
  repo({ name: 'other', language: 'Python' }),
);
ok(pgBaselinePair.sharedProtocols.length === 0,
  'unrelated Python repo must not pair with the pg protocol');
ok(paired.score - baseline.score === 10,
  `protocol pairing must add exactly +10 over baseline (got ${paired.score - baseline.score})`);
ok(shared.score > sameOnly.score, 'shared protocol must outscore same-language alone');

// labelsOf: packed list wins, corpus derive as fallback
ok(labelsOf(repo({ compatibility: ['S3 API Compatible'] })).includes('S3 API Compatible'),
  'labelsOf must prefer packed compatibility');
ok(labelsOf(repo({ name: 'my-postgres-fork', compatibility: [] })).includes('PostgreSQL Compatible'),
  'labelsOf fallback derive failed');

// protocol cap: many labels never exceed +20
const many = ['PostgreSQL Compatible', 'Redis Compatible', 'S3 API Compatible', 'gRPC / Protobuf'];
const capA = repo({ name: 'cap-a', compatibility: many });
const capB = repo({ name: 'cap-b', compatibility: many });
const capped = evaluatePair(capA, capB);
ok(capped.score <= 50 + PAIR_WEIGHTS.sameLang + PAIR_WEIGHTS.protocolCap,
  `protocol contribution exceeded cap: score=${capped.score}`);

if (fail.length) {
  console.error(`FAIL (${fail.length}):\n  ` + fail.join('\n  '));
  process.exit(1);
}
console.log(`SYNERGY_CORE_OK ${n} assertions`);
