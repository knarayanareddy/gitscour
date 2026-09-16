import React, { useState, useMemo } from 'react';
import { 
  Sparkles, Shuffle, ArrowRight, Layers, ExternalLink, 
  Database, Cpu, Globe, CheckCircle2, Shield, Rocket, Copy, Check,
  Workflow, GitFork, Star, Terminal, Code2, SlidersHorizontal, BookOpen
} from 'lucide-react';

export default function InspirationGenerator({ repos, onSelectRepo }) {
  const [activeStack, setActiveStack] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [selectedGoal, setSelectedGoal] = useState('all');

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

  // Production-grade full-stack architecture templates with synergetic rationale
  const ARCHITECTURE_TEMPLATES = [
    {
      id: "ai-rag-analytics",
      goal: "ai",
      title: "Self-Hosted Multi-Modal RAG & Real-Time Semantic Engine",
      tagline: "Build a zero-cloud document intelligence engine that queries millions of PDFs, audio transcripts, and embeddings with sub-second vector search.",
      roles: [
        { label: "Vector & Embedding Store", category: "storage" },
        { label: "Local LLM / Embeddings Runtime", category: "ai" },
        { label: "High-Throughput Async Backend", category: "backend" },
        { label: "Reactive Dashboard & Canvas UI", category: "frontend" },
        { label: "Telemetry & Pipeline Orchestration", category: "devtools" }
      ],
      whyItWorks: "Bypasses recurring OpenAI token fees and eliminates cloud data privacy risks by running quantised models locally on Apple Silicon or CUDA, backed by an in-memory vector index.",
      tradeoffs: "Requires dedicated GPU memory for high concurrency; initial cold starts during model checkpoint loading.",
      starterCli: "npm create modern-rag@latest --template fullstack"
    },
    {
      id: "edge-observability",
      goal: "systems",
      title: "Edge-First Vectorized Telemetry & Distributed Tracing Engine",
      tagline: "Ingest and visualize 100M+ structured events and HTTP trace spans per second on a single commodity VPS.",
      roles: [
        { label: "Vectorized Columnar OLAP Engine", category: "storage" },
        { label: "High-Speed Async Proxy / Ingestion", category: "backend" },
        { label: "Zero-Copy Serialization Protocol", category: "devtools" },
        { label: "WebGL Real-Time Flamegraph UI", category: "frontend" },
        { label: "Secrets Vault & Node Attestation", category: "security" }
      ],
      whyItWorks: "Columnar compression (Parquet/Arrow) achieves up to 10:1 compression ratio over raw JSON logs while enabling SIMD-accelerated aggregations across millions of rows in milliseconds.",
      tradeoffs: "High-throughput append buffering means trace spans have a 500ms micro-batching visibility window.",
      starterCli: "curl -fsSL https://get.gitscour.dev/telemetry | sh"
    },
    {
      id: "autonomous-coding-agent",
      goal: "ai",
      title: "Autonomous Developer Swarm & Continuous AST Refactoring Engine",
      tagline: "Deploy a team of collaborative AI workers that ingest git issues, reproduce bugs via Docker sandboxes, and synthesize green PRs.",
      roles: [
        { label: "Agentic Tool Orchestration & Multi-Turn", category: "ai" },
        { label: "Hyper-Fast Linter & AST Transformer", category: "devtools" },
        { label: "Ephemeral Sandbox & Container Manager", category: "devtools" },
        { label: "Developer Kanban & Diff Inspector", category: "frontend" },
        { label: "Static Code Vulnerability Scanner", category: "security" }
      ],
      whyItWorks: "Pairs tree-sitter AST parsing with iterative LLM generation. When the syntax parser detects a semantic error, it loops back to the agent with exact line errors without burning human engineer time.",
      tradeoffs: "Non-deterministic PR generation requires strict automated test suites before running auto-merge.",
      starterCli: "npx agent-swarm-init --preset refactor"
    },
    {
      id: "zero-trust-microservices",
      goal: "security",
      title: "Zero-Trust Mesh & Declarative Distributed Microservices",
      tagline: "Deploy modern multi-cloud microservices with automated mTLS identity certificates and eBPF wire-speed routing.",
      roles: [
        { label: "Dynamic Cloud Gateway / Envoy Mesh", category: "backend" },
        { label: "Distributed Consensus / KV State", category: "storage" },
        { label: "mTLS Identity & Certificate Authority", category: "security" },
        { label: "Declarative Infrastructure as Code", category: "devtools" },
        { label: "Cluster Observability Dashboard", category: "frontend" }
      ],
      whyItWorks: "Eliminates hardcoded secrets and manual firewall rules by relying on cryptographic SPIFFE/SPIRE IDs embedded in every mutual TLS packet.",
      tradeoffs: "Steeper architectural onboarding curve and small CPU overhead from ubiquitous packet encryption.",
      starterCli: "brew install mesh-ctl && mesh-ctl init"
    }
  ];

  const generateRandomStack = (forcedTemplate = null) => {
    let pool = ARCHITECTURE_TEMPLATES;
    if (selectedGoal !== 'all') {
      pool = ARCHITECTURE_TEMPLATES.filter(t => t.goal === selectedGoal);
      if (pool.length === 0) pool = ARCHITECTURE_TEMPLATES;
    }

    const template = forcedTemplate || pool[Math.floor(Math.random() * pool.length)];

    const getRandomItem = (category, fallback) => {
      const list = categorized[category] || [];
      if (list.length === 0) return fallback || repos[0];
      return list[Math.floor(Math.random() * list.length)];
    };

    const components = template.roles.map(r => ({
      role: r.label,
      repo: getRandomItem(r.category)
    }));

    setActiveStack({ template, components });
  };

  const copyBlueprint = () => {
    if (!activeStack) return;
    const text = `🚀 Project Blueprint: ${activeStack.template.title}\n${activeStack.template.tagline}\n\nArchitecture Stack:\n` +
      activeStack.components.map(c => `• ${c.role}: ${c.repo.owner}/${c.repo.name} (${c.repo.url})`).join('\n') +
      `\n\nWhy this stack works:\n${activeStack.template.whyItWorks}\n\nArchitectural Tradeoffs:\n${activeStack.template.tradeoffs}`;
    navigator.clipboard.writeText(text);
    setCopiedIndex(true);
    setTimeout(() => setCopiedIndex(false), 2000);
  };

  if (!activeStack && repos.length > 0) {
    generateRandomStack();
  }

  if (!activeStack) return null;

  return (
    <div className="bg-gradient-to-b from-[#141924] via-[#0d1117] to-[#0a0d14] border border-indigo-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Synergetic Tech Stack Architect
            </span>
            <span className="text-xs text-slate-500">&bull;</span>
            <span className="text-xs text-slate-400">Pairing complementary tools across 51,000+ repositories</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {activeStack.template.title}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
            {activeStack.template.tagline}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <div className="bg-[#161b22] border border-slate-800 rounded-xl p-1 flex items-center text-xs">
            {['all', 'ai', 'systems', 'security'].map(g => (
              <button
                key={g}
                onClick={() => {
                  setSelectedGoal(g);
                  const matching = ARCHITECTURE_TEMPLATES.find(t => g === 'all' || t.goal === g);
                  if (matching) generateRandomStack(matching);
                }}
                className={`px-2.5 py-1 rounded-lg capitalize font-medium transition-colors ${
                  selectedGoal === g ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <button
            onClick={copyBlueprint}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors shadow-sm"
          >
            {copiedIndex ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-400" />
                <span>Copy Blueprint</span>
              </>
            )}
          </button>

          <button
            onClick={() => generateRandomStack()}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Shuffle className="w-4 h-4" />
            <span>Generate New Stack</span>
          </button>
        </div>
      </div>

      {/* 5-Layer Complementary Pipeline Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 mb-6">
        {activeStack.components.map((comp, idx) => (
          <div
            key={idx}
            onClick={() => onSelectRepo(comp.repo)}
            className="bg-[#161b22] hover:bg-[#1a212d] border border-slate-800 hover:border-indigo-500/50 rounded-xl p-4 transition-all cursor-pointer flex flex-col justify-between group relative shadow-md"
          >
            <div className="absolute top-2 right-2 text-[10px] font-mono text-slate-600 group-hover:text-indigo-400 font-bold">
              0{idx + 1}
            </div>

            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400 block mb-1">
                {comp.role}
              </span>
              <h3 className="text-sm font-bold text-slate-100 group-hover:text-indigo-300 transition-colors flex items-center justify-between gap-1 mb-1.5">
                <span className="truncate">{comp.repo.name}</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-white shrink-0" />
              </h3>
              <p className="text-[11px] text-slate-400 line-clamp-3 leading-relaxed mb-3">
                {comp.repo.beginner_intel?.what_it_does || comp.repo.description}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="font-mono text-amber-400 font-medium">{comp.repo.stars.toLocaleString()}★</span>
              <span className="text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">{comp.repo.language}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Architectural Synergies & Tradeoff Intelligence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#0b0f17] border border-slate-800/90 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Rocket className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-semibold text-white block mb-0.5">Why This Stack Works Together:</span>
            <span className="text-slate-300 leading-relaxed text-[11px]">{activeStack.template.whyItWorks}</span>
          </div>
        </div>

        <div className="flex items-start gap-3 border-t md:border-t-0 md:border-l border-slate-800/80 pt-3 md:pt-0 md:pl-4">
          <SlidersHorizontal className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-semibold text-white block mb-0.5">Engineering Tradeoffs & Latency:</span>
            <span className="text-slate-300 leading-relaxed text-[11px]">{activeStack.template.tradeoffs}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
