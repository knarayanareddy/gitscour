import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, Star, GitFork, ExternalLink, Filter, Terminal, 
  Layers, Code2, ShieldAlert, Cpu, Sparkles, Database, Globe,
  CheckCircle2, AlertTriangle, Info, X, Copy, Check, ArrowRight,
  Boxes, Server, Lock, Flame, Compass, Network, HelpCircle,
  Zap, GitCompare, Play, BookOpen, Lightbulb, Share2
} from 'lucide-react';
import Graph3DExplorer from './Graph3DExplorer.jsx';
import InspirationGenerator from './InspirationGenerator.jsx';

export default function App() {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Read URL query params helper
  const getInitialUrlState = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      tab: params.get('tab') || 'explorer', // 'explorer' | 'graph3d' | 'inspire' | 'sql'
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

  // Inspector Modal / Drawer
  const [activeRepoModal, setActiveRepoModal] = useState(null);
  const [modalTab, setModalTab] = useState('overview'); // 'overview' | 'superpowers' | 'quickstart'
  const [copiedText, setCopiedText] = useState(null);
  const [urlShareCopied, setUrlShareCopied] = useState(false);

  // SQL Console state
  const [sqlQuery, setSqlQuery] = useState(
    "SELECT name, stars, language, domain, subsystem, primitives\nFROM repos\nWHERE domain = 'Databases & Storage' AND stars >= 20000\nORDER BY stars DESC;"
  );
  const [sqlResults, setSqlResults] = useState(null);
  const [sqlError, setSqlError] = useState(null);

  // Load dataset
  useEffect(() => {
    fetch('./repos.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load repository index');
        return res.json();
      })
      .then((data) => {
        setRepos(data);
        setLoading(false);

        // Check if URL requested a specific repo to inspect on load
        if (initialUrl.inspect) {
          const match = data.find(
            r => r.name.toLowerCase() === initialUrl.inspect.toLowerCase() ||
                 r.full_name?.toLowerCase() === initialUrl.inspect.toLowerCase()
          );
          if (match) {
            setActiveRepoModal(match);
          }
        }
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

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

  // Compute unique filter options
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

  const licenseTiers = useMemo(() => {
    const set = new Set(repos.map((r) => r.license_intel?.tier).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [repos]);

  // Client-side filtering logic
  const filteredRepos = useMemo(() => {
    return repos.filter((repo) => {
      if (repo.stars < minStars) return false;
      if (selectedDomain !== 'all' && repo.domain !== selectedDomain) return false;
      if (selectedSubsystem !== 'all' && repo.subsystem !== selectedSubsystem) return false;
      if (selectedArtifact !== 'all' && repo.artifact !== selectedArtifact) return false;
      if (selectedLanguage !== 'all' && repo.language !== selectedLanguage) return false;
      if (selectedPrimitive !== 'all' && !(repo.primitives || []).includes(selectedPrimitive)) return false;
      if (selectedLicenseTier !== 'all' && repo.license_intel?.tier !== selectedLicenseTier) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const textToSearch = `${repo.name} ${repo.owner} ${repo.description} ${(repo.keywords || []).join(' ')} ${(repo.topics || []).join(' ')} ${repo.beginner_intel?.what_it_does || ''}`.toLowerCase();
        if (!textToSearch.includes(q)) return false;
      }

      return true;
    });
  }, [repos, searchQuery, selectedDomain, selectedSubsystem, selectedArtifact, selectedLanguage, selectedPrimitive, selectedLicenseTier, minStars]);

  // In-browser SQL simulation engine
  const executeSQL = () => {
    setSqlError(null);
    try {
      const q = sqlQuery.trim();
      const match = q.match(/SELECT\s+(.*?)\s+FROM\s+repos(?:\s+WHERE\s+(.*?))?(?:\s+ORDER\s+BY\s+(.*?))?(?:\s+LIMIT\s+(\d+))?;?$/is);
      
      if (!match) {
        throw new Error("Syntax Error: GitScour In-Browser SQL engine supports:\nSELECT <fields|*> FROM repos [WHERE <condition>] [ORDER BY <field> [ASC|DESC]] [LIMIT <n>]");
      }

      const [, rawFields, rawWhere, rawOrderBy, rawLimit] = match;
      const fields = rawFields.split(',').map((f) => f.trim());

      let rows = [...repos];
      if (rawWhere) {
        rows = rows.filter((r) => {
          try {
            const sanitized = rawWhere
              .replace(/(\b[a-zA-Z_][a-zA-Z0-9_]*\b)/g, (m) => {
                if (['AND', 'OR', 'NOT', 'and', 'or', 'not', 'true', 'false', 'null'].includes(m)) return m;
                return `r['${m}']`;
              })
              .replace(/=/g, '===')
              .replace(/====/g, '===');
            // eslint-disable-next-line no-new-func
            return Function('r', `"use strict"; return Boolean(${sanitized})`)(r);
          } catch {
            return true;
          }
        });
      }

      if (rawOrderBy) {
        const parts = rawOrderBy.trim().split(/\s+/);
        const col = parts[0];
        const isDesc = parts[1] && parts[1].toUpperCase() === 'DESC';
        rows.sort((a, b) => {
          const valA = a[col];
          const valB = b[col];
          if (valA === valB) return 0;
          if (valA === undefined) return 1;
          if (valB === undefined) return -1;
          if (typeof valA === 'number') {
            return isDesc ? valB - valA : valA - valB;
          }
          return isDesc ? String(valB).localeCompare(String(valA)) : String(valA).localeCompare(String(valB));
        });
      }

      if (rawLimit) {
        rows = rows.slice(0, parseInt(rawLimit, 10));
      }

      const projected = rows.map((r) => {
        if (rawFields.trim() === '*') return r;
        const out = {};
        for (const f of fields) {
          out[f] = r[f];
        }
        return out;
      });

      setSqlResults(projected);
    } catch (err) {
      setSqlError(err.message);
      setSqlResults(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-[#161b22]/90 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white p-2 rounded-xl shadow-md shadow-indigo-500/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                  GitScour
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                  {repos.length > 0 ? `${repos.length} Repos` : '>500★ DB'}
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Deep Architectural Taxonomy & 3D Knowledge Galaxy of GitHub</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('explorer')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'explorer'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Catalog</span>
            </button>
            <button
              onClick={() => setActiveTab('inspire')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'inspire'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Inspire Me</span>
            </button>
            <button
              onClick={() => setActiveTab('graph3d')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'graph3d'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>3D Galaxy</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('sql');
                if (!sqlResults) executeSQL();
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'sql'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>SQL Studio</span>
            </button>

            {/* Share Link Button */}
            <button
              onClick={copyShareableLink}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-300 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium border border-slate-700/80 transition-colors ml-1"
              title="Share Current URL Query & View"
            >
              {urlShareCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
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
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
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
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-xs font-mono">Indexing repository taxonomy & beginner context...</p>
          </div>
        ) : activeTab === 'inspire' ? (
          /* INSPIRE ME ARCHITECTURE GENERATOR */
          <div className="space-y-6">
            <InspirationGenerator
              repos={repos}
              onSelectRepo={(repo) => {
                setActiveRepoModal(repo);
                setModalTab('overview');
              }}
            />
          </div>
        ) : activeTab === 'graph3d' ? (
          /* 3D GRAPH EXPLORER VIEW */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#161b22] border border-slate-800 rounded-xl p-4 shadow-sm">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Compass className="w-4 h-4 text-indigo-400" />
                  3D Topological Knowledge Graph
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Orbit, zoom, and inspect architectural relationships (subsystems, shared primitives, and protocols). Click any node to read why it was built.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 whitespace-nowrap">Cluster Domain:</label>
                <select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="bg-[#0d1117] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
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
              onSelectRepo={(repo) => {
                setActiveRepoModal(repo);
                setModalTab('overview');
              }}
            />
          </div>
        ) : activeTab === 'explorer' ? (
          <div className="space-y-6">
            {/* Filter Hub */}
            <div className="bg-[#161b22] border border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search repository, plain-English purpose (e.g. 'local AI', 'in-memory cache'), or primitives..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0d1117] border border-slate-700/80 rounded-lg pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Multi-Facet Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Domain / Genre
                  </label>
                  <select
                    value={selectedDomain}
                    onChange={(e) => {
                      setSelectedDomain(e.target.value);
                      setSelectedSubsystem('all');
                    }}
                    className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 truncate"
                  >
                    {domains.map((d) => (
                      <option key={d} value={d}>
                        {d === 'all' ? 'All Genres' : d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Subsystem / Layer
                  </label>
                  <select
                    value={selectedSubsystem}
                    onChange={(e) => setSelectedSubsystem(e.target.value)}
                    className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 truncate"
                  >
                    {subsystems.map((s) => (
                      <option key={s} value={s}>
                        {s === 'all' ? 'All Subsystems' : s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Architectural Primitive
                  </label>
                  <select
                    value={selectedPrimitive}
                    onChange={(e) => setSelectedPrimitive(e.target.value)}
                    className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 truncate"
                  >
                    {primitives.map((p) => (
                      <option key={p} value={p}>
                        {p === 'all' ? 'All Primitives' : p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Artifact Distinction
                  </label>
                  <select
                    value={selectedArtifact}
                    onChange={(e) => setSelectedArtifact(e.target.value)}
                    className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 truncate"
                  >
                    {artifacts.map((a) => (
                      <option key={a} value={a}>
                        {a === 'all' ? 'All Artifacts' : a}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    License Usability
                  </label>
                  <select
                    value={selectedLicenseTier}
                    onChange={(e) => setSelectedLicenseTier(e.target.value)}
                    className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 truncate"
                  >
                    {licenseTiers.map((l) => (
                      <option key={l} value={l}>
                        {l === 'all' ? 'All Licenses' : l}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Min Stars
                    </label>
                    <span className="text-[10px] text-amber-400 font-mono font-medium">
                      {minStars.toLocaleString()}★
                    </span>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="100000"
                    step="500"
                    value={minStars}
                    onChange={(e) => setMinStars(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Stats Summary */}
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>
                Matching <strong className="text-white">{filteredRepos.length}</strong> of{' '}
                <strong className="text-white">{repos.length}</strong> repositories
              </span>
              <span className="text-slate-500 hidden sm:inline">
                Click any repository card to see plain-English explanations, superpowers, and alternatives
              </span>
            </div>

            {/* Repos Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRepos.map((repo) => (
                <div
                  key={repo.id}
                  onClick={() => {
                    setActiveRepoModal(repo);
                    setModalTab('overview');
                  }}
                  className="bg-[#161b22] border border-slate-800/90 rounded-xl p-5 hover:border-indigo-500/50 hover:bg-[#1a212d] transition-all cursor-pointer flex flex-col justify-between group shadow-sm relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-indigo-500/5 to-transparent rounded-bl-full pointer-events-none" />

                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-semibold text-slate-100 group-hover:text-indigo-300 transition-colors break-all">
                        <span className="text-slate-400 font-normal">{repo.owner} / </span>
                        {repo.name}
                      </h3>
                      <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors shrink-0" />
                    </div>

                    {/* Taxonomy Chips */}
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        {repo.domain}
                      </span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                        {repo.subsystem}
                      </span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400">
                        {repo.artifact}
                      </span>
                    </div>

                    {/* Plain-English Hook: What It Does */}
                    <div className="bg-[#0d1117] p-2.5 rounded-lg border border-slate-800/90 mb-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-indigo-400 uppercase tracking-wide mb-1">
                        <Lightbulb className="w-3 h-3 text-indigo-400" />
                        <span>The Simple Explanation</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed line-clamp-2">
                        {repo.beginner_intel?.what_it_does || repo.description}
                      </p>
                    </div>

                    {/* Deep Enriched Badges: Primitives & Compatibility */}
                    <div className="space-y-1.5 mb-4">
                      {repo.primitives && repo.primitives.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Cpu className="w-3 h-3 text-emerald-400 shrink-0" />
                          {repo.primitives.map((prim) => (
                            <span key={prim} className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/30">
                              {prim}
                            </span>
                          ))}
                        </div>
                      )}

                      {repo.compatibility && repo.compatibility.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Boxes className="w-3 h-3 text-cyan-400 shrink-0" />
                          {repo.compatibility.map((c) => (
                            <span key={c} className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-500/30">
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-1 text-amber-400 font-medium">
                        <Star className="w-3.5 h-3.5 fill-amber-400/20" />
                        <span>{repo.stars.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center space-x-1 text-slate-400">
                        <GitFork className="w-3.5 h-3.5" />
                        <span>{repo.forks.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-mono text-slate-300">{repo.language}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        repo.license_intel?.tier === 'Permissive'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : repo.license_intel?.tier === 'Copyleft'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                      }`}>
                        {repo.license}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* SQL Studio Mode */
          <div className="space-y-6">
            <div className="bg-[#161b22] border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    In-Browser SQL Studio with Architectural Fields
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Query extended fields: <code className="text-indigo-300">primitives</code>, <code className="text-indigo-300">compatibility</code>, <code className="text-indigo-300">maturity</code>, <code className="text-indigo-300">license_intel</code>.
                  </p>
                </div>
                <button
                  onClick={executeSQL}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <span>Execute Query</span>
                  <span className="text-[10px] opacity-75">(Ctrl+Enter)</span>
                </button>
              </div>

              {/* SQL Textarea */}
              <div className="relative font-mono text-xs">
                <textarea
                  rows={5}
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      executeSQL();
                    }
                  }}
                  className="w-full bg-[#0d1117] border border-slate-700 rounded-lg p-3 text-emerald-400 focus:outline-none focus:border-indigo-500 resize-none font-mono leading-relaxed"
                />
              </div>

              {/* Quick Query Templates */}
              <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
                <span className="text-slate-500 font-medium">Quick Queries:</span>
                <button
                  onClick={() => {
                    setSqlQuery("SELECT name, stars, subsystem, primitives\nFROM repos\nWHERE domain = 'Databases & Storage'\nORDER BY stars DESC;");
                  }}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700/60 transition-colors"
                >
                  Database Primitives
                </button>
                <button
                  onClick={() => {
                    setSqlQuery("SELECT name, stars, language, subsystem\nFROM repos\nWHERE language = 'Rust'\nORDER BY stars DESC;");
                  }}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700/60 transition-colors"
                >
                  Rust Systems
                </button>
                <button
                  onClick={() => {
                    setSqlQuery("SELECT name, stars, license, compatibility\nFROM repos\nWHERE domain = 'AI & Machine Learning'\nORDER BY stars DESC;");
                  }}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700/60 transition-colors"
                >
                  AI Compatibility
                </button>
              </div>
            </div>

            {/* Error Message */}
            {sqlError && (
              <div className="p-4 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-xs font-mono whitespace-pre-wrap">
                {sqlError}
              </div>
            )}

            {/* Results Table */}
            {sqlResults && (
              <div className="bg-[#161b22] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 bg-slate-900/40">
                  <span>Results: <strong>{sqlResults.length}</strong> rows returned</span>
                  <button
                    onClick={() => {
                      const csv = [
                        Object.keys(sqlResults[0] || {}).join(','),
                        ...sqlResults.map((row) =>
                          Object.values(row)
                            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                            .join(',')
                        )
                      ].join('\n');
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'gitscour-query-results.csv';
                      a.click();
                    }}
                    className="hover:text-white transition-colors underline"
                  >
                    Export to CSV
                  </button>
                </div>
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#0d1117] text-slate-400 sticky top-0 border-b border-slate-800 uppercase tracking-wider font-semibold">
                      <tr>
                        {sqlResults.length > 0 &&
                          Object.keys(sqlResults[0]).map((col) => (
                            <th key={col} className="px-4 py-3">
                              {col}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {sqlResults.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          {Object.values(row).map((val, cidx) => (
                            <td key={cidx} className="px-4 py-2.5 text-slate-300 max-w-xs truncate">
                              {Array.isArray(val) ? val.join(', ') : typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Deep Repository Architecture & Inspiration Modal */}
      {activeRepoModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Top Header */}
            <div className="p-6 border-b border-slate-800 bg-[#1b212b] flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                    {activeRepoModal.domain}
                  </span>
                  <span className="text-xs text-slate-400">&bull;</span>
                  <span className="text-xs text-slate-300 font-medium">
                    {activeRepoModal.subsystem}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <span>{activeRepoModal.owner} / {activeRepoModal.name}</span>
                </h2>
              </div>
              <button
                onClick={() => setActiveRepoModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex items-center border-b border-slate-800 bg-[#141922] px-6 gap-6 text-xs font-semibold">
              <button
                onClick={() => setModalTab('overview')}
                className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
                  modalTab === 'overview'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>The Story & Purpose</span>
              </button>
              <button
                onClick={() => setModalTab('superpowers')}
                className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
                  modalTab === 'superpowers'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>Superpowers & Tradeoffs</span>
              </button>
              <button
                onClick={() => setModalTab('quickstart')}
                className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
                  modalTab === 'quickstart'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Play className="w-4 h-4" />
                <span>Quickstart & Architecture</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
              {modalTab === 'overview' && (
                <div className="space-y-6">
                  {/* The "Explain Like I Have Zero Knowledge" Section */}
                  <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-[#161b22] p-4 rounded-xl border border-indigo-500/30 space-y-3">
                    <div className="flex items-center gap-2 text-indigo-300 font-bold uppercase tracking-wider text-[11px]">
                      <Lightbulb className="w-4 h-4 text-indigo-400" />
                      <span>What does this project actually do?</span>
                    </div>
                    <p className="text-slate-100 text-sm leading-relaxed font-medium">
                      {activeRepoModal.beginner_intel?.what_it_does || activeRepoModal.description}
                    </p>
                  </div>

                  {/* Why it matters & when to choose it */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#0d1117] p-4 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                        <Flame className="w-3.5 h-3.5" />
                        <span>Why does this project exist?</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed text-[11px]">
                        {activeRepoModal.beginner_intel?.why_it_matters || "Created to solve critical scalability, performance, and developer ergonomics problems in its domain."}
                      </p>
                    </div>

                    <div className="bg-[#0d1117] p-4 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>When should you use this?</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed text-[11px]">
                        {activeRepoModal.beginner_intel?.when_to_use || "Best suited for modern applications requiring production-grade performance and active maintenance."}
                      </p>
                    </div>
                  </div>

                  {/* Vital Stats & Maturity */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0d1117] p-3 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Community Stars</span>
                      <span className="text-sm font-semibold text-amber-400 flex items-center gap-1 mt-0.5">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        {activeRepoModal.stars.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Fork Count</span>
                      <span className="text-sm font-semibold text-slate-200 flex items-center gap-1 mt-0.5">
                        <GitFork className="w-3.5 h-3.5" />
                        {activeRepoModal.forks.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Primary Language</span>
                      <span className="text-sm font-semibold text-indigo-300 mt-0.5 block">
                        {activeRepoModal.language}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Maturity Rating</span>
                      <span className="text-xs font-semibold text-emerald-400 mt-0.5 block truncate" title={activeRepoModal.maturity?.rating}>
                        {activeRepoModal.maturity?.rating}
                      </span>
                    </div>
                  </div>

                  {/* Commercial License Clear Assessment */}
                  <div className="bg-[#0d1117] p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-indigo-400" />
                        <span className="font-semibold text-slate-200">Commercial Usability & License Risk</span>
                      </div>
                      <span className="font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        {activeRepoModal.license}
                      </span>
                    </div>
                    <div className="text-slate-400 leading-relaxed text-[11px]">
                      <strong>Commercial Status:</strong> {activeRepoModal.license_intel?.commercial} &mdash; {activeRepoModal.license_intel?.desc}
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'superpowers' && (
                <div className="space-y-6">
                  {/* Superpowers */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-3 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      Key Superpowers & Breakthrough Features
                    </label>
                    <div className="space-y-2">
                      {(activeRepoModal.beginner_intel?.key_superpowers || [
                        "High throughput and zero unnecessary allocations",
                        "Active open-source community support and extensive documentation",
                        "Seamless integration into modern production ecosystems"
                      ]).map((power, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 bg-[#0d1117] p-3 rounded-xl border border-slate-800/90 text-slate-200 text-xs leading-relaxed">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{power}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Alternatives & Competitors */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-3 flex items-center gap-1.5">
                      <GitCompare className="w-4 h-4 text-cyan-400" />
                      Notable Alternatives & How It Compares
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(activeRepoModal.beginner_intel?.alternatives || ["Standard libraries", "Managed Cloud APIs"]).map((alt, idx) => (
                        <span key={idx} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 font-medium text-xs">
                          {alt}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Semantic Keywords Cloud */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2 flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-amber-400" />
                      Indexed Semantic Keywords ({activeRepoModal.keywords?.length || 0})
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {(activeRepoModal.keywords || []).map((kw) => (
                        <span key={kw} className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60 font-mono text-[10px]">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'quickstart' && (
                <div className="space-y-6">
                  {/* Quickstart Command */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2 flex items-center gap-1.5">
                      <Play className="w-4 h-4 text-emerald-400" />
                      Immediate Run / Installation Snippet
                    </label>
                    <div className="relative bg-[#0d1117] border border-slate-800 rounded-xl p-3 font-mono text-emerald-400 text-xs">
                      <pre className="overflow-x-auto whitespace-pre-wrap">{activeRepoModal.quickstart_code}</pre>
                      <button
                        onClick={() => copyToClipboard(activeRepoModal.quickstart_code, 'quickstart')}
                        className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-white rounded bg-slate-800 border border-slate-700 transition-colors"
                        title="Copy command"
                      >
                        {copiedText === 'quickstart' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Architectural Primitives */}
                  {activeRepoModal.primitives && activeRepoModal.primitives.length > 0 && (
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2 flex items-center gap-1.5">
                        <Cpu className="w-4 h-4 text-emerald-400" />
                        Under-the-Hood Architectural Primitives
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {activeRepoModal.primitives.map((prim) => (
                          <span key={prim} className="px-3 py-1 rounded-lg bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 font-medium">
                            {prim}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Target Protocols & Interoperability */}
                  {activeRepoModal.compatibility && activeRepoModal.compatibility.length > 0 && (
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2 flex items-center gap-1.5">
                        <Boxes className="w-4 h-4 text-cyan-400" />
                        Compatible Protocols & APIs
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {activeRepoModal.compatibility.map((c) => (
                          <span key={c} className="px-3 py-1 rounded-lg bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 font-medium">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Standard Git Clone */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
                      Git Clone Command
                    </label>
                    <div className="flex items-center justify-between bg-[#0d1117] border border-slate-800 rounded-lg p-2.5 font-mono text-slate-300">
                      <span className="truncate mr-2">git clone {activeRepoModal.url}.git</span>
                      <button
                        onClick={() => copyToClipboard(`git clone ${activeRepoModal.url}.git`, 'clone')}
                        className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors shrink-0"
                        title="Copy command"
                      >
                        {copiedText === 'clone' ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-[#1b212b] flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Last Pushed: {new Date(activeRepoModal.pushed_at).toLocaleDateString()}
              </span>
              <a
                href={activeRepoModal.url}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
              >
                <span>View on GitHub</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#161b22] py-4 mt-8 text-center text-xs text-slate-500">
        <p>GitScour &bull; Open-Source Queriable GitHub Knowledge Base &bull; Hosted 100% Free on GitHub Pages</p>
      </footer>
    </div>
  );
}
