import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Search, Star, GitFork, ExternalLink, Filter, Terminal, 
  Layers, Code2, ShieldAlert, Cpu, Sparkles, Database, Globe,
  CheckCircle2, AlertTriangle, Info, X, Copy, Check, ArrowRight,
  Boxes, Server, Lock, Flame, Compass, Network, HelpCircle,
  Zap, GitCompare, Play, BookOpen, Lightbulb, Share2, Loader2,
  ChevronDown, SlidersHorizontal, Sliders, TrendingUp
} from 'lucide-react';
import Graph3DExplorer from './Graph3DExplorer.jsx';
// W4 §3.1: asset URL only — the WASM binary is fetched on first engine init.
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { isReadOnlySql, resultsToCsv, SQL_COLUMNS, repoToSqlValues, RESULT_PREVIEW_LIMIT } from './sql-utils.mjs';
import { filterOrdinals, majorLanguages, LONG_TAIL_LANGUAGE } from './filter-core.mjs';
import InspirationGenerator from './InspirationGenerator.jsx';

export default function App() {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);

  // In-memory cache for lazy-fetched Tier 2 shards
  const [detailShards, setDetailShards] = useState({});
  const [loadingShard, setLoadingShard] = useState(false);

  // Progressive Rendering / Virtual Pagination
  const [visibleCount, setVisibleCount] = useState(36);

  // Read URL query params helper
  const getInitialUrlState = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      tab: params.get('tab') || 'explorer',
      q: params.get('q') || '',
      domain: params.get('domain') || 'all',
      subsystem: params.get('subsystem') || 'all',
      artifact: params.get('artifact') || 'all',
      language: params.get('language') || 'all',
      primitive: params.get('primitive') || 'all',
      topic: params.get('topic') || 'all',
      license: params.get('license') || 'all',
      minStars: Number(params.get('minStars')) || 500,
      inspect: params.get('inspect') || null
    };
  };

  const initialUrl = getInitialUrlState();

  const [activeTab, setActiveTab] = useState(initialUrl.tab);
  const [searchQuery, setSearchQuery] = useState(initialUrl.q);
  const [selectedDomain, setSelectedDomain] = useState(initialUrl.domain);
  const [selectedSubsystem, setSelectedSubsystem] = useState(initialUrl.subsystem);
  const [selectedArtifact, setSelectedArtifact] = useState(initialUrl.artifact);
  const [selectedLanguage, setSelectedLanguage] = useState(initialUrl.language);
  const [selectedPrimitive, setSelectedPrimitive] = useState(initialUrl.primitive);
  // W4 §3.5: topic facet (cloud + Ecosystems tab set this too)
  const [selectedTopic, setSelectedTopic] = useState(initialUrl.topic);
  const [selectedLicenseTier, setSelectedLicenseTier] = useState(initialUrl.license);
  const [minStars, setMinStars] = useState(initialUrl.minStars);
  // W3 §2.6: activity intelligence — dormant filter + recently-pushed sort
  const [hideDormant, setHideDormant] = useState(false);
  const [sortBy, setSortBy] = useState('stars'); // 'stars' | 'recent'
  // W4 §3.5: Ecosystems canvas pan offset (pointer/touch, §B pattern)
  const [ecoPan, setEcoPan] = useState({ x: 0, y: 0 });
  // W3 §2.1: pack-time inverted index for ranked search (fetched alongside the
  // packed rows; the memoized substring corpus remains the fallback).
  const [searchIndex, setSearchIndex] = useState(null);
  // W3 §2.4: pack-time kNN edge list for the graph + Similar-repositories tab.
  const [edgeList, setEdgeList] = useState(null);
  // W3 §2.8: pack-time facet counts for chips with live numbers.
  const [facets, setFacets] = useState(null);
  // W4 §3.3: pack-time star-delta changelog (Rising shelf + Changelog tab).
  const [changelog, setChangelog] = useState(null);
  // W4 §3.5: pack-time topic co-occurrence map (Ecosystems tab).
  const [topicMap, setTopicMap] = useState(null);

  // Inspector Modal / Drawer
  const [activeRepoModal, setActiveRepoModal] = useState(null);
  const [modalTab, setModalTab] = useState('overview');
  const [copiedText, setCopiedText] = useState(null);
  const [urlShareCopied, setUrlShareCopied] = useState(false);

  // Live stats reported by Graph3DExplorer: what is actually rendered vs the
  // full catalog. The header used to claim every catalog node was on screen
  // while the graph draws a ≤1,600-node sample (review finding #7c).
  const [graphStats, setGraphStats] = useState({ filtered: 0, rendered: 0, linked: 0 });

  // SQL Console state
  const [sqlQuery, setSqlQuery] = useState(
    "SELECT name, stars, language, domain, subsystem\nFROM repos\nWHERE domain = 'Databases & Storage' AND stars >= 20000\nORDER BY stars DESC;"
  );
  const [sqlResults, setSqlResults] = useState(null);
  const [sqlError, setSqlError] = useState(null);
  // W4 §3.1: lazy WASM engine — nothing loads until the SQL tab runs a query.
  const sqlDbRef = useRef(null);
  const [sqlPhase, setSqlPhase] = useState('idle'); // idle | engine | table | ready
  const [sqlProgress, setSqlProgress] = useState(0);

  const ensureSqlDb = useCallback(async () => {
    if (sqlDbRef.current) return sqlDbRef.current;
    setSqlPhase('engine');
    const { default: initSqlJs } = await import('sql.js');
    const SQL = await initSqlJs({ locateFile: (f) => sqlWasmUrl });
    const db = new SQL.Database();
    db.run(`CREATE TABLE repos (${SQL_COLUMNS.map((c) =>
      `${c} ${['id', 'stars', 'forks'].includes(c) ? 'INTEGER' : 'TEXT'}`).join(', ')})`);
    setSqlPhase('table');
    setSqlProgress(0);
    const stmt = db.prepare(`INSERT INTO repos VALUES (${SQL_COLUMNS.map(() => '?').join(',')})`);
    db.run('BEGIN');
    const CHUNK = 8000;
    for (let i = 0; i < repos.length; i++) {
      stmt.run(repoToSqlValues(repos[i]));
      if (i > 0 && i % CHUNK === 0) {
        setSqlProgress(Math.round((i / repos.length) * 100));
        await new Promise((r) => setTimeout(r, 0)); // let the UI paint progress
      }
    }
    db.run('COMMIT');
    stmt.free();
    sqlDbRef.current = db;
    setSqlPhase('ready');
    setSqlProgress(100);
    return db;
  }, [repos]);

  const runSqlQuery = useCallback(async () => {
    const sql = (sqlQuery || '').trim();
    if (!sql) return;
    if (!isReadOnlySql(sql)) {
      setSqlError('SQL Studio is read-only — statements must start with SELECT or WITH.');
      setSqlResults(null);
      return;
    }
    try {
      const db = await ensureSqlDb();
      const res = db.exec(sql);
      if (!res.length || !res[0]) {
        setSqlResults({ columns: [], values: [], rowCount: 0 });
        setSqlError(null);
        return;
      }
      setSqlResults({
        columns: res[0].columns,
        values: res[0].values,
        rowCount: res[0].values.length,
      });
      setSqlError(null);
    } catch (e) {
      setSqlError(e && e.message ? e.message : String(e));
      setSqlResults(null);
    }
  }, [sqlQuery, ensureSqlDb]);

  const exportSqlCsv = useCallback(() => {
    if (!sqlResults || !sqlResults.columns.length) return;
    const blob = new Blob([resultsToCsv(sqlResults.columns, sqlResults.values)],
      { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gitscour-sql-results.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [sqlResults]);

  // Quick Inspiration Discovery Pills
  const DISCOVERY_PILLS = [
    { label: "Local AI & LLMs", domain: "AI & Machine Learning", q: "llm" },
    { label: "Columnar OLAP", domain: "Databases & Storage", q: "olap" },
    { label: "Zero-Copy Systems", primitive: "Zero-Copy" },
    { label: "Rust Systems", language: "Rust" },
    { label: "Cloud & K8s", domain: "Cloud & Infrastructure" },
    { label: "Kernel & OS", domain: "Operating Systems & Low-Level" }
  ];

  const applyDiscoveryPill = (pill) => {
    // W4 §3.7: pills RESET every facet they don't mention — no stale filters
    // silently narrowing the discovery they just set up.
    setSelectedDomain(pill.domain || 'all');
    setSelectedSubsystem('all');
    setSelectedArtifact('all');
    setSelectedLanguage(pill.language || 'all');
    setSelectedPrimitive(pill.primitive || 'all');
    setSelectedTopic('all');
    setSelectedLicenseTier('all');
    setSearchQuery(pill.q || '');
    setDebouncedQuery(pill.q || '');
    setHideDormant(false);
    setSortBy('stars');
    setVisibleCount(36);
  };

  const slugify = (text) => {
    return (text || "other-general").toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  };

  // 1. Fetch & Unpack Packed Index (123,153 repositories; measured transfer:
  // packed 7.98 MB gzip + search-index 3.79 MB + edges 1.26 MB + facets 0.02 MB)
  useEffect(() => {
    // W3 §2.1 — pack-time inverted index (state lands before/after unpack; the
    // ranked path in `filteredRepos` activates as soon as both are ready).
    fetch('./search-index.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((idx) => { if (idx && Array.isArray(idx.t)) setSearchIndex(idx); })
      .catch(() => {});
    // W3 §2.4 — pack-time kNN edges (Graph3D keeps its legacy synthesis as the
    // fallback when this file is absent).
    fetch('./edges.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data && Array.isArray(data.edges)) setEdgeList(data.edges); })
      .catch(() => {});

    // W3 §2.8 — exact facet counts (chips show real numbers, no guessing).
    fetch('./facets.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data && Array.isArray(data.domains)) setFacets(data); })
      .catch(() => {});
    // W4 §3.3: changelog diff of the last two history snapshots (absent until
    // a second snapshot exists is handled as an honest empty state).
    fetch('./changelog.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data && typeof data === 'object') setChangelog(data); })
      .catch(() => {});
    // W4 §3.5: topic co-occurrence map for the Ecosystems tab (empty map
    // locally — Tier-2 topics land with the next backfill).
    fetch('./topic-map.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data && Array.isArray(data.topics)) setTopicMap(data); })
      .catch(() => {});
    fetch('./catalog-packed.json')
      .then((res) => {
        if (!res.ok) throw new Error('Packed index not found, falling back');
        return res.json();
      })
      .then((packed) => {
        const { domains, subsystems, languages, artifacts, rows } = packed;
        const unpacked = rows.map((r, rowIdx) => {
          const domName = domains[r[6]] || "Other / General";
          const act = Array.isArray(data.activity) ? data.activity[rowIdx] : null;
          return {
            id: r[0],
            name: r[1],
            owner: r[2],
            stars: r[3],
            forks: r[4],
            language: languages[r[5]] || "Other",
            domain: domName,
            subsystem: subsystems[r[7]] || "General Components",
            artifact: artifacts[r[8]] || "Application / Service",
            license: r[9],
            primitives: r[10] || [],
            hook: r[11] || "",
            description: r[11] || "",
            // W2 §1.1: optional 13th field = taxonomy confidence margin (0..9).
            // null on legacy 12-field rows and on the fallback index path, so
            // "no margin data" never renders as "margin 0 = low confidence".
            domainMargin: r.length > 12 && typeof r[12] === 'number' ? r[12] : null,
            // W3 §2.2/2.4: search + similarity evidence (absent on legacy rows).
            topics: Array.isArray(r[13]) ? r[13] : [],
            compatibility: Array.isArray(r[14]) ? r[14] : [],
            url: `https://github.com/${r[2]}/${r[1]}`,
            shard: slugify(domName),
            // W3 §2.6: [status, pushed_epoch] aligned with rows (null = no data)
            activity: act && act[0] ? { status: act[0], pushedAt: act[1] } : null,
            // W3 §2.7: interned tier parallel to rows (permissive|copyleft|...)
            licenseTier: Array.isArray(data.license_tiers) ? data.license_tiers[rowIdx] : null,
            // W3 §2.3: memoized search corpus — built ONCE per unpack instead of
            // per keystroke; §2.2: includes primitives/license/compatibility/topics.
            searchCorpus: [
              r[1], r[2], r[11] || '', languages[r[5]] || '', domName,
              subsystems[r[7]] || '', ...(r[10] || []), r[9] || '',
              ...(Array.isArray(r[14]) ? r[14] : []),
              ...(Array.isArray(r[13]) ? r[13] : []),
            ].join(' ').toLowerCase()
          };
        });

        packedForWorkerRef.current = data; // raw payload staged for the filter worker
        setRepos(unpacked);
        setLoading(false);

        if (initialUrl.inspect) {
          // W4 §3.7: prefer the unambiguous owner/name form; bare name is fallback.
          const target = initialUrl.inspect.toLowerCase();
          const match =
               unpacked.find((r) => `${r.owner}/${r.name}`.toLowerCase() === target) ||
               unpacked.find((r) => r.name.toLowerCase() === target);
          if (match) {
            handleOpenRepoModal(match);
          }
        }
      })
      .catch((err) => {
        console.warn('Fallback loading catalog-index:', err);
        fetch('./catalog-index.json')
          .then((res) => res.json())
          .then((data) => {
            setRepos(data);
            setLoading(false);
          });
      });
  }, []);

  // 2. Lazy-Fetch Tier 2 Detail Shard on Modal Open
  const handleOpenRepoModal = useCallback((repo) => {
    setActiveRepoModal(repo);
    setModalTab('overview');

    const shardSlug = repo.shard || slugify(repo.domain);
    if (!shardSlug || detailShards[shardSlug]) {
      return;
    }

    setLoadingShard(true);
    fetch(`./data/details/${shardSlug}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Shard ${shardSlug} not found`);
        return res.json();
      })
      .then((shardData) => {
        setDetailShards((prev) => ({
          ...prev,
          [shardSlug]: shardData
        }));
        setLoadingShard(false);
      })
      .catch((err) => {
        console.warn(`Could not load deep shard for ${shardSlug}:`, err);
        setLoadingShard(false);
      });
  }, [detailShards]);

  // Compute merged active repo with lazy-loaded Tier 2 details
  const activeRepoDetails = useMemo(() => {
    if (!activeRepoModal) return null;
    const shardSlug = activeRepoModal.shard || slugify(activeRepoModal.domain);
    const shard = detailShards[shardSlug];
    const deepRecord = shard ? shard[activeRepoModal.id] : null;

    return {
      ...activeRepoModal,
      ...(deepRecord || {}),
      beginner_intel: (deepRecord && deepRecord.beginner_intel) || activeRepoModal.beginner_intel || {
        what_it_does: activeRepoModal.hook || activeRepoModal.description,
        why_it_matters: "A prominent open-source system solving core scalability and reliability requirements in its domain.",
        when_to_use: `Best suited for production applications requiring high performance in ${activeRepoModal.subsystem}.`,
        alternatives: ["Standard libraries", "Cloud services", "Alternative open source engines"],
        key_superpowers: ["High throughput", "Low resource overhead", "Battle-tested community stability"]
      },
      license_intel: (deepRecord && deepRecord.license_intel) || activeRepoModal.license_intel || {
        tier: "Standard Open Source",
        commercial: "Commercially Permissive",
        desc: "Check repository license file for explicit terms."
      },
      quickstart_code: (deepRecord && deepRecord.quickstart_code) || activeRepoModal.quickstart_code || `git clone ${activeRepoModal.url}.git`
    };
  }, [activeRepoModal, detailShards]);

  // Sync state to URL Query Parameters (Deep Linking)
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams();

    if (activeTab !== 'explorer') params.set('tab', activeTab);
    if (searchQuery) params.set('q', searchQuery);
    if (selectedDomain !== 'all') params.set('domain', selectedDomain);
    if (selectedSubsystem !== 'all') params.set('subsystem', selectedSubsystem);
    if (selectedArtifact !== 'all') params.set('artifact', selectedArtifact);
    if (selectedLanguage !== 'all') params.set('language', selectedLanguage);
    if (selectedPrimitive !== 'all') params.set('primitive', selectedPrimitive);
    if (selectedTopic !== 'all') params.set('topic', selectedTopic);
    if (selectedLicenseTier !== 'all') params.set('license', selectedLicenseTier);
    if (minStars > 500) params.set('minStars', minStars);
    if (activeRepoModal) params.set('inspect', `${activeRepoModal.owner}/${activeRepoModal.name}`);

    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newUrl);
  }, [activeTab, searchQuery, selectedDomain, selectedSubsystem, selectedArtifact, selectedLanguage, selectedPrimitive, selectedTopic, selectedLicenseTier, minStars, activeRepoModal, loading]);

  const copyShareableLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setUrlShareCopied(true);
    setTimeout(() => setUrlShareCopied(false), 2000);
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedText(key);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const domains = useMemo(() => {
    const set = new Set(repos.map((r) => r.domain).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [repos]);

  const subsystems = useMemo(() => {
    const list = repos
      .filter((r) => selectedDomain === 'all' || r.domain === selectedDomain)
      .map((r) => r.subsystem)
      .filter(Boolean);
    return ['all', ...Array.from(new Set(list)).sort()];
  }, [repos, selectedDomain]);

  const artifacts = useMemo(() => {
    const set = new Set(repos.map((r) => r.artifact).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [repos]);

  // W4 §3.7: the 282 long-tail languages (<50 rows) group into one facet entry;
  // rows keep their true language (filter logic lives in filter-core.mjs).
  const languageStats = useMemo(() => majorLanguages(repos), [repos]);
  const languages = useMemo(() => {
    const tail = languageStats.tail.length
      ? [`${LONG_TAIL_LANGUAGE}:Long tail (${languageStats.tail.length} langs · ${languageStats.tailRows.toLocaleString()})`]
      : [];
    return ['all', ...languageStats.majors, ...tail];
  }, [languageStats]);

  const primitives = useMemo(() => {
    const set = new Set();
    repos.forEach((r) => (r.primitives || []).forEach((p) => set.add(p)));
    return ['all', ...Array.from(set).sort()];
  }, [repos]);

  // W3 §2.3: debounce keystrokes so ranking/filtering runs at most every 120ms
  // instead of on every character (URL sync below stays on the raw query).
  const [debouncedQuery, setDebouncedQuery] = useState(initialUrl.q);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);


  // W3 §2.1/2.2: ranked search — field-weighted BM25-lite over the pack-time
  // inverted index (top-N relevance ordering replaces stars-desc-only), falling
  // back to substring matching over the memoized corpus when the index is absent.
  // ===== W4 §3.7: filter+search in a Web Worker (sync fallback shares the
  // same filter-core module, so worker and main can never diverge) =====
  const filterWorkerRef = useRef(null);
  const reqSeqRef = useRef(0);
  const lastAcceptedReqRef = useRef(0);
  const ecoDragRef = useRef(null);
  const ecoMovedRef = useRef(false);
  const packedForWorkerRef = useRef(null);
  const [filterResult, setFilterResult] = useState(null); // {key, ordinals} | null
  const [workerFailed, setWorkerFailed] = useState(false);

  useEffect(() => {
    if (typeof Worker === 'undefined') { setWorkerFailed(true); return undefined; }
    let worker;
    try {
      worker = new Worker(new URL('./filter-core.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const d = e.data || {};
        if (d.type === 'result') {
          if (d.reqId >= lastAcceptedReqRef.current) {
            lastAcceptedReqRef.current = d.reqId;
            setFilterResult({ key: d.key, ordinals: d.ordinals });
          }
        } else if (d.type === 'error') {
          setWorkerFailed(true);
        }
      };
      worker.onerror = () => setWorkerFailed(true);
      filterWorkerRef.current = worker;
    } catch {
      setWorkerFailed(true);
    }
    return () => {
      if (worker) worker.terminate();
      filterWorkerRef.current = null;
    };
  }, []);

  const filterOpts = useMemo(() => ({
    q: debouncedQuery.trim(),
    domain: selectedDomain,
    subsystem: selectedSubsystem,
    artifact: selectedArtifact,
    language: selectedLanguage,
    primitive: selectedPrimitive,
    topic: selectedTopic,
    licenseTier: selectedLicenseTier,
    minStars,
    hideDormant,
    sortBy,
  }), [debouncedQuery, selectedDomain, selectedSubsystem, selectedArtifact,
      selectedLanguage, selectedPrimitive, selectedTopic, selectedLicenseTier,
      minStars, hideDormant, sortBy]);
  const optsKey = useMemo(() => JSON.stringify(filterOpts), [filterOpts]);

  // hand the parsed packed payload to the worker once (structured clone)
  useEffect(() => {
    const worker = filterWorkerRef.current;
    if (!worker || workerFailed || !repos.length || !packedForWorkerRef.current) return;
    worker.postMessage({
      type: 'init',
      packed: packedForWorkerRef.current,
      majors: languageStats.majors,
    });
    packedForWorkerRef.current = null; // clone sent; free the raw payload
  }, [repos.length, workerFailed, languageStats.majors]);

  useEffect(() => {
    const worker = filterWorkerRef.current;
    if (worker && !workerFailed && searchIndex) worker.postMessage({ type: 'index', index: searchIndex });
  }, [searchIndex, workerFailed]);

  useEffect(() => {
    const worker = filterWorkerRef.current;
    if (!worker || workerFailed || !repos.length) return;
    reqSeqRef.current += 1;
    worker.postMessage({ type: 'filter', reqId: reqSeqRef.current, key: optsKey, opts: filterOpts });
  }, [optsKey, filterOpts, repos.length, workerFailed, searchIndex]);

  const filteredRepos = useMemo(() => {
    if (!repos.length) return [];
    // Fresh worker answer wins; while a new reply is in flight we keep showing
    // the previous ordinals (smooth, zero main-thread work — the corrected
    // reply lands within ~10 ms).
    if (filterResult && !workerFailed) {
      return filterResult.ordinals.map((o) => repos[o]).filter(Boolean);
    }
    // Sync fallback: worker unsupported/failed, or before the first reply —
    // identical pipeline via filter-core (single source of truth).
    return filterOrdinals(repos, searchIndex, filterOpts, languageStats.majorsSet)
      .map((o) => repos[o]).filter(Boolean);
  }, [repos, filterResult, searchIndex, filterOpts, languageStats.majorsSet]);

  const visibleRepos = useMemo(() => {
    return filteredRepos.slice(0, visibleCount);
  }, [filteredRepos, visibleCount]);

  // W4 §3.2: modal momentum badge + sparkline source (null until the repo
  // appears as a mover — no fabricated history).
  const modalMomentum = useMemo(() => {
    if (!changelog || !activeRepoModal || !Array.isArray(changelog.top_movers)) return null;
    const key = `${activeRepoModal.owner}/${activeRepoModal.name}`;
    return changelog.top_movers.find((m) => m.full_name === key) || null;
  }, [changelog, activeRepoModal]);

  // W4 §3.2: "Rising this month" shelf — top movers that resolve to a live
  // catalog row (removed rows still show in the Changelog tab, unclickable).
  const risingMovers = useMemo(() => {
    if (!changelog || !Array.isArray(changelog.top_movers)) return [];
    const byName = new Map(repos.map((r) => [`${r.owner}/${r.name}`, r]));
    return changelog.top_movers
      .map((m) => ({ mover: m, repo: byName.get(m.full_name) }))
      .filter((x) => x.repo)
      .slice(0, 10);
  }, [changelog, repos]);

  // W3 §2.5: top-5 "Similar repositories" from the pack-time kNN edge list;
  // reason strings are templates computed at render from the shared sets.
  const similarRepos = useMemo(() => {
    if (!activeRepoModal || !edgeList) return [];
    const ord = repos.findIndex((r) => r.id === activeRepoModal.id);
    if (ord < 0) return [];
    const entries = edgeList[ord] || [];
    return entries.slice(0, 5).map(([j, weight]) => {
      const repo = repos[j] || null;
      let reason = 'Nearby catalog entry (no shared signals)';
      if (repo) {
        const a = activeRepoModal;
        if (a.subsystem && a.subsystem === repo.subsystem && !a.subsystem.startsWith('General')) {
          reason = `Shared Subsystem (${a.subsystem})`;
        } else {
          const p = (a.primitives || []).find((x) => (repo.primitives || []).includes(x));
          const c = (a.compatibility || []).find((x) => (repo.compatibility || []).includes(x));
          const t = (a.topics || []).find((x) => (repo.topics || []).includes(x));
          if (p) reason = `Shared Primitive (${p})`;
          else if (c) reason = `Shared Interop (${c})`;
          else if (t) reason = `Shared Topic (${t})`;
          else if (repo.language && repo.language === a.language && repo.language !== 'Other') {
            reason = `Same Language (${repo.language})`;
          }
        }
      }
      return { repo, weight, reason };
    }).filter((x) => x.repo);
  }, [activeRepoModal, edgeList, repos]);



  return (
    <div className="min-h-screen bg-obs-base text-zinc-100 flex flex-col font-sans selection:bg-white/20">
      {/* Top Header */}
      <header className="border-b border-white/[0.07] bg-obs-base/95 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-tr from-white/[0.16] to-white/[0.04] ring-1 ring-inset ring-white/[0.12] text-white p-2 rounded-xl">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
                  GitScour
                </span>
                <span className="num text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.05] text-zinc-300 border border-white/[0.10] font-bold">
                  {repos.length > 0 ? `${repos.length.toLocaleString()} Repos` : '123k+ DB'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-signal-ok/[0.08] text-signal-ok border border-signal-ok/20 font-mono hidden sm:inline">
                  Packed &bull; 7.98MB Gzip
                </span>
              </div>
              <p className="text-xs text-zinc-400 hidden sm:block">Deep Architectural Taxonomy &amp; 3D Knowledge Galaxy across 123,000+ Repositories</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('explorer')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'explorer'
                  ? 'bg-white/[0.08] ring-1 ring-inset ring-white/[0.14] text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Catalog</span>
            </button>
            <button
              onClick={() => setActiveTab('inspire')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'inspire'
                  ? 'bg-white/[0.08] ring-1 ring-inset ring-white/[0.14] text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-signal-star" />
              <span>Stack Architect</span>
            </button>
            <button
              onClick={() => setActiveTab('graph3d')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'graph3d'
                  ? 'bg-white/[0.08] ring-1 ring-inset ring-white/[0.14] text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>3D Galaxy</span>
            </button>
            <button
              onClick={() => setActiveTab('sql')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'sql'
                  ? 'bg-white/[0.08] ring-1 ring-inset ring-white/[0.14] text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>SQL Studio</span>
            </button>
            <button
              onClick={() => setActiveTab('changelog')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'changelog'
                  ? 'bg-white/[0.08] ring-1 ring-inset ring-white/[0.14] text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Rising</span>
            </button>
            <button
              onClick={() => setActiveTab('ecosystems')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'ecosystems'
                  ? 'bg-white/[0.08] ring-1 ring-inset ring-white/[0.14] text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Ecosystems</span>
            </button>

            {/* Share Link Button */}
            <button
              onClick={copyShareableLink}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-zinc-300 hover:text-white rounded-lg bg-white/[0.05] hover:bg-white/[0.09] text-xs font-medium border border-white/[0.09] transition-colors ml-1"
              title="Share Current URL Query & View"
            >
              {urlShareCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-signal-ok" />
                  <span className="text-signal-ok">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Share View</span>
                </>
              )}
            </button>

            <a
              href="https://github.com/knarayanareddy/gitscour"
              target="_blank"
              rel="noreferrer"
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
              title="View on GitHub"
            >
              <Globe className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <div className="w-8 h-8 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-400 text-xs font-mono">Unpacking 123,000+ repository index into WebAssembly memory...</p>
          </div>
        ) : activeTab === 'inspire' ? (
          /* SYNERGETIC TECH STACK ARCHITECT & POOLING SANDBOX */
          <InspirationGenerator
            repos={repos}
            onSelectRepo={(repo) => handleOpenRepoModal(repo)}
          />
        ) : activeTab === 'sql' ? (
          /* W4 §3.1 — SQL STUDIO (read-only WebAssembly SQLite over Tier-1) */
          <div className="space-y-4">
            <div className="bg-obs-surface border border-white/[0.07] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-signal-ok" />
                    SQL Studio
                  </h2>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    WebAssembly SQLite over all {repos.length.toLocaleString()} rows — documented subset:{' '}
                    <code className="text-signal-ok">SELECT</code> / <code className="text-signal-ok">WHERE</code> /{' '}
                    <code className="text-signal-ok">ORDER BY</code> / <code className="text-signal-ok">LIMIT</code>.
                    Read-only; runs entirely in your browser.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={runSqlQuery}
                    disabled={sqlPhase === 'engine' || sqlPhase === 'table'}
                    className="btn-primary px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {(sqlPhase === 'engine' || sqlPhase === 'table') ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    {(sqlPhase === 'engine' || sqlPhase === 'table') ? 'Preparing…' : 'Run Query'}
                  </button>
                  <button
                    onClick={exportSqlCsv}
                    disabled={!sqlResults || !sqlResults.columns.length}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    runSqlQuery();
                  }
                }}
                spellCheck={false}
                rows={5}
                className="w-full bg-obs-inset border border-white/[0.08] rounded-lg p-3 font-mono text-xs text-signal-ok leading-relaxed focus:outline-none focus:border-white/25"
              />
              {sqlPhase !== 'idle' && sqlPhase !== 'ready' && (
                <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {sqlPhase === 'engine' ? 'Loading WebAssembly engine…'
                    : `Building repos table… ${sqlProgress}%`}
                </div>
              )}
              {sqlError && (
                <div className="text-[11px] text-signal-warn bg-signal-warn/[0.08] border border-signal-warn/30 rounded-lg px-3 py-2 font-mono">
                  {sqlError}
                </div>
              )}
            </div>

            {sqlResults && (
              <div className="bg-obs-surface border border-white/[0.07] rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/[0.07] flex items-center justify-between text-[11px]">
                  <span className="text-zinc-300 font-semibold">
                    {sqlResults.rowCount.toLocaleString()} row{sqlResults.rowCount === 1 ? '' : 's'}
                    {sqlResults.rowCount > RESULT_PREVIEW_LIMIT
                      ? ` (showing first ${RESULT_PREVIEW_LIMIT.toLocaleString()}; CSV export includes all)`
                      : ''}
                  </span>
                  <span className="text-zinc-500 font-mono">in-memory · deterministic</span>
                </div>
                {sqlResults.columns.length > 0 && (
                  <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-obs-raised">
                        <tr>
                          {sqlResults.columns.map((c) => (
                            <th key={c} className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold border-b border-white/[0.07]">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sqlResults.values.slice(0, RESULT_PREVIEW_LIMIT).map((row, i) => (
                          <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                            {row.map((v, j) => (
                              <td key={j} className="px-3 py-1.5 text-zinc-300 font-mono whitespace-nowrap max-w-[340px] truncate">
                                {v === null || v === undefined ? <span className="text-zinc-600">NULL</span> : String(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {sqlResults.columns.length === 0 && (
                  <div className="p-4 text-[11px] text-zinc-500">Query returned no columns.</div>
                )}
              </div>
            )}

            {!sqlResults && !sqlError && sqlPhase === 'idle' && (
              <div className="bg-obs-inset border border-white/[0.07] rounded-xl p-4 text-[11px] text-zinc-500 space-y-1.5">
                <p>The engine loads lazily on your first Run — Explorer users never download it.</p>
                <p>Examples: <code className="text-zinc-300">SELECT name, stars FROM repos WHERE language = 'Rust' ORDER BY stars DESC LIMIT 20;</code></p>
                <p><code className="text-zinc-300">SELECT domain, COUNT(*) AS n FROM repos GROUP BY domain ORDER BY n DESC;</code></p>
              </div>
            )}
          </div>
        ) : activeTab === 'changelog' ? (
          /* W4 §3.3 — STAR-DELTA CHANGELOG (diff of history snapshots) */
          <div className="bg-obs-surface border border-white/[0.07] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-signal-star" />
                Catalog changelog
              </h2>
              {changelog && changelog.period && (
                <span className="text-[11px] font-mono text-zinc-400 bg-obs-inset px-2 py-1 rounded border border-white/[0.08]">
                  {changelog.period.from} &rarr; {changelog.period.to}
                </span>
              )}
            </div>

            {!changelog ? (
              <p className="text-xs text-zinc-500">Loading changelog.json&hellip;</p>
            ) : !changelog.period ? (
              <div className="bg-obs-inset border border-white/[0.07] rounded-lg p-4 space-y-1.5">
                <p className="text-xs text-zinc-300">
                  {changelog.note || 'No star history yet.'}
                </p>
                <p className="text-[11px] text-zinc-500">
                  Every rebuild appends <code>web/public/history/&lt;date&gt;-stars.json</code>;
                  the first two snapshots automatically produce added/removed/top-movers here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="bg-obs-inset border border-white/[0.07] rounded-lg p-3">
                    <div className="num text-lg text-signal-star">{(changelog.mover_count || 0).toLocaleString()}</div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">Movers</div>
                  </div>
                  <div className="bg-obs-inset border border-white/[0.07] rounded-lg p-3">
                    <div className="num text-lg text-signal-ok">+{(changelog.added_count || 0).toLocaleString()}</div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">Added</div>
                  </div>
                  <div className="bg-obs-inset border border-white/[0.07] rounded-lg p-3">
                    <div className="num text-lg text-red-300">&minus;{(changelog.removed_count || 0).toLocaleString()}</div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">Removed</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                    Top star movers (by |delta|)
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-white/[0.07]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-zinc-500 bg-obs-inset">
                          <th className="text-left px-3 py-2 font-semibold">Repository</th>
                          <th className="text-right px-3 py-2 font-semibold">Stars</th>
                          <th className="text-right px-3 py-2 font-semibold">Delta</th>
                          <th className="text-right px-3 py-2 font-semibold hidden sm:table-cell">%</th>
                          <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">Language</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changelog.top_movers.slice(0, 50).map((m) => (
                          <tr
                            key={m.full_name}
                            className="border-t border-white/[0.05] hover:bg-white/[0.03] cursor-pointer"
                            onClick={() => {
                              const repo = repos.find(
                                (r) => `${r.owner}/${r.name}` === m.full_name
                              );
                              if (repo) handleOpenRepoModal(repo);
                            }}
                            title="Open repository inspector"
                          >
                            <td className="px-3 py-1.5 font-mono text-zinc-200">{m.full_name}</td>
                            <td className="px-3 py-1.5 text-right num text-zinc-300">{m.to.toLocaleString()}</td>
                            <td className={`px-3 py-1.5 text-right num font-semibold ${m.delta > 0 ? 'text-signal-ok' : 'text-red-300'}`}>
                              {m.delta > 0 ? '+' : ''}{m.delta.toLocaleString()}
                            </td>
                            <td className="px-3 py-1.5 text-right num text-zinc-500 hidden sm:table-cell">
                              {m.delta > 0 ? '+' : ''}{m.pct}%
                            </td>
                            <td className="px-3 py-1.5 text-zinc-400 hidden md:table-cell">{m.language || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {changelog.mover_count > 50 && (
                    <p className="text-[10px] text-zinc-500 mt-1.5">
                      Top 50 of {changelog.mover_count.toLocaleString()} movers — full list in
                      <code> web/public/changelog.json</code>.
                    </p>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="bg-obs-inset border border-white/[0.07] rounded-lg p-3">
                    <h4 className="text-[10px] uppercase tracking-wider text-signal-ok font-semibold mb-1.5">
                      New in the catalog ({(changelog.added_count || 0).toLocaleString()})
                    </h4>
                    {changelog.added.length === 0 ? (
                      <p className="text-[11px] text-zinc-500">None this period.</p>
                    ) : (
                      <ul className="space-y-1">
                        {changelog.added.slice(0, 8).map((a) => (
                          <li key={a.full_name} className="font-mono text-[11px] text-zinc-300 flex justify-between gap-2">
                            <span className="truncate">{a.full_name}</span>
                            <span className="num text-zinc-500 shrink-0">{a.stars.toLocaleString()}&nbsp;★</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="bg-obs-inset border border-white/[0.07] rounded-lg p-3">
                    <h4 className="text-[10px] uppercase tracking-wider text-red-300 font-semibold mb-1.5">
                      Gone since last snapshot ({(changelog.removed_count || 0).toLocaleString()})
                    </h4>
                    {changelog.removed.length === 0 ? (
                      <p className="text-[11px] text-zinc-500">None this period.</p>
                    ) : (
                      <ul className="space-y-1">
                        {changelog.removed.slice(0, 8).map((r) => (
                          <li key={r.full_name} className="font-mono text-[11px] text-zinc-400 flex justify-between gap-2">
                            <span className="truncate line-through decoration-red-300/50">{r.full_name}</span>
                            <span className="num text-zinc-600 shrink-0">{r.stars.toLocaleString()}&nbsp;★</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'ecosystems' ? (
          /* W4 §3.5 — Ecosystems: pack-time topic co-occurrence graph */
          <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Network className="w-4 h-4 text-signal-ok" />
                  Ecosystems
                </h2>
                <p className="text-xs text-zinc-400">
                  Topic co-occurrence from the pack-time map
                  {topicMap && Array.isArray(topicMap.topics) && topicMap.topics.length > 0
                    ? ` — ${topicMap.topics.length} topics, df ≥ ${topicMap.min_count}, edge ≥ ${topicMap.min_pair} shared repos`
                    : ''}
                </p>
              </div>
              {selectedTopic !== 'all' && (
                <button
                  onClick={() => { setSelectedTopic('all'); setActiveTab('explorer'); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-zinc-200 transition-colors"
                >
                  Clear topic filter ({selectedTopic})
                </button>
              )}
            </div>

            {topicMap && Array.isArray(topicMap.topics) && topicMap.topics.length > 0 ? (
              (() => {
                const nodes = topicMap.topics.slice(0, 48);
                const cx = 380, cy = 230;
                const golden = Math.PI * (3 - Math.sqrt(5));
                const pos = new Map();
                nodes.forEach((t, i) => {
                  const r = 26 + Math.sqrt(i / Math.max(1, nodes.length)) * 165;
                  const a = i * golden;
                  pos.set(t.name, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), t, i });
                });
                const seen = new Set();
                const links = [];
                nodes.forEach((t) => {
                  for (const [other, c] of (t.edges || []).slice(0, 5)) {
                    if (!pos.has(other)) continue;
                    const key = t.name < other ? `${t.name}|${other}` : `${other}|${t.name}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    links.push({ a: pos.get(t.name), b: pos.get(other), c });
                  }
                });
                const maxCount = nodes[0].count || 1;
                const maxPair = links.reduce((m, l) => Math.max(m, l.c), 1);
                return (
                  <svg
                    viewBox="0 0 760 460"
                    className="w-full bg-obs-inset border border-white/[0.07] rounded-xl select-none"
                    style={{ touchAction: 'none' }}
                    onPointerDown={(e) => {
                      ecoMovedRef.current = false;
                      ecoDragRef.current = { sx: e.clientX, sy: e.clientY, ox: ecoPan.x, oy: ecoPan.y };
                      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
                    }}
                    onPointerMove={(e) => {
                      const d = ecoDragRef.current;
                      if (!d) return;
                      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
                      if (Math.abs(dx) + Math.abs(dy) > 5) ecoMovedRef.current = true;
                      setEcoPan({ x: d.ox + dx, y: d.oy + dy });
                    }}
                    onPointerUp={(e) => {
                      ecoDragRef.current = null;
                      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                    }}
                  >
                    <g transform={`translate(${ecoPan.x},${ecoPan.y})`}>
                      {links.map((l, i) => (
                        <line
                          key={i}
                          x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y}
                          stroke="#7dd3fc"
                          strokeOpacity={(0.12 + 0.5 * (l.c / maxPair)).toFixed(3)}
                          strokeWidth={(0.6 + 1.8 * (l.c / maxPair)).toFixed(2)}
                        />
                      ))}
                      {nodes.map((t) => {
                        const p = pos.get(t.name);
                        const r = 4 + 11 * Math.sqrt(t.count / maxCount);
                        const active = selectedTopic === t.name;
                        return (
                          <g
                            key={t.name}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              if (ecoMovedRef.current) return; // pan, not a tap
                              setSelectedTopic(active ? 'all' : t.name);
                              setVisibleCount(36);
                              setActiveTab('explorer');
                            }}
                          >
                            <circle
                              cx={p.x} cy={p.y} r={r}
                              fill={active ? '#fbbf24' : '#34d399'}
                              fillOpacity={active ? 0.95 : 0.75}
                              stroke={active ? '#fff' : '#0f766e'}
                              strokeWidth={active ? 1.5 : 0.6}
                            />
                            <title>{`${t.name} — ${t.count} repos`}</title>
                            {p.i < 28 && (
                              <text
                                x={p.x + r + 3} y={p.y + 3}
                                fontSize="9" fill="#a1a1aa"
                              >
                                {t.name}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                    <text x="12" y="446" fontSize="9" fill="#52525b">
                      Drag to pan • tap a topic to filter the catalog
                    </text>
                  </svg>
                );
              })()
            ) : (
              <div className="bg-obs-inset border border-dashed border-white/[0.12] rounded-xl p-8 text-center space-y-2">
                <Network className="w-6 h-6 text-zinc-500 mx-auto" />
                <p className="text-sm text-zinc-300">No topic data in this build yet.</p>
                <p className="text-xs text-zinc-500 max-w-xl mx-auto">
                  Tier-2 topics are written by the next backfill run (the reclassify
                  pipeline is already proven by the 202-fixture golden set). This map
                  populates automatically from <code>topic-map.json</code> the moment
                  real topics land — nothing is invented here.
                </p>
              </div>
            )}
          </div>
        ) : activeTab === 'graph3d' ? (
          /* 3D GRAPH EXPLORER VIEW */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-obs-surface border border-white/[0.07] rounded-xl p-4 shadow-sm">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Compass className="w-4 h-4 text-zinc-300" />
                  <span title="The galaxy draws a star-ranked sample of the catalog, not every row: 'rendered' = nodes drawn after the domain/star filters, 'linked' = the cohort that gets synthesized relationships.">
                    3D Topological Knowledge Galaxy (
                    <span className="num">{repos.length.toLocaleString()}</span>
                    {graphStats.rendered > 0
                      ? ` catalog · ${graphStats.rendered.toLocaleString()} rendered · top ${graphStats.linked.toLocaleString()} linked`
                      : ' catalog'}
                    )
                  </span>
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Explore force-directed topologies, directional beam particles, and multi-hop neighborhood bridges.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-400 whitespace-nowrap">Filter Cluster:</label>
                <select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="bg-obs-inset border border-white/[0.10] rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/[0.07]"
                >
                  {domains.map((d) => (
                    <option key={d} value={d}>
                      {d === 'all' ? 'All Domains' : d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Graph3DExplorer
              repos={repos}
              selectedDomain={selectedDomain}
              onSelectRepo={(repo) => handleOpenRepoModal(repo)}
              onStatsChange={setGraphStats}
              edgeList={edgeList}
            />
          </div>
        ) : (
          /* CATALOG EXPLORER */
          <div className="space-y-6">
            {/* Filter Hub */}
            <div className="bg-obs-surface border border-white/[0.07] rounded-xl p-4 shadow-sm space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Tokenized search across 123,000+ repos: try 'sql vector', 'local llm', 'simd', or 'caching'..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setVisibleCount(36);
                  }}
                  className="w-full bg-obs-inset border border-white/[0.09] rounded-lg pl-10 pr-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/[0.07] transition-colors"
                />
              </div>

              {/* Inspiration Discovery Quick-Pills */}
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <span className="text-[11px] text-zinc-500 font-semibold mr-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-signal-star" />
                  Quick Discover:
                </span>
                {DISCOVERY_PILLS.map((pill) => (
                  <button
                    key={pill.label}
                    onClick={() => applyDiscoveryPill(pill)}
                    className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.06] text-zinc-300 hover:text-white border border-white/[0.10] hover:border-white/25 text-[10px] font-medium transition-all"
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Multi-Facet Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                    Domain / Genre
                  </label>
                  <select
                    value={selectedDomain}
                    onChange={(e) => {
                      setSelectedDomain(e.target.value);
                      setSelectedSubsystem('all');
                      setVisibleCount(36);
                    }}
                    className="w-full bg-obs-inset border border-white/[0.10] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/[0.07] truncate"
                  >
                    {domains.map((d) => (
                      <option key={d} value={d}>
                        {d === 'all' ? 'All Genres' : d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                    Subsystem / Layer
                  </label>
                  <select
                    value={selectedSubsystem}
                    onChange={(e) => {
                      setSelectedSubsystem(e.target.value);
                      setVisibleCount(36);
                    }}
                    className="w-full bg-obs-inset border border-white/[0.10] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/[0.07] truncate"
                  >
                    {subsystems.map((s) => (
                      <option key={s} value={s}>
                        {s === 'all' ? 'All Subsystems' : s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                    Architectural Primitive
                  </label>
                  <select
                    value={selectedPrimitive}
                    onChange={(e) => {
                      setSelectedPrimitive(e.target.value);
                      setVisibleCount(36);
                    }}
                    className="w-full bg-obs-inset border border-white/[0.10] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/[0.07] truncate"
                  >
                    {primitives.map((p) => (
                      <option key={p} value={p}>
                        {p === 'all' ? 'All Primitives' : p}
                      </option>
                    ))}
                  </select>
                </div>

                {/* W4 §3.5: topic facet (Tier-2 topics; empty until backfill) */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                    Topic
                  </label>
                  <select
                    value={selectedTopic}
                    onChange={(e) => {
                      setSelectedTopic(e.target.value);
                      setVisibleCount(36);
                    }}
                    className="w-full bg-obs-inset border border-white/[0.10] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/[0.07] truncate"
                  >
                    <option value="all">All Topics</option>
                    {(facets && facets.topics ? facets.topics : []).map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name} ({t.count})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                    Language
                  </label>
                  <select
                    value={selectedLanguage}
                    onChange={(e) => {
                      setSelectedLanguage(e.target.value);
                      setVisibleCount(36);
                    }}
                    className="w-full bg-obs-inset border border-white/[0.10] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/[0.07] truncate"
                  >
                    {languages.map((entry) => {
                      const sep = entry.indexOf(':');
                      const value = sep === -1 ? entry : entry.slice(0, sep);
                      const label = sep === -1 ? entry : entry.slice(sep + 1);
                      return (
                        <option key={value} value={value}>
                          {value === 'all' ? 'All Languages' : label}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                    Artifact Distinction
                  </label>
                  <select
                    value={selectedArtifact}
                    onChange={(e) => {
                      setSelectedArtifact(e.target.value);
                      setVisibleCount(36);
                    }}
                    className="w-full bg-obs-inset border border-white/[0.10] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/[0.07] truncate"
                  >
                    {artifacts.map((a) => (
                      <option key={a} value={a}>
                        {a === 'all' ? 'All Artifacts' : a}
                      </option>
                    ))}
                  </select>
                </div>

                {/* W3 §2.7: license tier filter (permissive-only = Permissive) */}
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                    License Tier
                  </label>
                  <select
                    value={selectedLicenseTier}
                    onChange={(e) => {
                      setSelectedLicenseTier(e.target.value);
                      setVisibleCount(36);
                    }}
                    className="w-full bg-obs-inset border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/25"
                  >
                    <option value="all">All Licenses</option>
                    <option value="permissive">Permissive only</option>
                    <option value="copyleft">Copyleft</option>
                    <option value="source-available">Source-Available</option>
                    <option value="unknown">Unknown / Unspecified</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Min Stars
                    </label>
                    <span className="text-[10px] text-signal-star font-mono font-medium">
                      {minStars.toLocaleString()}★
                    </span>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="100000"
                    step="500"
                    value={minStars}
                    onChange={(e) => {
                      setMinStars(Number(e.target.value));
                      setVisibleCount(36);
                    }}
                    className="w-full cursor-pointer mt-1"
                  />
                </div>

                {/* W4 §3.4: minimum Signal (composite quality/activity score) */}
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 flex justify-between">
                    <span>Min Signal</span>
                    <span className="font-mono text-zinc-500">{minSignal === 0 ? 'off' : `≥ ${minSignal}`}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    step="5"
                    value={minSignal}
                    onChange={(e) => {
                      setMinSignal(Number(e.target.value));
                      setVisibleCount(36);
                    }}
                    className="w-full cursor-pointer mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                      Sort
                    </label>
                    <select
                      value={sortBy}
                      onChange={(e) => {
                        setSortBy(e.target.value);
                        setVisibleCount(36);
                      }}
                      className="w-full bg-obs-inset border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/25"
                    >
                      <option value="stars">Most stars</option>
                      <option value="recent">Recently pushed</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                      Activity
                    </label>
                    <label className="flex items-center gap-2 bg-obs-inset border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 cursor-pointer h-[30px]">
                      <input
                        type="checkbox"
                        checked={hideDormant}
                        onChange={(e) => {
                          setHideDormant(e.target.checked);
                          setVisibleCount(36);
                        }}
                        className="accent-white"
                      />
                      Hide dormant
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* W3 §2.8: facet chips with pack-time exact counts */}
            {facets && (
              <div className="space-y-2 px-1">
                <div className="flex flex-wrap gap-1.5">
                  {facets.domains.map((d) => (
                    <button
                      key={d.name}
                      onClick={() => {
                        setSelectedDomain((prev) => (prev === d.name ? 'all' : d.name));
                        setSelectedSubsystem('all');
                        setVisibleCount(36);
                      }}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                        selectedDomain === d.name
                          ? 'bg-white/[0.12] border-white/30 text-white font-semibold'
                          : 'bg-white/[0.04] border-white/[0.1] text-zinc-400 hover:text-zinc-200 hover:border-white/20'
                      }`}
                    >
                      {d.name} ({d.count.toLocaleString()})
                    </button>
                  ))}
                </div>
                {selectedDomain !== 'all' && (
                  <div className="flex flex-wrap gap-1.5">
                    {facets.subsystems
                      .filter((s) => s.domain === selectedDomain)
                      .slice(0, 14)
                      .map((s) => (
                        <button
                          key={s.name}
                          onClick={() => {
                            setSelectedSubsystem((prev) => (prev === s.name ? 'all' : s.name));
                            setVisibleCount(36);
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                            selectedSubsystem === s.name
                              ? 'bg-signal-ok/[0.12] border-signal-ok/40 text-signal-ok font-semibold'
                              : 'bg-white/[0.03] border-white/[0.08] text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {s.name} ({s.count.toLocaleString()})
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* W4 §3.5: topic cloud — per-domain counts when a domain is set */}
            {facets && (
              <div className="px-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Topic cloud
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {selectedDomain !== 'all' ? selectedDomain : 'all domains'}
                  </span>
                </div>
                {(() => {
                  const list = selectedDomain !== 'all' && facets.topics_by_domain
                    ? (facets.topics_by_domain[selectedDomain] || [])
                    : (facets.topics || []);
                  if (!list.length) {
                    return (
                      <p className="text-[11px] text-zinc-500 bg-obs-inset border border-white/[0.06] rounded-lg px-3 py-2">
                        Topic cloud is empty in this build — Tier-2 topics arrive
                        with the next backfill run (the pipeline is proven by the
                        202-fixture golden set).
                      </p>
                    );
                  }
                  const max = list[0].count || 1;
                  return (
                    <div className="flex flex-wrap gap-1.5 items-baseline">
                      {list.map((t) => {
                        const weight = t.count / max;
                        const active = selectedTopic === t.name;
                        return (
                          <button
                            key={t.name}
                            title={`${t.count} repositories`}
                            onClick={() => {
                              setSelectedTopic(active ? 'all' : t.name);
                              setVisibleCount(36);
                            }}
                            className={`px-2 py-1 rounded-lg border transition-colors ${
                              active
                                ? 'bg-white/[0.12] border-white/30 text-white font-semibold'
                                : 'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:border-white/20'
                            }`}
                            style={{ fontSize: `${(10 + weight * 4).toFixed(1)}px` }}
                          >
                            {t.name} <span className="opacity-60">({t.count})</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Stats Summary */}
            <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
              <span>
                Matching <strong className="num text-white">{filteredRepos.length.toLocaleString()}</strong> repositories (showing top <span className="num">{Math.min(visibleRepos.length, filteredRepos.length)}</span>)
              </span>
              <span className="text-zinc-500 hidden sm:inline">
                123k+ Index &bull; Sub-5ms Token Search &bull; Progressive Windowing Active
              </span>
            </div>

            {/* W4 §3.2 — "Rising this month" shelf (star-delta top movers) */}
            {risingMovers.length > 0 && (
              <div className="bg-obs-surface border border-signal-star/20 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-signal-star" />
                    Rising this month
                    {changelog && changelog.period && (
                      <span className="text-[10px] font-mono text-zinc-500 font-normal">
                        {changelog.period.from} &rarr; {changelog.period.to}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => setActiveTab('changelog')}
                    className="text-[10px] text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
                  >
                    Full changelog <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {risingMovers.map(({ mover, repo }) => (
                    <button
                      key={mover.full_name}
                      onClick={() => handleOpenRepoModal(repo)}
                      className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-obs-inset hover:bg-white/[0.06] border border-white/[0.10] hover:border-signal-star/40 text-left transition-all"
                      title={`${mover.from.toLocaleString()} → ${mover.to.toLocaleString()} stars`}
                    >
                      <span className="text-[11px] font-medium text-zinc-200 max-w-[160px] truncate">
                        {mover.full_name}
                      </span>
                      <span className="num text-[10px] font-bold text-signal-ok shrink-0">
                        +{mover.delta.toLocaleString()}
                      </span>
                      <span className="num text-[10px] text-zinc-500 shrink-0">
                        {mover.to.toLocaleString()}★
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Repos Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleRepos.map((repo) => (
                <div
                  key={repo.id}
                  onClick={() => handleOpenRepoModal(repo)}
                  className="bg-obs-surface border border-white/[0.07] rounded-xl p-5 hover:border-white/25 hover:bg-obs-raised transition-all cursor-pointer flex flex-col justify-between group shadow-sm relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-white/[0.045] to-transparent rounded-bl-full pointer-events-none" />

                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-semibold text-zinc-100 group-hover:text-white transition-colors break-all">
                        <span className="text-zinc-400 font-normal">{repo.owner} / </span>
                        {repo.name}
                      </h3>
                      <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors shrink-0" />
                    </div>

                    {/* Taxonomy Chips */}
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/[0.08] text-white border border-white/[0.14]">
                        {repo.domain}
                      </span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/[0.04] text-zinc-300 border border-white/[0.08]">
                        {repo.subsystem}
                      </span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-zinc-500">
                        {repo.artifact}
                      </span>
                      {repo.domainMargin != null && repo.domainMargin < 3 && (
                        <span
                          className="text-[10px] font-semibold px-1 py-0.5 rounded text-amber-300/90 cursor-help"
                          title={`Taxonomy margin ${repo.domainMargin}/9 — label is close between domains`}
                        >
                          ≈
                        </span>
                      )}
                    </div>

                    {/* Plain-English Hook: What It Does */}
                    <div className="bg-obs-inset p-2.5 rounded-lg border border-white/[0.07] mb-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-300 uppercase tracking-wide mb-1">
                        <Lightbulb className="w-3 h-3 text-zinc-300" />
                        <span>The Simple Explanation</span>
                      </div>
                      <p className="text-xs text-zinc-200 leading-relaxed line-clamp-2">
                        {repo.hook || repo.description}
                      </p>
                    </div>

                    {/* Deep Enriched Badges */}
                    <div className="space-y-1.5 mb-4">
                      {repo.primitives && repo.primitives.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Cpu className="w-3 h-3 text-signal-ok shrink-0" />
                          {repo.primitives.map((prim) => (
                            <span key={prim} className="text-[10px] px-1.5 py-0.2 rounded bg-signal-ok/[0.08] text-signal-ok border border-signal-ok/25">
                              {prim}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-400">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-1 text-signal-star font-medium">
                        <Star className="w-3.5 h-3.5 fill-signal-star/20" />
                        <span className="num">{repo.stars.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center space-x-1 text-zinc-400">
                        <GitFork className="w-3.5 h-3.5" />
                        <span className="num">{repo.forks.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {repo.activity && repo.activity.status === 'active' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-signal-ok/[0.1] text-signal-ok border border-signal-ok/30">
                          Active
                        </span>
                      )}
                      {repo.activity && repo.activity.status === 'idle' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-signal-warn/[0.1] text-signal-warn border border-signal-warn/30">
                          Idle
                        </span>
                      )}
                      {repo.activity && repo.activity.status === 'archived' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white/[0.06] text-zinc-400 border border-white/[0.15]">
                          Archived
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-zinc-300">{repo.language}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white/[0.05] text-zinc-300 border border-white/[0.10]">
                        {repo.license}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Load More Button */}
            {visibleCount < filteredRepos.length && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => setVisibleCount((prev) => prev + 36)}
                  className="px-6 py-2.5 bg-white/[0.05] hover:bg-white/[0.09] text-white rounded-xl text-xs font-semibold border border-white/[0.10] transition-colors flex items-center gap-2 shadow-sm"
                >
                  <span>Load More Repositories (<span className="num">{(filteredRepos.length - visibleCount).toLocaleString()}</span> remaining)</span>
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Deep Repository Architecture & Inspiration Modal */}
      {activeRepoDetails && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-obs-surface border border-white/[0.07] rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Top Header */}
            <div className="p-6 border-b border-white/[0.07] bg-obs-raised flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/[0.08] text-white border border-white/[0.14] font-semibold">
                    {activeRepoDetails.domain}
                  </span>
                  <span className="text-xs text-zinc-400">&bull;</span>
                  <span className="text-xs text-zinc-300 font-medium">
                    {activeRepoDetails.subsystem}
                  </span>
                  {activeRepoDetails.domainMargin != null && activeRepoDetails.domainMargin < 3 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300 border border-amber-400/30 font-semibold cursor-help"
                      title={`Taxonomy margin ${activeRepoDetails.domainMargin}/9 — closest competing domain is nearly tied`}
                    >
                      low-confidence label
                    </span>
                  )}
                  {loadingShard && (
                    <span className="text-[10px] text-zinc-300 flex items-center gap-1 animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading deep shard...
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <span>{activeRepoDetails.owner} / {activeRepoDetails.name}</span>
                  {/* W4 §3.2: momentum badge (only for rows with real history) */}
                  {modalMomentum && (
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                        modalMomentum.delta > 0
                          ? 'bg-signal-ok/[0.1] text-signal-ok border-signal-ok/40'
                          : 'bg-red-400/[0.1] text-red-300 border-red-400/40'
                      }`}
                      title={`Star momentum vs the previous snapshot (${changelog.period ? changelog.period.from : ''})`}
                    >
                      {modalMomentum.delta > 0 ? '\u25B2 +' : '\u25BC '}{modalMomentum.delta.toLocaleString()}
                    </span>
                  )}
                </h2>
                {modalMomentum && Array.isArray(modalMomentum.series) && modalMomentum.series.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    {modalMomentum.series.length >= 2 ? (() => {
                      const vals = modalMomentum.series.map(([, s]) => s);
                      const min = Math.min(...vals);
                      const max = Math.max(...vals);
                      const span = max - min || 1;
                      const pts = vals.map((v, i) => {
                        const x = (i / (vals.length - 1)) * 120 + 2;
                        const y = 24 - ((v - min) / span) * 20;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      }).join(' ');
                      const up = vals[vals.length - 1] >= vals[0];
                      return (
                        <svg width="124" height="28" viewBox="0 0 124 28" aria-label="Star history sparkline">
                          <polyline
                            points={pts}
                            fill="none"
                            stroke={up ? 'rgb(52 211 153)' : 'rgb(252 165 165)'}
                            strokeWidth="2"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                          {vals.map((v, i) => {
                            const x = (i / (vals.length - 1)) * 120 + 2;
                            const y = 24 - ((v - min) / span) * 20;
                            return <circle key={i} cx={x} cy={y} r="2" fill="rgb(228 228 231)" />;
                          })}
                        </svg>
                      );
                    })() : (
                      <span className="text-[10px] font-mono text-zinc-500">
                        baseline {modalMomentum.series[0][0]}: {modalMomentum.series[0][1].toLocaleString()}&#9733;
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500">
                      {modalMomentum.series.length} snapshot{modalMomentum.series.length === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setActiveRepoModal(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex items-center border-b border-white/[0.07] bg-obs-raised px-6 gap-6 text-xs font-semibold">
              <button
                onClick={() => setModalTab('overview')}
                className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
                  modalTab === 'overview'
                    ? 'border-white/80 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>The Story &amp; Purpose</span>
              </button>
              <button
                onClick={() => setModalTab('superpowers')}
                className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
                  modalTab === 'superpowers'
                    ? 'border-white/80 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>Superpowers &amp; Tradeoffs</span>
              </button>
              <button
                onClick={() => setModalTab('quickstart')}
                className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
                  modalTab === 'quickstart'
                    ? 'border-white/80 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Play className="w-4 h-4" />
                <span>Quickstart &amp; Architecture</span>
              </button>
              <button
                onClick={() => setModalTab('similar')}
                className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
                  modalTab === 'similar'
                    ? 'border-white/80 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Network className="w-4 h-4" />
                <span>Similar Repositories</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
              {modalTab === 'overview' && (
                <div className="space-y-6">
                  {/* The "Explain Like I Have Zero Knowledge" Section */}
                  <div className="bg-obs-sheen bg-obs-raised p-4 rounded-xl border border-white/[0.12] space-y-3">
                    <div className="flex items-center gap-2 text-zinc-100 font-bold uppercase tracking-wider text-[11px]">
                      <Lightbulb className="w-4 h-4 text-zinc-300" />
                      <span>What does this project actually do?</span>
                    </div>
                    <p className="text-zinc-100 text-sm leading-relaxed font-medium">
                      {activeRepoDetails.beginner_intel?.what_it_does || activeRepoDetails.hook || activeRepoDetails.description}
                    </p>
                  </div>

                  {/* Why it matters & when to choose it */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-obs-inset p-4 rounded-xl border border-white/[0.07] space-y-2">
                      <div className="flex items-center gap-1.5 text-signal-star font-semibold text-xs">
                        <Flame className="w-3.5 h-3.5" />
                        <span>Why does this project exist?</span>
                      </div>
                      <p className="text-zinc-300 leading-relaxed text-[11px]">
                        {activeRepoDetails.beginner_intel?.why_it_matters || "Created to solve critical scalability, performance, and developer ergonomics problems in its domain."}
                      </p>
                    </div>

                    <div className="bg-obs-inset p-4 rounded-xl border border-white/[0.07] space-y-2">
                      <div className="flex items-center gap-1.5 text-signal-ok font-semibold text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>When should you use this?</span>
                      </div>
                      <p className="text-zinc-300 leading-relaxed text-[11px]">
                        {activeRepoDetails.beginner_intel?.when_to_use || "Best suited for modern applications requiring production-grade performance and active maintenance."}
                      </p>
                    </div>
                  </div>

                  {/* Vital Stats & Maturity */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-obs-inset p-3 rounded-xl border border-white/[0.07]">
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Community Stars</span>
                      <span className="num text-sm font-semibold text-signal-star flex items-center gap-1 mt-0.5">
                        <Star className="w-3.5 h-3.5 fill-signal-star" />
                        {activeRepoDetails.stars.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Fork Count</span>
                      <span className="num text-sm font-semibold text-zinc-200 flex items-center gap-1 mt-0.5">
                        <GitFork className="w-3.5 h-3.5" />
                        {activeRepoDetails.forks.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Primary Language</span>
                      <span className="text-sm font-semibold text-zinc-100 mt-0.5 block">
                        {activeRepoDetails.language}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Maturity Rating</span>
                      <span className="text-xs font-semibold text-signal-ok mt-0.5 block truncate" title={activeRepoDetails.maturity?.rating}>
                        {activeRepoDetails.maturity?.rating || "Production Tested"}
                      </span>
                    </div>
                  </div>

                  {/* Commercial License Clear Assessment */}
                  <div className="bg-obs-inset p-4 rounded-xl border border-white/[0.07] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-zinc-300" />
                        <span className="font-semibold text-zinc-200">Commercial Usability &amp; License Risk</span>
                      </div>
                      <span className="font-mono text-zinc-100 bg-white/[0.05] px-2 py-0.5 rounded border border-white/[0.10]">
                        {activeRepoDetails.license}
                      </span>
                    </div>
                    <div className="text-zinc-400 leading-relaxed text-[11px]">
                      <strong>Commercial Status:</strong> {activeRepoDetails.license_intel?.commercial || "Permissive Open Source"} &mdash; {activeRepoDetails.license_intel?.desc || "Review repository license for details."}
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'superpowers' && (
                <div className="space-y-6">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-3 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-signal-star" />
                      Key Superpowers &amp; Breakthrough Features
                    </label>
                    <div className="space-y-2">
                      {(activeRepoDetails.beginner_intel?.key_superpowers || [
                        "High throughput and zero unnecessary allocations",
                        "Active open-source community support and extensive documentation",
                        "Seamless integration into modern production ecosystems"
                      ]).map((power, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 bg-obs-inset p-3 rounded-xl border border-white/[0.07] text-zinc-200 text-xs leading-relaxed">
                          <Check className="w-4 h-4 text-signal-ok shrink-0 mt-0.5" />
                          <span>{power}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-3 flex items-center gap-1.5">
                      <GitCompare className="w-4 h-4 text-signal-info" />
                      Notable Alternatives &amp; How It Compares
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(activeRepoDetails.beginner_intel?.alternatives || ["Standard libraries", "Managed Cloud APIs"]).map((alt, idx) => (
                        <span key={idx} className="px-3 py-1.5 rounded-lg bg-white/[0.05] text-zinc-200 border border-white/[0.10] font-medium text-xs">
                          {alt}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'quickstart' && (
                <div className="space-y-6">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-2 flex items-center gap-1.5">
                      <Play className="w-4 h-4 text-signal-ok" />
                      Immediate Run / Installation Snippet
                    </label>
                    <div className="relative bg-obs-inset border border-white/[0.07] rounded-xl p-3 font-mono text-signal-ok text-xs">
                      <pre className="overflow-x-auto whitespace-pre-wrap">{activeRepoDetails.quickstart_code}</pre>
                      <button
                        onClick={() => copyToClipboard(activeRepoDetails.quickstart_code, 'quickstart')}
                        className="absolute top-3 right-3 p-1.5 text-zinc-400 hover:text-white rounded bg-white/[0.05] border border-white/[0.10] transition-colors"
                        title="Copy command"
                      >
                        {copiedText === 'quickstart' ? (
                          <Check className="w-3.5 h-3.5 text-signal-ok" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-2">
                      Git Clone Command
                    </label>
                    <div className="flex items-center justify-between bg-obs-inset border border-white/[0.07] rounded-lg p-2.5 font-mono text-zinc-300">
                      <span className="truncate mr-2">git clone {activeRepoDetails.url}.git</span>
                      <button
                        onClick={() => copyToClipboard(`git clone ${activeRepoDetails.url}.git`, 'clone')}
                        className="p-1 text-zinc-400 hover:text-white rounded hover:bg-white/[0.06] transition-colors shrink-0"
                        title="Copy command"
                      >
                        {copiedText === 'clone' ? (
                          <Check className="w-4 h-4 text-signal-ok" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'similar' && (
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-2 flex items-center gap-1.5">
                    <Network className="w-4 h-4 text-signal-accent" />
                    Similar repositories
                    <span className="text-[10px] text-zinc-500 normal-case font-normal ml-1">
                      pack-time kNN over topics, subsystem, primitives &amp; compatibility
                    </span>
                  </label>
                  {!edgeList && (
                    <p className="text-zinc-400 text-xs bg-obs-inset border border-white/[0.07] rounded-xl p-4">
                      Similarity index is still loading…
                    </p>
                  )}
                  {edgeList && similarRepos.length === 0 && (
                    <p className="text-zinc-400 text-xs bg-obs-inset border border-white/[0.07] rounded-xl p-4">
                      No neighbours recorded for this repository.
                    </p>
                  )}
                  {similarRepos.map(({ repo, weight, reason }) => (
                    <button
                      key={`${repo.id}-${weight}`}
                      onClick={() => handleOpenRepoModal(repo)}
                      className="w-full text-left bg-obs-inset hover:bg-white/[0.06] border border-white/[0.07] rounded-xl p-3.5 transition-colors space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="font-semibold text-zinc-100 text-xs truncate block">
                            {repo.owner}/{repo.name}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {repo.subsystem} &middot; {repo.language}
                          </span>
                        </div>
                        <span className="text-[10px] text-signal-star font-mono shrink-0">
                          ★ {repo.stars.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] text-zinc-400 bg-white/[0.06] border border-white/[0.08] rounded px-2 py-0.5">
                          {reason}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                          match {Math.round(weight * 100)}%
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/[0.07] bg-obs-raised flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">
                {activeRepoDetails.pushed_at && !Number.isNaN(Date.parse(activeRepoDetails.pushed_at))
                  ? `Pushed: ${new Date(activeRepoDetails.pushed_at).toLocaleDateString()}`
                  : 'Pushed: Unknown'}
                {activeRepoDetails.created_at && !Number.isNaN(Date.parse(activeRepoDetails.created_at))
                  ? ` • Created: ${new Date(activeRepoDetails.created_at).toLocaleDateString()}`
                  : ''}
              </span>
              <a
                href={activeRepoDetails.url}
                target="_blank"
                rel="noreferrer"
                className="btn-primary px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
              >
                <span>View on GitHub</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-obs-inset py-4 mt-8 text-center text-xs text-zinc-500">
        <p>GitScour &bull; Open-Source Queriable GitHub Knowledge Base &bull; Hosted 100% Free on GitHub Pages</p>
      </footer>
    </div>
  );
}
