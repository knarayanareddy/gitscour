// SQL Studio shared helpers (W4 §3.1) — imported by App.jsx AND smoke-test.mjs
// so the gate exercises exactly what the browser runs.

/**
 * Split a SQL script into statements on top-level `;`.
 * Semicolons inside string literals or comments are not separators, so
 * `SELECT 'a;b'` stays one statement. Comments are dropped, which also means a
 * leading `-- …` line cannot smuggle a mutation past the guard below.
 */
export function splitStatements(sql) {
  const out = [];
  let buf = '';
  let quote = null;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === ';') {
      out.push(buf);
      buf = '';
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  out.push(buf);
  return out;
}

/**
 * Read-only guard: SQL Studio executes queries, never mutations.
 *
 * The console runs the script with `db.exec`, which executes *every*
 * statement, so the leading keyword alone is not enough — `SELECT 1;
 * DROP TABLE repos` used to pass. Every statement must now be a read.
 */
export function isReadOnlySql(sql) {
  const s = String(sql || '').trim();
  if (!s) return false;
  const stripped = s.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))+/, '');
  const statements = splitStatements(stripped || s)
    .map((stmt) => stmt.trim())
    .filter(Boolean);
  if (!statements.length) return false;
  return statements.every((stmt) => /^(SELECT|WITH)\b/i.test(stmt));
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
