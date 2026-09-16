import React, { useState, useMemo } from 'react';
import { 
  Sparkles, Shuffle, ArrowRight, Layers, ExternalLink, 
  Database, Cpu, Globe, CheckCircle2, Shield, Rocket, Copy, Check
} from 'lucide-react';

export default function InspirationGenerator({ repos, onSelectRepo }) {
  const [activeStack, setActiveStack] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  // Categorize repos into architectural roles
  const categorized = useMemo(() => {
    return {
      storage: repos.filter(r => r.domain === "Databases & Storage" || (r.subsystem && r.subsystem.toLowerCase().includes("store"))),
      ai: repos.filter(r => r.domain === "AI & Machine Learning"),
      backend: repos.filter(r => r.domain === "Web Platforms & Frameworks" || r.domain === "Networking & Distributed Systems"),
      frontend: repos.filter(r => (r.subsystem && r.subsystem.includes("UI")) || r.language === "TypeScript" || r.language === "JavaScript"),
      devtools: repos.filter(r => r.domain === "Developer Tooling & Compilers" || r.domain === "Cloud & Infrastructure")
    };
  }, [repos]);

  // Curated inspiration themes with dynamic randomized pairing
  const ARCHITECTURE_TEMPLATES = [
    {
      id: "ai-rag-analytics",
      title: "Real-Time AI Semantic Document & Analytics Engine",
      tagline: "Build a self-hosted private Perplexity or enterprise search that queries millions of PDFs and metrics at sub-second speed.",
      role1: { label: "Vector & Embedding Store", category: "storage" },
      role2: { label: "Local Inference Engine", category: "ai" },
      role3: { label: "High-Throughput API Gateway", category: "backend" },
      role4: { label: "Polished Accessible Dashboard", category: "frontend" },
      whyItWorks: "Pairs low-latency local inference with a specialized vector database to avoid expensive cloud API bills and prevent vendor data leaks."
    },
    {
      id: "local-first-observability",
      title: "Edge-First Telemetry & High-Density Log Analyzer",
      tagline: "Build a blazing fast developer log aggregator that processes 100M+ events on everyday laptop hardware.",
      role1: { label: "Columnar Storage Engine", category: "storage" },
      role2: { label: "Fast Linter & Static Checker", category: "devtools" },
      role3: { label: "Async Network API", category: "backend" },
      role4: { label: "Interactive Web UI", category: "frontend" },
      whyItWorks: "Vectorized columnar execution delivers 50x faster aggregations than traditional row-oriented relational databases."
    },
    {
      id: "autonomous-code-agent",
      title: "Autonomous Code-Generation & Refactoring Robot",
      tagline: "Build a self-improving developer assistant that writes unit tests, formats code, and patches CVE vulnerabilities.",
      role1: { label: "Agentic Reasoning & Tool Orchestration", category: "ai" },
      role2: { label: "Hyper-Fast Linter / AST Parser", category: "devtools" },
      role3: { label: "Local Open LLM Server", category: "ai" },
      role4: { label: "Modern Developer Interface", category: "frontend" },
      whyItWorks: "Combines an agentic feedback loop with high-speed compilation tooling to verify code correctness automatically before submitting PRs."
    },
    {
      id: "zero-trust-cloud-gateway",
      title: "Zero-Trust Cloud Mesh & Distributed Secrets Vault",
      tagline: "Deploy a modern microservices reverse proxy with automated TLS encryption and role-based identity verification.",
      role1: { label: "Dynamic Cloud Reverse Proxy", category: "devtools" },
      role2: { label: "Declarative Infrastructure as Code", category: "devtools" },
      role3: { label: "Distributed Consensus / State", category: "storage" },
      role4: { label: "Realtime API Layer", category: "backend" },
      whyItWorks: "Eliminates hardcoded credentials and manual routing configs by synchronizing infrastructure state declaratively."
    }
  ];

  const generateRandomStack = () => {
    const template = ARCHITECTURE_TEMPLATES[Math.floor(Math.random() * ARCHITECTURE_TEMPLATES.length)];

    const getRandomItem = (category, fallback) => {
      const list = categorized[category] || [];
      if (list.length === 0) return fallback || repos[0];
      return list[Math.floor(Math.random() * list.length)];
    };

    const comp1 = getRandomItem(template.role1.category);
    const comp2 = getRandomItem(template.role2.category);
    const comp3 = getRandomItem(template.role3.category);
    const comp4 = getRandomItem(template.role4.category);

    setActiveStack({
      template,
      components: [
        { role: template.role1.label, repo: comp1 },
        { role: template.role2.label, repo: comp2 },
        { role: template.role3.label, repo: comp3 },
        { role: template.role4.label, repo: comp4 }
      ]
    });
  };

  const copyBlueprint = () => {
    if (!activeStack) return;
    const text = `🚀 Project Idea: ${activeStack.template.title}\n${activeStack.template.tagline}\n\nArchitecture Blueprint:\n` +
      activeStack.components.map(c => `• ${c.role}: ${c.repo.owner}/${c.repo.name} (${c.repo.url})`).join('\n') +
      `\n\nWhy this stack works:\n${activeStack.template.whyItWorks}`;
    navigator.clipboard.writeText(text);
    setCopiedIndex(true);
    setTimeout(() => setCopiedIndex(false), 2000);
  };

  // Initial trigger
  if (!activeStack && repos.length > 0) {
    generateRandomStack();
  }

  if (!activeStack) return null;

  return (
    <div className="bg-gradient-to-b from-[#141924] to-[#0d1117] border border-indigo-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Project Architecture Generator
            </span>
            <span className="text-xs text-slate-500">&bull;</span>
            <span className="text-xs text-slate-400">Randomized Complementary Stacks</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            {activeStack.template.title}
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            {activeStack.template.tagline}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={copyBlueprint}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors"
            title="Copy Blueprint"
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
            onClick={generateRandomStack}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Shuffle className="w-4 h-4" />
            <span>Generate New Stack</span>
          </button>
        </div>
      </div>

      {/* 4-Layer Architecture Pipeline Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {activeStack.components.map((comp, idx) => (
          <div
            key={idx}
            onClick={() => onSelectRepo(comp.repo)}
            className="bg-[#161b22] hover:bg-[#1c222e] border border-slate-800 hover:border-indigo-500/50 rounded-xl p-4 transition-all cursor-pointer flex flex-col justify-between group relative shadow-md"
          >
            <div>
              <div className="flex items-center justify-between text-[10px] text-indigo-400 uppercase tracking-wider font-semibold mb-2">
                <span>{comp.role}</span>
                <span className="text-slate-500">Layer {idx + 1}</span>
              </div>
              <h3 className="text-sm font-bold text-slate-100 group-hover:text-indigo-300 transition-colors flex items-center justify-between gap-1 mb-1">
                <span className="truncate">{comp.repo.name}</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-white shrink-0" />
              </h3>
              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-3">
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

      {/* Why This Stack Works Callout */}
      <div className="bg-[#0b0f17] border border-slate-800 rounded-xl p-4 flex items-start gap-3">
        <Rocket className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs">
          <span className="font-semibold text-white mr-1.5">Why This Stack Works Together:</span>
          <span className="text-slate-300 leading-relaxed">{activeStack.template.whyItWorks}</span>
        </div>
      </div>
    </div>
  );
}
