// SQL Studio shared helpers (W4 §3.1) — imported by App.jsx AND smoke-test.mjs
// so the gate exercises exactly what the browser runs.

/** Read-only guard: SQL Studio executes queries, never mutations. */
export function isReadOnlySql(sql) {
  const s = String(sql || '').trim();
  // strip leading comments/whitespace before checking the leading keyword
  s.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))+/, '');
  const stripped = s.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))+/, '');
  return /^(SELECT|WITH)\b/i.test(stripped || s);
}

/** RFC4180-ish CSV: quote when the value contains , " or newline. */
export function resultsToCsv(columns, values) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [(columns || []).map(esc).join(',')];
  for (const row of values || []) lines.push(row.map(esc).join(','));
  return lines.join('\n');
}

/** Deterministic row cap for the results grid (CSV export keeps everything). */
export const RESULT_PREVIEW_LIMIT = 200;

/** Column list for the in-memory `repos` table (order is load-bearing). */
export const SQL_COLUMNS = [
  'id', 'name', 'owner', 'stars', 'forks', 'language', 'domain', 'subsystem',
  'artifact', 'license', 'license_tier', 'primitives', 'topics',
  'activity_status', 'hook',
];

/** Project an unpacked repo row onto the SQL column tuple. */
export function repoToSqlValues(repo) {
  return [
    repo.id,
    repo.name,
    repo.owner,
    repo.stars,
    repo.forks,
    repo.language,
    repo.domain,
    repo.subsystem,
    repo.artifact,
    repo.license,
    repo.licenseTier || null,
    (repo.primitives || []).join(', '),
    (repo.topics || []).join(', '),
    (repo.activity && repo.activity.status) || null,
    repo.hook || '',
  ];
}
