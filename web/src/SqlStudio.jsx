import React, { useState, useMemo } from 'react';
import { 
  Terminal, Play, Download, Copy, Check, Sparkles, Database, 
  Clock, AlertCircle, FileSpreadsheet, ExternalLink, HelpCircle,
  Table as TableIcon, Layers
} from 'lucide-react';

export default function SqlStudio({ repos, onSelectRepo }) {
  const [query, setQuery] = useState(
    "SELECT name, stars, language, domain, subsystem\nFROM repos\nWHERE domain = 'Databases & Storage' AND stars >= 15000\nORDER BY stars DESC\nLIMIT 50;"
  );
  const [copied, setCopied] = useState(false);
  const [executedAt, setExecutedAt] = useState(null);

  const PRESETS = [
    {
      label: "Top 20 Databases",
      sql: "SELECT name, stars, language, subsystem\nFROM repos\nWHERE domain = 'Databases & Storage' AND stars >= 10000\nORDER BY stars DESC\nLIMIT 20;"
    },
    {
      label: "Rust Systems Engines",
      sql: "SELECT name, stars, domain, subsystem\nFROM repos\nWHERE language = 'Rust' AND artifact = 'System Service / Engine'\nORDER BY stars DESC\nLIMIT 25;"
    },
    {
      label: "High-Star Permissive AI",
      sql: "SELECT name, stars, language, subsystem\nFROM repos\nWHERE domain = 'AI & Machine Learning' AND (license = 'MIT' OR license = 'Apache-2.0')\nORDER BY stars DESC\nLIMIT 30;"
    },
    {
      label: "Kernel & OS Systems",
      sql: "SELECT name, stars, language, subsystem\nFROM repos\nWHERE domain = 'Operating Systems & Low-Level' AND stars >= 5000\nORDER BY stars DESC\nLIMIT 25;"
    },
    {
      label: "Cloud & Kubernetes",
      sql: "SELECT name, stars, language, subsystem\nFROM repos\nWHERE domain = 'Cloud & Infrastructure' AND stars >= 10000\nORDER BY stars DESC\nLIMIT 25;"
    }
  ];

  // SQL Execution Engine
  const queryResult = useMemo(() => {
    if (!repos || repos.length === 0) {
      return { rows: [], columns: [], elapsed: 0, total: 0, error: null };
    }

    const t0 = performance.now();
    const rawSql = query.trim().replace(/;+$/, '');

    try {
      const selectMatch = rawSql.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([\s\S]+?))?(?:\s+LIMIT\s+(\d+))?$/i);
      if (!selectMatch) {
        throw new Error("Syntax Error: Query must follow format:\nSELECT [cols|*] FROM repos [WHERE condition] [ORDER BY col [ASC|DESC]] [LIMIT n]");
      }

      const [_, colsRaw, table, whereClause, orderByClause, limitClause] = selectMatch;
      if (table.toLowerCase() !== 'repos') {
        throw new Error(`Table '${table}' does not exist. Available table: 'repos'`);
      }

      let filtered = repos;

      // WHERE clause evaluation
      if (whereClause) {
        const jsCond = whereClause
          .replace(/\bAND\b/gi, '&&')
          .replace(/\bOR\b/gi, '||')
          .replace(/(\w+)\s*=\s*(["'][^"']*["'])/g, 'row.$1 === $2')
          .replace(/(\w+)\s*!=\s*(["'][^"']*["'])/g, 'row.$1 !== $2')
          .replace(/(\w+)\s*(>=|<=|>|<)\s*(\d+)/g, '(row.$1 $2 $3)')
          .replace(/(\w+)\s*=\s*(\d+)/g, '(row.$1 === $2)')
          .replace(/(\w+)\s+LIKE\s+["']%([^"'%]+)%["']/gi, 'String(row.$1 || "").toLowerCase().includes("$2".toLowerCase())');

        const filterFn = new Function('row', `try { return !!(${jsCond}); } catch(e) { return false; }`);
        filtered = filtered.filter(filterFn);
      }

      // ORDER BY clause
      if (orderByClause) {
        const parts = orderByClause.trim().split(/\s+/);
        const col = parts[0];
        const desc = parts[1] && parts[1].toUpperCase() === 'DESC';

        filtered = [...filtered].sort((a, b) => {
          const valA = a[col];
          const valB = b[col];
          if (typeof valA === 'number' && typeof valB === 'number') {
            return desc ? valB - valA : valA - valB;
          }
          return desc
            ? String(valB || '').localeCompare(String(valA || ''))
            : String(valA || '').localeCompare(String(valB || ''));
        });
      }

      // LIMIT clause
      const limit = limitClause ? parseInt(limitClause, 10) : 50;
      const limited = filtered.slice(0, Math.min(limit, 500));

      // Column Projections
      let columns = [];
      let finalRows = [];

      if (colsRaw.trim() === '*') {
        columns = ['id', 'name', 'owner', 'stars', 'forks', 'language', 'domain', 'subsystem', 'license'];
        finalRows = limited;
      } else {
        columns = colsRaw.split(',').map((c) => c.trim()).filter(Boolean);
        finalRows = limited.map((row) => {
          const projected = { _rawRepo: row };
          columns.forEach((c) => {
            projected[c] = row[c] !== undefined ? row[c] : null;
          });
          return projected;
        });
      }

      const elapsed = (performance.now() - t0).toFixed(2);
      return {
        rows: finalRows,
        columns,
        elapsed,
        total: filtered.length,
        error: null
      };
    } catch (err) {
      return {
        rows: [],
        columns: [],
        elapsed: (performance.now() - t0).toFixed(2),
        total: 0,
        error: err.message
      };
    }
  }, [repos, query, executedAt]);

  const handleExportCsv = () => {
    if (!queryResult.rows || queryResult.rows.length === 0) return;

    const headers = queryResult.columns;
    const csvLines = [headers.join(',')];

    queryResult.rows.forEach((row) => {
      const line = headers.map((h) => {
        const val = row[h] !== undefined ? String(row[h]) : '';
        return `"${val.replace(/"/g, '""')}"`;
      });
      csvLines.push(line.join(','));
    });

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gitscour-query-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(query);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Studio Header Card */}
      <div className="bg-obs-surface border border-white/[0.07] rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-white/[0.06] border border-white/[0.12] text-zinc-100">
                <Terminal className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-white tracking-tight">
                In-Browser SQL Studio
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-signal-ok/[0.08] text-signal-ok border border-signal-ok/25 font-mono">
                Sub-5ms Execution Engine
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Query 123,153 repositories directly in browser memory with instant projection, sorting, and CSV export.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={queryResult.rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.09] disabled:opacity-40 text-xs font-semibold text-zinc-200 border border-white/[0.10] rounded-lg transition-colors"
              title="Export query results as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => setExecutedAt(Date.now())}
              className="btn-primary px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run Query</span>
            </button>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-[11px] text-zinc-400 font-semibold mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-signal-star" />
            Query Presets:
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setQuery(p.sql);
                setExecutedAt(Date.now());
              }}
              className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.07] text-zinc-300 hover:text-white border border-white/[0.09] text-[10px] font-medium transition-all"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* SQL Console Input */}
        <div className="relative">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                setExecutedAt(Date.now());
              }
            }}
            rows={5}
            placeholder="Write SQL query (e.g. SELECT name, stars FROM repos WHERE stars > 50000;)"
            className="w-full bg-obs-inset border border-white/[0.10] rounded-xl p-3.5 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/[0.07] leading-relaxed resize-y"
          />
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
            <button
              onClick={handleCopySql}
              className="p-1.5 text-zinc-400 hover:text-white rounded bg-white/[0.05] border border-white/[0.10] transition-colors"
              title="Copy SQL"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-signal-ok" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Query Status Bar */}
        <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-zinc-300">
              <Clock className="w-3 h-3 text-zinc-400" />
              <span>Executed in <strong className="num text-white">{queryResult.elapsed}ms</strong></span>
            </span>
            <span>&bull;</span>
            <span>
              Returned <strong className="num text-white">{queryResult.rows.length}</strong> rows 
              (matched <strong className="num text-zinc-300">{queryResult.total.toLocaleString()}</strong>)
            </span>
          </div>
          <span className="text-[10px] text-zinc-400 hidden sm:inline">
            Press <kbd className="px-1 py-0.5 rounded bg-white/[0.08] border border-white/[0.12] text-zinc-300 font-mono">Ctrl+Enter</kbd> to run
          </span>
        </div>
      </div>

      {/* Error Banner */}
      {queryResult.error && (
        <div className="bg-signal-risk/10 border border-signal-risk/30 rounded-xl p-4 text-xs text-signal-risk flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <pre className="whitespace-pre-wrap font-mono leading-relaxed">{queryResult.error}</pre>
        </div>
      )}

      {/* Query Results Table */}
      {!queryResult.error && queryResult.rows.length > 0 && (
        <div className="bg-obs-surface border border-white/[0.07] rounded-xl overflow-hidden shadow-sm">
          <div className="p-3 border-b border-white/[0.06] bg-obs-raised flex items-center justify-between">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <TableIcon className="w-3.5 h-3.5 text-zinc-300" />
              <span>Query Results ({queryResult.rows.length} rows)</span>
            </span>
            <span className="text-[10px] text-zinc-400">Click any row to open deep detail modal</span>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-obs-inset border-b border-white/[0.07] text-[10px] uppercase font-bold text-zinc-400 tracking-wider sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="py-2 px-3 text-zinc-500 font-mono w-10">#</th>
                  {queryResult.columns.map((col) => (
                    <th key={col} className="py-2 px-3">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] font-mono">
                {queryResult.rows.map((row, idx) => (
                  <tr
                    key={idx}
                    onClick={() => {
                      const repo = row._rawRepo || repos.find((r) => r.name === row.name);
                      if (repo && onSelectRepo) onSelectRepo(repo);
                    }}
                    className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <td className="py-2.5 px-3 text-zinc-600 num text-[10px]">
                      {idx + 1}
                    </td>
                    {queryResult.columns.map((col) => {
                      const val = row[col];
                      const isStars = col === 'stars';
                      const isForks = col === 'forks';
                      const isName = col === 'name';

                      return (
                        <td
                          key={col}
                          className={`py-2.5 px-3 truncate max-w-xs ${
                            isName ? 'font-semibold text-white group-hover:underline' :
                            isStars ? 'text-signal-star num font-medium' :
                            isForks ? 'text-zinc-300 num' :
                            'text-zinc-300'
                          }`}
                        >
                          {val === null || val === undefined ? (
                            <span className="text-zinc-600 italic">null</span>
                          ) : typeof val === 'number' ? (
                            val.toLocaleString()
                          ) : (
                            String(val)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Schema Reference Accordion / Helper */}
      <div className="bg-obs-surface border border-white/[0.07] rounded-xl p-4 text-xs space-y-2">
        <span className="font-semibold text-white flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
          <span>Available Schema Fields (`repos` table)</span>
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
          <div className="bg-obs-inset p-2 rounded border border-white/[0.05]">
            <span className="text-white block font-bold">name</span>
            <span className="text-zinc-500 text-[10px]">string &bull; repository name</span>
          </div>
          <div className="bg-obs-inset p-2 rounded border border-white/[0.05]">
            <span className="text-white block font-bold">stars</span>
            <span className="text-zinc-500 text-[10px]">number &bull; stargazer count</span>
          </div>
          <div className="bg-obs-inset p-2 rounded border border-white/[0.05]">
            <span className="text-white block font-bold">language</span>
            <span className="text-zinc-500 text-[10px]">string &bull; primary language</span>
          </div>
          <div className="bg-obs-inset p-2 rounded border border-white/[0.05]">
            <span className="text-white block font-bold">domain</span>
            <span className="text-zinc-500 text-[10px]">string &bull; architectural domain</span>
          </div>
          <div className="bg-obs-inset p-2 rounded border border-white/[0.05]">
            <span className="text-white block font-bold">subsystem</span>
            <span className="text-zinc-500 text-[10px]">string &bull; specific subsystem</span>
          </div>
          <div className="bg-obs-inset p-2 rounded border border-white/[0.05]">
            <span className="text-white block font-bold">artifact</span>
            <span className="text-zinc-500 text-[10px]">string &bull; engine, lib, cli, docs</span>
          </div>
          <div className="bg-obs-inset p-2 rounded border border-white/[0.05]">
            <span className="text-white block font-bold">license</span>
            <span className="text-zinc-500 text-[10px]">string &bull; MIT, Apache-2.0, etc.</span>
          </div>
          <div className="bg-obs-inset p-2 rounded border border-white/[0.05]">
            <span className="text-white block font-bold">owner</span>
            <span className="text-zinc-500 text-[10px]">string &bull; organization / user</span>
          </div>
        </div>
      </div>
    </div>
  );
}
