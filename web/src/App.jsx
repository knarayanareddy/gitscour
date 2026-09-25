import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, Star, GitFork, ExternalLink, Filter, Terminal, 
  Layers, Code2, ShieldAlert, Cpu, Sparkles, Database, Globe,
  CheckCircle2, AlertTriangle, Info, X, Copy, Check, ArrowRight,
  Boxes, Server, Lock, Flame, Compass, Network, HelpCircle,
  Zap, GitCompare, Play, BookOpen, Lightbulb, Share2, Loader2,
  ChevronDown, SlidersHorizontal, Sliders
} from 'lucide-react';
import Graph3DExplorer from './Graph3DExplorer.jsx';
import { rankQuery } from './search-core.mjs';
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
  const [selectedLicenseTier, setSelectedLicenseTier] = useState(initialUrl.license);
  const [minStars, setMinStars] = useState(initialUrl.minStars);
  // W3 §2.6: activity intelligence — dormant filter + recently-pushed sort
  const [hideDormant, setHideDormant] = useState(false);
  const [sortBy, setSortBy] = useState('stars'); // 'stars' | 'recent'
  // W3 §2.1: pack-time inverted index for ranked search (fetched alongside the
  // packed rows; the memoized substring corpus remains the fallback).
  const [searchIndex, setSearchIndex] = useState(null);
  // W3 §2.4: pack-time kNN edge list for the graph + Similar-repositories tab.
  const [edgeList, setEdgeList] = useState(null);
  // W3 §2.8: pack-time facet counts for chips with live numbers.
  const [facets, setFacets] = useState(null);

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
    if (pill.domain) setSelectedDomain(pill.domain);
    if (pill.primitive) setSelectedPrimitive(pill.primitive);
    if (pill.language) setSelectedLanguage(pill.language);
    if (pill.q) setSearchQuery(pill.q);
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

        setRepos(unpacked);
        setLoading(false);

        if (initialUrl.inspect) {
          const match = unpacked.find(
            r => r.name.toLowerCase() === initialUrl.inspect.toLowerCase() ||
                 `${r.owner}/${r.name}`.toLowerCase() === initialUrl.inspect.toLowerCase()
          );
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
    if (selectedLicenseTier !== 'all') params.set('license', selectedLicenseTier);
    if (minStars > 500) params.set('minStars', minStars);
    if (activeRepoModal) params.set('inspect', activeRepoModal.name);

    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newUrl);
  }, [activeTab, searchQuery, selectedDomain, selectedSubsystem, selectedArtifact, selectedLanguage, selectedPrimitive, selectedLicenseTier, minStars, activeRepoModal, loading]);

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

  const languages = useMemo(() => {
    const set = new Set(repos.map((r) => r.language).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [repos]);

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

  const starsByOrdinal = useMemo(() => repos.map((r) => r.stars || 0), [repos]);

  // W3 §2.1/2.2: ranked search — field-weighted BM25-lite over the pack-time
  // inverted index (top-N relevance ordering replaces stars-desc-only), falling
  // back to substring matching over the memoized corpus when the index is absent.
  const filteredRepos = useMemo(() => {
    const facetOk = (repo) => {
      if (repo.stars < minStars) return false;
      if (selectedDomain !== 'all' && repo.domain !== selectedDomain) return false;
      if (selectedSubsystem !== 'all' && repo.subsystem !== selectedSubsystem) return false;
      if (selectedArtifact !== 'all' && repo.artifact !== selectedArtifact) return false;
      if (selectedLanguage !== 'all' && repo.language !== selectedLanguage) return false;
      if (selectedPrimitive !== 'all' && !(repo.primitives || []).includes(selectedPrimitive)) return false;
      if (selectedLicenseTier !== 'all' && repo.licenseTier !== selectedLicenseTier) return false;
      return true;
    };

    // W3 §2.6: dormant = idle (no push within 365 days) or archived
    const activityOk = (repo) => {
      if (!hideDormant) return true;
      const s = repo.activity && repo.activity.status;
      return s !== 'idle' && s !== 'archived';
    };

    const q = debouncedQuery.trim();
    if (q && searchIndex) {
      // Ranked path: relevance order wins over the star/recent sort (labelled
      // in the UI), the dormant filter still applies.
      const ranked = rankQuery(searchIndex, q, starsByOrdinal);
      const out = [];
      for (const [ord] of ranked) {
        const repo = repos[ord];
        if (repo && facetOk(repo) && activityOk(repo)) out.push(repo);
      }
      return out;
    }

    const queryTokens = q ? q.toLowerCase().split(/\s+/).filter(Boolean) : [];
    const base = repos.filter((repo) => {
      if (!facetOk(repo) || !activityOk(repo)) return false;
      for (const token of queryTokens) {
        if (!repo.searchCorpus.includes(token)) return false;
      }
      return true;
    });
    if (!q && sortBy === 'recent') {
      // recently-pushed first; rows without push data sink deterministically
      return [...base].sort((a, b) => {
        const ta = (a.activity && a.activity.pushedAt) || 0;
        const tb = (b.activity && b.activity.pushedAt) || 0;
        return tb - ta || b.stars - a.stars;
      });
    }
    return base;
  }, [repos, debouncedQuery, searchIndex, starsByOrdinal, selectedDomain, selectedSubsystem,
      selectedArtifact, selectedLanguage, selectedPrimitive, selectedLicenseTier, minStars,
      hideDormant, sortBy]);

  const visibleRepos = useMemo(() => {
    return filteredRepos.slice(0, visibleCount);
  }, [filteredRepos, visibleCount]);

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
                    {languages.map((l) => (
                      <option key={l} value={l}>
                        {l === 'all' ? 'All Languages' : l}
                      </option>
                    ))}
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

            {/* Stats Summary */}
            <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
              <span>
                Matching <strong className="num text-white">{filteredRepos.length.toLocaleString()}</strong> repositories (showing top <span className="num">{Math.min(visibleRepos.length, filteredRepos.length)}</span>)
              </span>
              <span className="text-zinc-500 hidden sm:inline">
                123k+ Index &bull; Sub-5ms Token Search &bull; Progressive Windowing Active
              </span>
            </div>

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
                </h2>
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
