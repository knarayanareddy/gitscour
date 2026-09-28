// Deterministic compatibility lexicon — a direct port of
// `pipeline/taxonomy_engine.py:COMPATIBILITY_RULES` + `match_lexicon_rules`
// (same labels, same order, same word-boundary regexes, same first-4 cap).
//
// Tier-2 deep records carry the authoritative `compatibility` list computed at
// pipeline time over the full text corpus (description + README + topics).
// Tier-1 packed rows do not carry it, so the 3D galaxy — which only ever sees
// Tier-1 — derives it client-side from `name + owner + hook`. Same rules,
// shorter corpus: strictly a subset of the pipeline value, never a guess.
// Zero-LLM by construction: fixed regex table, no models involved.

const COMPATIBILITY_RULES = [
  ["PostgreSQL Compatible", /\bpostgres\b|\bpostgresql\b|\bpgwire\b|\bpg_dump\b/i],
  ["Redis Compatible", /\bredis\b|\bredis-cli\b|\bresp\b/i],
  ["Kubernetes Native", /\bkubernetes\b|\bk8s\b|\bhelm\b|\bcrd\b|\boperator\b/i],
  ["OpenTelemetry Native", /\bopentelemetry\b|\botel\b|\bjaeger\b|\btracing\b/i],
  ["Docker / OCI Compliant", /\bdocker\b|\boci\b|\bcontainerd\b/i],
  ["Prometheus Native", /\bprometheus\b|\bmetrics\b|\balertmanager\b/i],
  ["S3 API Compatible", /\bs3\b|\bminio\b|\bblob storage\b|\bobject storage\b/i],
  ["OpenAPI / REST", /\bopenapi\b|\bswagger\b|\brest\b|\brestful\b/i],
  ["gRPC / Protobuf", /\bgrpc\b|\bprotobuf\b|\bproto\b/i],
  ["GraphQL Native", /\bgraphql\b|\bapollo\b/i],
  ["OpenAI API Compatible", /\bopenai api\b|\bopenai-compatible\b|\bchat completions\b/i],
];

export function deriveCompatibility(corpus, maxMatches = 4) {
  if (!corpus) return [];
  const matched = [];
  for (const [label, re] of COMPATIBILITY_RULES) {
    if (re.test(corpus)) matched.push(label);
    if (matched.length >= maxMatches) break;
  }
  return matched;
}

// Corpus builder used by Tier-1-only consumers (graph nodes).
export function tier1Corpus(repo) {
  return `${repo.name || ""} ${repo.owner || ""} ${repo.hook || repo.description || ""}`;
}
