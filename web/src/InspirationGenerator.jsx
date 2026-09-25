import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, Shuffle, ArrowRight, Layers, ExternalLink, 
  Database, Cpu, Globe, CheckCircle2, Shield, Rocket, Copy, Check,
  Workflow, GitFork, Star, Terminal, Code2, SlidersHorizontal, BookOpen,
  Plus, Trash2, ArrowUpDown, Compass, CheckCircle, RefreshCw, AlertTriangle,
  Zap, Search, X, CheckSquare, Activity, ShieldAlert, ArrowRightLeft, FileCode,
  Gauge, Filter, Eye
} from 'lucide-react';
import Stack3DVisualizer from './Stack3DVisualizer.jsx';
import blueprintsDoc from './blueprints.json';
import { mulberry32, selectBlueprint, completeStack } from './blueprint-engine.mjs';
import { evaluatePair, synergyFromPairs } from './synergy-core.mjs';

export default function InspirationGenerator({ repos, onSelectRepo, seed, onSeedChange }) {
  const [activeStack, setActiveStack] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [selectedGoal, setSelectedGoal] = useState('all');
  const [genStep, setGenStep] = useState(0); // W4 §3.8 — rng step: same ?seed= => same first stack

  // Intelligent Progressive Cascading Filter Toggle
  const [enableGuidedCascading, setEnableGuidedCascading] = useState(true);

  // Search filter inside custom slots
  const [slotSearches, setSlotSearches] = useState({});

  // 1. Dynamic User Stack Pooling Sandbox
  const [customPool, setCustomPool] = useState([
    // Layer 0 seeds from the catalog itself once loaded — never hardcode a repo
    // id here: the catalog uses synthetic blake2b ids, and a stale truthy id
    // (e.g. duckdb's real GitHub id 44211562) used to survive every self-heal
    // guard and crash the pairwise analysis. See EXPERT_PANEL_REVIEW.md #1.
    { role: "Vector / State Store", repoId: null, domainFilter: "Databases & Storage", subsystem: "Vector Database" },
    { role: "Inference / LLM Engine", repoId: null, domainFilter: "AI & Machine Learning", subsystem: "LLM Inference & Serving" },
    { role: "API Gateway / Backend", repoId: null, domainFilter: "Web Platforms & Frameworks", subsystem: "Service Mesh & API Gateway" },
    { role: "Reactive UI / Canvas", repoId: null, domainFilter: "Web Platforms & Frameworks", subsystem: "UI Component Architecture" }
  ]);

  // Fast Repo ID Lookup Map
  const repoMap = useMemo(() => {
    const map = new Map();
    repos.forEach(r => map.set(r.id, r));
    return map;
  }, [repos]);

  // §3.8 — subsystem vocabulary for slot requirements (from the packed catalog)
  const subsystemOptions = useMemo(
    () => [...new Set(repos.map(r => r.subsystem).filter(Boolean))].sort(),
    [repos]
  );

  // Seed Layer 0 with duckdb (or the top database repo) once the catalog loads.
  // Replaces a side-effectful useMemo that mutated state during render and only
  // checked truthiness, so it could never heal a stale-but-truthy id. This also
  // self-heals: any Layer-0 id missing from the catalog is re-seeded.
  useEffect(() => {
    if (repos.length === 0) return;
    const currentId = customPool[0] && customPool[0].repoId;
    if (currentId && repoMap.has(currentId)) return; // valid selection — keep the user's choice
    const db = repos.find(r => r.name.toLowerCase() === 'duckdb') || repos.find(r => r.domain === 'Databases & Storage');
    if (db) {
      setCustomPool(prev => prev.map((s, i) => (i === 0 ? { ...s, repoId: db.id } : s)));
    }
    // customPool intentionally omitted: this must only re-run when the catalog
    // changes, not on every slot edit (user edits of Layer 0 are respected).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos, repoMap]);

  // Categorize repositories into architectural roles
  const categorized = useMemo(() => {
    return {
      storage: repos.filter(r => r.domain === "Databases & Storage" || (r.subsystem && r.subsystem.toLowerCase().includes("store"))),
      ai: repos.filter(r => r.domain === "AI & Machine Learning"),
      backend: repos.filter(r => r.domain === "Web Platforms & Frameworks" || r.domain === "Networking & Distributed Systems"),
      frontend: repos.filter(r => (r.subsystem && r.subsystem.includes("UI")) || r.language === "TypeScript" || r.language === "JavaScript"),
      devtools: repos.filter(r => r.domain === "Developer Tooling & Compilers" || r.domain === "Cloud & Infrastructure"),
      security: repos.filter(r => r.domain === "Security & Cryptography")
    };
  }, [repos]);

  // Curated blueprint library — data lives in blueprints.json (W4 §3.6),
  // completion rules live in blueprint-engine.mjs (deterministic, zero-LLM).
  const BLUEPRINTS = blueprintsDoc.blueprints;

  // owner/name -> repo over the WHOLE catalog, so curated seeds resolve even
  // when a v1 subsystem label filed them outside the category bucket.
  const repoLookup = useMemo(
    () => new Map(repos.map(r => [`${r.owner}/${r.name}`, r])),
    [repos]
  );

  // Deterministic stack generation (§3.6/§3.8): rng is a pure function of
  // (URL ?seed=, goal, click-step). No Math.random anywhere in generation.
  const generateRandomStack = (forcedBlueprint = null, goalOverride = null, seedOverride = null) => {
    const goal = goalOverride ?? selectedGoal;
    const step = genStep + 1;
    setGenStep(step);
    const effSeed = seedOverride ?? (seed || `gs-${Date.now().toString(36)}-${genStep}`);
    if (!seed && !seedOverride && onSeedChange) onSeedChange(effSeed); // adopt into ?seed=
    const rng = mulberry32(`${effSeed}|${goal}|${step}`);

    const blueprint = forcedBlueprint || selectBlueprint(BLUEPRINTS, goal, rng);
    if (!blueprint) return;

    const { components, missing } = completeStack(blueprint, categorized, repoLookup, rng);
    setActiveStack({ template: blueprint, components, missing });
  };

  // §3.8 — visible/resettable seed: re-roll writes a fresh ?seed= and rebuilds.
  const rerollSeed = () => {
    const s = `gs-${Date.now().toString(36)}-${genStep}`;
    if (onSeedChange) onSeedChange(s);
    generateRandomStack(null, null, s);
  };

  const copyBlueprint = () => {
    if (!activeStack) return;
    const text = `🚀 Project Blueprint: ${activeStack.template.title}\n${activeStack.template.tagline}\n\nArchitecture Stack:\n` +
      activeStack.components.map(c => c.repo ? `• ${c.role}: ${c.repo.owner}/${c.repo.name} (${c.repo.url})` : `• ${c.role}: — no candidate in this catalog build`).join('\n') +
      `\n\nWhy this stack works:\n${activeStack.template.whyItWorks}\n\nArchitectural Tradeoffs:\n${activeStack.template.tradeoffs}`;
    navigator.clipboard.writeText(text);
    setCopiedIndex(true);
    setTimeout(() => setCopiedIndex(false), 2000);
  };

  // -----------------------------------------------------------------------------------------
  // 🔬 MULTI-DIMENSIONAL ARCHITECTURAL COMPATIBILITY TEST ENGINE (Universal Evaluation)
  // -----------------------------------------------------------------------------------------
  const customPoolAnalysis = useMemo(() => {
    const selectedRepos = customPool
      .map(slot => ({ role: slot.role, repo: slot.repoId ? repoMap.get(slot.repoId) : null }))
      .filter(item => item.repo); // truthy: drops null AND undefined (stale ids — review finding #1)

    if (selectedRepos.length === 0) {
      return {
        score: 0,
        grade: "Empty",
        selectedCount: 0,
        matrix: [],
        positiveSignals: [],
        frictions: [],
        runtimeHarmonies: [],
        items: []
      };
    }

    // W4 §3.8 — scoring moved to synergy-core.mjs (unit-pinned):
    //   * score = MEAN over pair scores (2-slot and 6-slot pools comparable)
    //   * same language alone never reaches "High Synergy" (18 < 25 gap)
    //   * protocol matrix derived from COMPATIBILITY_RULES labels incl. the
    //     deterministic client pairings (Postgres-compatible <-> pg drivers …)
    const positiveSignals = [];
    const frictions = [];
    const runtimeHarmonies = [];
    const matrix = [];
    const pairScores = [];

    for (let i = 0; i < selectedRepos.length; i++) {
      for (let j = i + 1; j < selectedRepos.length; j++) {
        const a = selectedRepos[i].repo;
        const b = selectedRepos[j].repo;
        const roleA = selectedRepos[i].role;
        const roleB = selectedRepos[j].role;
        const res = evaluatePair(a, b);
        pairScores.push(res.score);
        positiveSignals.push(...res.positives);
        frictions.push(...res.frictions);
        runtimeHarmonies.push(...res.harmonies);
        matrix.push({
          nodeA: a,
          nodeB: b,
          roleA,
          roleB,
          score: res.score,
          status: res.status,
          notes: res.notes
        });
      }
    }

    const agg = synergyFromPairs(pairScores);
    return {
      score: agg.score,
      grade: agg.grade,
      gradeColor: agg.gradeColor,
      selectedCount: selectedRepos.length,
      matrix,
      positiveSignals,
      frictions,
      runtimeHarmonies,
      items: selectedRepos
    };
  }, [customPool, repoMap]);

  // -----------------------------------------------------------------------------------------
  // 🎯 PROGRESSIVE CASCADING CANDIDATES GENERATOR (Layer 1 -> Layer 2 -> Layer 3)
  // -----------------------------------------------------------------------------------------
  const getCandidatesForSlot = (slotIdx) => {
    const slot = customPool[slotIdx];
    const searchVal = (slotSearches[slotIdx] || '').trim().toLowerCase();

    // Base pool matching domain
    let base = repos.filter(r => slot.domainFilter === 'all' || r.domain === slot.domainFilter);

    // §3.8 — declared subsystem requirement: exact-label matches are boosted to
    // the front of the candidate list (a boost, not a hard filter: v1 labels
    // are noisy, and an empty dropdown would be worse than an honest ranking).
    if (slot.subsystem) {
      base = [
        ...base.filter(r => r.subsystem === slot.subsystem),
        ...base.filter(r => r.subsystem !== slot.subsystem)
      ];
    }

    // Apply text search if entered
    if (searchVal) {
      base = base.filter(r => r.name.toLowerCase().includes(searchVal) || r.owner.toLowerCase().includes(searchVal));
    }

    // If guided cascading is disabled or this is Layer 1, return standard top-starred candidates
    if (!enableGuidedCascading || slotIdx === 0) {
      return base.slice(0, 45);
    }

    // Previous upstream selections
    const upstreamSelections = customPool
      .slice(0, slotIdx)
      .map(s => s.repoId ? repoMap.get(s.repoId) : null)
      .filter(Boolean);

    if (upstreamSelections.length === 0) {
      return base.slice(0, 45);
    }

    // Score and rank candidates by synergetic compatibility with upstream choices
    const scoredCandidates = base.map(cand => {
      let candSynergyScore = 0;
      let reasons = [];

      upstreamSelections.forEach(up => {
        // 1. Language harmony
        const upLang = (up.language || '').toLowerCase();
        const candLang = (cand.language || '').toLowerCase();
        if (upLang === candLang && upLang !== 'other') {
          candSynergyScore += 30;
          reasons.push(`Shared runtime (${up.language}) with ${up.name}`);
        } else if (
          (upLang === 'python' && ['rust', 'c++', 'c'].includes(candLang)) ||
          (candLang === 'python' && ['rust', 'c++', 'c'].includes(upLang))
        ) {
          candSynergyScore += 20;
          reasons.push(`PyO3 / C-Extension synergy with ${up.name}`);
        }

        // 2. Shared primitives
        const shared = (cand.primitives || []).filter(p => (up.primitives || []).includes(p));
        if (shared.length > 0) {
          candSynergyScore += 25;
          reasons.push(`Shared [${shared.join(', ')}] with ${up.name}`);
        }
      });

      // Factor in general community popularity slightly
      candSynergyScore += Math.log10(cand.stars) * 2;

      return {
        ...cand,
        synergyScore: candSynergyScore,
        synergyReason: reasons[0] || "Standard REST/IPC compatible"
      };
    });

    // Sort highest synergy first
    scoredCandidates.sort((a, b) => b.synergyScore - a.synergyScore);
    return scoredCandidates.slice(0, 45);
  };

  // First auto-stack once the catalog loads. (Render-phase setState must not
  // leak the adopted seed up to App, so this runs as an effect — §3.8.)
  useEffect(() => {
    if (!activeStack && repos.length > 0) generateRandomStack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos.length]);

  return (
    <div className="space-y-8">
      {/* -------------------------------------------------------------------------- */}
      {/* SECTION 1: INTERACTIVE ARCHITECTURE POOLING SANDBOX & TEST HARNESS        */}
      {/* -------------------------------------------------------------------------- */}
      <div className="bg-obs-surface border border-white/[0.14] rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/[0.05] rounded-full blur-3xl pointer-events-none" />

        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/[0.07] pb-5 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-300 bg-white/[0.05] border border-white/[0.12] px-3 py-0.5 rounded-full">
                <Layers className="w-3.5 h-3.5 text-zinc-300" />
                Live Architecture Pooling &amp; Compatibility Test Harness
              </span>
              <span className="text-xs text-zinc-500">&bull;</span>
              <span className="text-xs text-zinc-400">Deterministic Pairwise Verification Across 123,000+ Repos</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Test &amp; Pool Your Custom Tech Stack
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 mt-1 max-w-3xl leading-relaxed">
              Select or search any project into each architectural slot. The engine tests runtime boundaries, 
              shared memory protocols (e.g., Arrow / Zero-Copy), and license reciprocity to calculate an objective score.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {/* Guided Cascading Filter Toggle */}
            <button
              onClick={() => setEnableGuidedCascading(!enableGuidedCascading)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors shadow-sm ${
                enableGuidedCascading
                  ? 'bg-signal-ok/10 text-signal-ok border-signal-ok/30'
                  : 'bg-white/[0.05] text-zinc-400 border-white/[0.10] hover:text-white'
              }`}
              title="When enabled, downstream layers automatically prioritize tools compatible with upstream choices"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{enableGuidedCascading ? 'Guided Compatibility: ON' : 'Guided Compatibility: OFF'}</span>
            </button>

            <button
              onClick={() => {
                setCustomPool(prev => [
                  ...prev,
                  { role: `Auxiliary Layer ${prev.length + 1}`, repoId: null, domainFilter: "all", subsystem: null }
                ]);
              }}
              className="px-3.5 py-2 bg-white/[0.05] hover:bg-white/[0.09] text-zinc-200 border border-white/[0.10] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom Layer</span>
            </button>
            <button
              onClick={() => {
                const py = repos.find(r => r.name.toLowerCase() === 'fastapi') || repos[0];
                const db = repos.find(r => r.name.toLowerCase() === 'duckdb') || repos[1];
                const ai = repos.find(r => r.name.toLowerCase() === 'vllm') || repos[2];
                const ui = repos.find(r => r.name.toLowerCase() === 'tremor') || repos[3];
                setCustomPool([
                  { role: "Vector / State Store", repoId: db?.id || null, domainFilter: "Databases & Storage", subsystem: "Vector Database" },
                  { role: "Inference / LLM Engine", repoId: ai?.id || null, domainFilter: "AI & Machine Learning", subsystem: "LLM Inference & Serving" },
                  { role: "Async API Backend", repoId: py?.id || null, domainFilter: "Web Platforms & Frameworks", subsystem: "Service Mesh & API Gateway" },
                  { role: "Modern Analytics UI", repoId: ui?.id || null, domainFilter: "Web Platforms & Frameworks", subsystem: "UI Component Architecture" }
                ]);
              }}
              className="btn-primary px-3.5 py-2 rounded-xl text-xs font-bold transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Load Verified Stack</span>
            </button>
          </div>
        </div>

        {/* Dynamic Architectural Slots Grid with Guided Cascading */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {customPool.map((slot, idx) => {
            const selectedItem = (slot.repoId && repoMap.get(slot.repoId)) || null;
            const candidates = getCandidatesForSlot(idx);

            return (
              <div 
                key={idx} 
                className={`bg-obs-inset border rounded-xl p-4 flex flex-col justify-between space-y-3 transition-all ${
                  selectedItem ? 'border-white/[0.14] shadow-md' : 'border-white/[0.07]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-semibold uppercase mb-1.5">
                    <span className="text-zinc-300 font-bold">Layer 0{idx + 1}: {slot.role}</span>
                    {customPool.length > 2 && (
                      <button
                        onClick={() => setCustomPool(prev => prev.filter((_, i) => i !== idx))}
                        className="text-zinc-500 hover:text-signal-risk transition-colors"
                        title="Remove slot"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Filterable Dropdown with Search Box */}
                  <div className="space-y-1.5 mb-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="Search 123k repos..."
                        value={slotSearches[idx] || ''}
                        onChange={(e) => setSlotSearches(prev => ({ ...prev, [idx]: e.target.value }))}
                        className="w-full bg-obs-surface border border-white/[0.09] rounded-lg pl-7 pr-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/[0.07]"
                      />
                    </div>

                    <select
                      value={slot.subsystem || ''}
                      onChange={(e) => setCustomPool(prev => prev.map((s, i) => i === idx ? { ...s, subsystem: e.target.value || null } : s))}
                      title="Required subsystem for this slot — matches are boosted to the top of the candidate list"
                      className="w-full bg-obs-surface border border-white/[0.10] rounded-lg px-2 py-1.5 text-[11px] text-zinc-300 focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/[0.07] truncate"
                    >
                      <option value="">Required subsystem: any</option>
                      {subsystemOptions.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>

                    <select
                      value={slot.repoId || ''}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        setCustomPool(prev => prev.map((s, i) => i === idx ? { ...s, repoId: id || null } : s));
                      }}
                      className="w-full bg-obs-surface border border-white/[0.10] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/[0.07] truncate"
                    >
                      <option value="">{selectedItem ? 'Change repository...' : 'Select a candidate...'}</option>
                      {candidates.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.language} &bull; {c.stars.toLocaleString()}★){c.synergyReason && enableGuidedCascading && idx > 0 ? ` [${c.synergyReason}]` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedItem ? (
                  <div className="bg-obs-surface p-3 rounded-xl border border-white/[0.08] text-xs space-y-2">
                    <div className="flex items-center justify-between font-bold text-white">
                      <span className="truncate text-sm">{selectedItem.name}</span>
                      <span className="text-[10px] font-mono text-signal-star">{selectedItem.stars.toLocaleString()}★</span>
                    </div>

                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                      {selectedItem.description}
                    </p>

                    <div className="pt-2 border-t border-white/[0.07] flex items-center justify-between text-[10px]">
                      <span className="text-zinc-100 font-mono bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.10]">
                        {selectedItem.language}
                      </span>
                      <span className="text-zinc-400 font-mono">
                        {selectedItem.license}
                      </span>
                      <button
                        onClick={() => onSelectRepo(selectedItem)}
                        className="text-signal-ok hover:underline font-semibold"
                      >
                        Inspect
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 border border-dashed border-white/[0.07] rounded-xl text-center text-zinc-500 text-xs flex flex-col items-center justify-center space-y-1">
                    <span className="text-zinc-400 font-medium">Slot Empty</span>
                    <span className="text-[10px] text-zinc-500">Pick a repo above to run test</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ------------------------------------------------------------------------ */}
        {/* NEW 3D STACK INTERACTIVE CONSTELLATION VISUALIZER                        */}
        {/* ------------------------------------------------------------------------ */}
        {customPoolAnalysis.selectedCount >= 2 && (
          <div className="mb-6 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-zinc-300" />
                <span>Interactive 3D Stack Spatial Constellation</span>
              </span>
              <span className="text-[11px] text-zinc-400">
                Drag to rotate &bull; Scroll to zoom &bull; Glowing laser beams represent verified bridges
              </span>
            </div>

            <Stack3DVisualizer
              stackItems={customPoolAnalysis.items}
              analysis={customPoolAnalysis}
              onSelectRepo={onSelectRepo}
            />
          </div>
        )}

        {/* ------------------------------------------------------------------------ */}
        {/* LIVE ARCHITECTURAL TEST SCORECARD & VERIFICATION MATRIX (NOT BLIND)      */}
        {/* ------------------------------------------------------------------------ */}
        <div className="bg-obs-inset border border-white/[0.07] rounded-2xl p-5 space-y-5">
          {/* Top Scorecard Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
            <div className="flex items-center gap-3">
              <div className="bg-white/[0.06] text-zinc-300 p-2.5 rounded-xl border border-white/[0.12]">
                <Gauge className="w-6 h-6 text-zinc-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-zinc-400 font-bold">
                    Architectural Compatibility Score:
                  </span>
                  <span className="text-xl font-bold font-mono text-white">
                    {customPoolAnalysis.score} / 100
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-semibold ${customPoolAnalysis.gradeColor}`}>
                    {customPoolAnalysis.grade}
                  </span>
                  <span className="text-zinc-600">&bull;</span>
                  <span className="text-xs text-zinc-400">
                    <span className="num">{customPoolAnalysis.selectedCount}</span> of <span className="num">{customPool.length}</span> Layers Verified
                  </span>
                </div>
              </div>
            </div>

            {/* Progress Gauge */}
            <div className="w-full sm:w-60 bg-white/[0.07] h-2.5 rounded-full overflow-hidden p-0.5">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  customPoolAnalysis.score >= 75 ? 'bg-signal-ok' :
                  customPoolAnalysis.score >= 50 ? 'bg-signal-warn' :
                  'bg-signal-risk'
                }`}
                style={{ width: `${customPoolAnalysis.score}%` }}
              />
            </div>
          </div>

          {/* Pairwise Interaction Matrix */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-1.5">
              <Workflow className="w-4 h-4 text-zinc-300" />
              <span>Pairwise Architectural Bridge Analysis (How Components Talk to Each Other)</span>
            </h4>

            {customPoolAnalysis.matrix.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">Select at least 2 repositories in the slots above to visualize pairwise compatibility.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {customPoolAnalysis.matrix.map((item, idx) => (
                  <div key={idx} className="bg-obs-surface border border-white/[0.07] rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-200">{item.nodeA.name}</span>
                        <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-zinc-200">{item.nodeB.name}</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                        item.score >= 75 ? 'bg-signal-ok/10 text-signal-ok border border-signal-ok/25' :
                        item.score >= 50 ? 'bg-white/[0.05] text-zinc-100 border border-white/[0.12]' :
                        'bg-signal-warn/10 text-signal-star border border-signal-warn/25'
                      }`}>
                        {item.status} ({item.score}%)
                      </span>
                    </div>

                    <div className="space-y-1">
                      {item.notes.map((note, nIdx) => (
                        <div key={nIdx} className="text-[11px] text-zinc-300 flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-zinc-300 shrink-0 mt-0.5" />
                          <span>{note}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Synergies vs Tradeoffs / Frictions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Positive Synergies Detected */}
            <div className="bg-obs-surface border border-signal-ok/25 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-signal-ok font-bold text-xs uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4 text-signal-ok" />
                <span>Verified Hardware &amp; Primitive Synergies ({customPoolAnalysis.positiveSignals.length})</span>
              </div>
              {customPoolAnalysis.positiveSignals.length === 0 ? (
                <p className="text-[11px] text-zinc-500 italic">No shared hardware/primitive optimizations detected between selected tools.</p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {customPoolAnalysis.positiveSignals.map((sig, sIdx) => (
                    <div key={sIdx} className="text-[11px] text-zinc-300 leading-relaxed bg-obs-inset p-2 rounded-lg border border-white/[0.07]">
                      <strong className="text-signal-ok">{sig.pair}</strong>: {sig.desc}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Frictions & Architectural Bottlenecks */}
            <div className="bg-obs-surface border border-signal-warn/25 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-signal-star font-bold text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 text-signal-star" />
                <span>Architectural Frictions &amp; Boundary Warnings ({customPoolAnalysis.frictions.length})</span>
              </div>
              {customPoolAnalysis.frictions.length === 0 ? (
                <p className="text-[11px] text-zinc-500 italic">No high-latency boundaries or license reciprocity hazards detected.</p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {customPoolAnalysis.frictions.map((fric, fIdx) => (
                    <div key={fIdx} className="text-[11px] text-zinc-300 leading-relaxed bg-obs-inset p-2 rounded-lg border border-white/[0.07]">
                      <span className="font-semibold text-signal-star block">[{fric.type}] {fric.pair}</span>
                      <span className="text-zinc-400">{fric.desc}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------------- */}
      {/* SECTION 2: CURATED ARCHITECTURE BLUEPRINTS                                 */}
      {/* -------------------------------------------------------------------------- */}
      {activeStack && (
        <div className="bg-obs-sheen bg-obs-surface border border-white/[0.12] rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/[0.035] rounded-full blur-3xl pointer-events-none" />

          {/* Header Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 border-b border-white/[0.07] pb-6">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-300 bg-white/[0.05] border border-white/[0.10] px-2.5 py-0.5 rounded-full">
                  <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
                  Pre-Configured Reference Architectures
                </span>
                <span className="text-xs text-zinc-500">&bull;</span>
                <span className="text-xs text-zinc-400">Battle-tested templates</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {activeStack.template.title}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-300 mt-1 max-w-3xl leading-relaxed">
                {activeStack.template.tagline}
              </p>
            </div>

            {/* Action Controls */}
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <div className="bg-obs-surface border border-white/[0.07] rounded-xl p-1 flex items-center text-xs">
                {['all', 'ai', 'systems', 'security'].map(g => (
                  <button
                    key={g}
                    onClick={() => {
                      setSelectedGoal(g);
                      // §3.6: regenerate from the chosen goal's blueprint pool
                      generateRandomStack(null, g);
                    }}
                    className={`px-2.5 py-1 rounded-lg capitalize font-medium transition-colors ${
                      selectedGoal === g ? 'bg-white/[0.08] ring-1 ring-inset ring-white/[0.14] text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <button
                onClick={copyBlueprint}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white/[0.05] hover:bg-white/[0.09] text-zinc-200 border border-white/[0.10] rounded-xl text-xs font-semibold transition-colors shadow-sm"
              >
                {copiedIndex ? (
                  <>
                    <Check className="w-4 h-4 text-signal-ok" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-zinc-400" />
                    <span>Copy Blueprint</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-1.5">
                <span
                  title="Generation seed — the same ?seed= + goal always rebuilds the identical stack (§3.8)"
                  className="px-2 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.10] text-[10px] font-mono text-zinc-400 max-w-[160px] truncate"
                >
                  seed: {seed || '—'}
                </span>
                <button
                  onClick={rerollSeed}
                  title="New seed — resets reproducibility"
                  className="px-2 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.10] text-zinc-300 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => generateRandomStack()}
                  className="btn-primary px-4 py-2 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Shuffle className="w-4 h-4" />
                  <span>Shuffle Blueprint</span>
                </button>
              </div>
            </div>
          </div>

          {/* 5-Layer Complementary Pipeline Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 mb-6">
            {activeStack.components.map((comp, idx) => comp.repo ? (
              <div
                key={idx}
                className="bg-obs-surface hover:bg-obs-raised border border-white/[0.07] hover:border-white/25 rounded-xl p-4 transition-all flex flex-col justify-between group relative shadow-md"
              >
                <div className="absolute top-2 right-2 text-[10px] font-mono text-zinc-600 group-hover:text-zinc-300 font-bold">
                  0{idx + 1}
                </div>

                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-300 block mb-1">
                    {comp.role}
                  </span>
                  <h4 
                    onClick={() => onSelectRepo(comp.repo)}
                    className="text-sm font-bold text-zinc-100 hover:text-white transition-colors flex items-center justify-between gap-1 mb-1.5 cursor-pointer"
                  >
                    <span className="truncate">{comp.repo.name}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-white shrink-0" />
                  </h4>
                  <p className="text-[11px] text-zinc-400 line-clamp-3 leading-relaxed mb-3">
                    {comp.repo.beginner_intel?.what_it_does || comp.repo.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
                  <span className="font-mono text-signal-star font-medium">{comp.repo.stars.toLocaleString()}★</span>
                  <span className="text-zinc-400 bg-white/[0.05] px-1.5 py-0.5 rounded text-[10px]">{comp.repo.language}</span>
                </div>
              </div>
            ) : (
              <div key={idx} className="bg-obs-surface border border-dashed border-white/[0.14] rounded-xl p-4 flex flex-col justify-center items-center text-center min-h-[160px]">
                <AlertTriangle className="w-4 h-4 text-zinc-500 mb-2" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block mb-1">{comp.role}</span>
                <span className="text-[11px] text-zinc-500 leading-relaxed">No catalog candidate for this slot in the current build — left empty rather than guessed.</span>
              </div>
            ))}
          </div>

          {/* Architectural Synergies & Tradeoff Intelligence */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-obs-inset border border-white/[0.07] rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Rocket className="w-5 h-5 text-zinc-300 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-semibold text-white block mb-0.5">Why This Stack Works Together:</span>
                <span className="text-zinc-300 leading-relaxed text-[11px]">{activeStack.template.whyItWorks}</span>
              </div>
            </div>

            <div className="flex items-start gap-3 border-t md:border-t-0 md:border-l border-white/[0.06] pt-3 md:pt-0 md:pl-4">
              <SlidersHorizontal className="w-5 h-5 text-signal-star shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-semibold text-white block mb-0.5">Engineering Tradeoffs &amp; Latency:</span>
                <span className="text-zinc-300 leading-relaxed text-[11px]">{activeStack.template.tradeoffs}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
