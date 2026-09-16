# AI ToolScour — Blueprint & System Architecture Specification
## Multi-Agent Automated Ingestion, Cognitive Taxonomy, and Interactive 3D Spatial Exploration for AI Tools & Software

---

## 1. Executive Summary & Feasibility Assessment

### 1.1 Feasibility Under Current Methodology & Tech Stack
**Verdict:** **Yes, 100% viable.**  
The two-tier sharded architecture (`catalog-packed.json` + lazy-loaded domain shards) and client-side WebGL/Canvas rendering pipeline deployed in GitScour can be directly adapted for an **AI Tools & Software Explorer** ("AI ToolScour").

### 1.2 Core Metrics & Constraints
- **Hosting Cost**: **$0.00 / month forever** (100% static assets on GitHub Pages or Cloudflare Pages).
- **Target Scale**: **10,000 to 50,000+ AI software repositories, models, runtimes, agents, and developer tools**.
- **Search Latency**: **Sub-5ms** tokenized search in-browser across 50,000 records.
- **Initial Network Transfer**: **< 1.8 MB gzipped** for the complete AI directory index.
- **3D Spatial Performance**: **60 FPS** with Level-of-Detail (LOD) culling, spatial neighborhood traversal, and smooth fly-to camera physics.

---

## 2. Domain Taxonomy & Architectural Classification for AI Tools

Unlike generic GitHub repos, AI software requires a purpose-built taxonomy capturing **model weights availability, hardware acceleration, runtime frameworks, and license commerciality**.

### 2.1 The 10 AI Domain Sectors
1. **Foundation Models & Weights**
   - *Subsystems*: Dense LLMs, Mixture-of-Experts (MoE), Small Language Models (SLMs), Vision-Language Models (VLMs), Audio & Speech synthesis, Video & Diffusion models.
2. **Local Inference Engines & Model Serving**
   - *Subsystems*: Quantized C++ runtimes (`llama.cpp`), GPU-accelerated server engines (`vLLM`, `TGI`), Apple Silicon runtimes (`MLX`), ONNX runtimes, WebGPU/in-browser engines (`WebLLM`).
3. **Agentic Frameworks & Multi-Agent Swarms**
   - *Subsystems*: Orchestration runners (LangGraph, AutoGen, CrewAI), sandboxed code execution environments, tool/function call registries, MCP (Model Context Protocol) servers.
4. **Vector Databases, Embedding Indexes & Retrieval (RAG)**
   - *Subsystems*: Dedicated vector stores (Qdrant, Milvus, Chroma), embedded vector engines (DuckDB-vss, LanceDB, SQLite-vec), rerankers, semantic chunkers.
5. **Fine-Tuning, Pre-Training & Alignment**
   - *Subsystems*: Parameter-Efficient Fine-Tuning (LoRA/QLoRA), distributed pre-training (DeepSpeed, Megatron-LM), RLHF/DPO/PPO alignment runners, synthetic dataset generators.
6. **AI Developer Tooling, Observability & Evaluation**
   - *Subsystems*: Prompt evaluation & benchmarking frameworks, LLM trace telemetry (OpenTelemetry, Langfuse), synthetic test harness generators, guardrails & red-teaming validators.
7. **Autonomous Code Generation & IDE Intelligence**
   - *Subsystems*: Local copilot backends (Continue, Aider, Tabby), AST code transformers, terminal agents, automated PR refactorers.
8. **Synthetic Media, Audio & Creative AI**
   - *Subsystems*: Voice cloning / TTS (`CosyVoice`, `ChatTTS`), music synthesis, real-time avatar diffusion, ComfyUI nodes and workflows.
9. **Robotics, Embodied AI & World Models**
   - *Subsystems*: Robotic Transformer policies, spatial awareness, physics simulator bindings (MuJoCo, Isaac Gym), SLAM & vision navigation.
10. **Edge AI, Mobile & Embedded Runtimes**
    - *Subsystems*: Mobile on-device runtimes (Executorch, NCNN, TFLite), microcontroller neural engines, embedded camera vision.

---

## 3. Data Acquisition Strategy (Multi-Source Pipeline)

To capture all notable open-source AI tools with $\ge 500$ stars:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA ACQUISITION AGENTS                         │
├─────────────────────┬──────────────────────┬───────────────────────────┤
│ GitHub Search API   │ Hugging Face Hub API │ Curated Awesome-AI Trees  │
│ • topic:ai / llm    │ • Top GGUF / ONNX    │ • awesome-generative-ai   │
│ • stars:500..*      │ • Model runtimes     │ • awesome-ai-agents       │
│ • lang:Rust/C++/Py  │ • Spaces / Hub Tools │ • awesome-local-llms      │
└──────────┬──────────┴──────────┬───────────┴─────────────┬─────────────┘
           │                     │                         │
           ▼                     ▼                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 NORMALIZATION & DEDUPLICATION WORKER                   │
│   • Canonical URL matching (lowercase clean github.com/owner/repo)     │
│   • Minimum Stars Threshold Filter (Strictly ≥ 500 Stars)              │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      AI TAXONOMY INFERENCE ENGINE                      │
│   • Keyword & Topic Extractor (GGUF, CUDA, vLLM, RAG, MCP, LoRA)       │
│   • Hardware Accelerator Primitives (CUDA, ROCm, Metal, Vulkan, CPU)   │
│   • Commercial License Risk Analyzer (Permissive, Copyleft, Non-Comm)  │
│   • Plain-English ELI5 Cognitive Generator                             │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    TWO-TIER STORAGE & SHARD MANAGER                    │
│   Tier 1: catalog-packed.json (< 1.8 MB gzip) -> Fast Search & 3D Graph│
│   Tier 2: web/public/data/details/*.json -> On-Demand Deep Intelligence│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Multi-Agent Persona Architecture for Implementation

When deploying an AI agent to build this repository, instruct it to assume these five distinct personas:

### Agent 1: The AI Knowledge Harvester
- **Role**: Discovers, queries, and pulls metadata from GitHub GraphQL micro-star slices and Hugging Face spaces.
- **Responsibilities**:
  - Paginates queries with topic tags: `llm`, `diffusion`, `rag`, `agentic`, `inference`, `gguf`, `embeddings`, `synthetic-data`.
  - Normalizes fields: `stars`, `forks`, `weights_available` (bool), `quantization_formats` (GGUF, AWQ, EXL2, FP8), `accelerators` (CUDA, Metal, ROCm, WebGPU).

### Agent 2: The Cognitive Taxonomy & Intelligence Engine
- **Role**: Enriches each tool with newcomer-friendly explanations and engineering primitives.
- **Generated Metadata Schema per Record**:
  ```json
  {
    "id": 10482093,
    "name": "vllm",
    "owner": "vllm-project",
    "stars": 42000,
    "language": "Python",
    "domain": "Local Inference Engines & Model Serving",
    "subsystem": "High-Throughput GPU Server",
    "primitives": ["PagedAttention", "Continuous Batching", "FlashAttention", "Tensor Parallelism"],
    "accelerators": ["NVIDIA CUDA", "AMD ROCm", "AWS Inferentia"],
    "quantization": ["AWQ", "GPTQ", "FP8", "INT4"],
    "license_intel": {
      "tier": "Permissive",
      "commercial": "Commercially Permissive (Apache-2.0)",
      "risk": "Low"
    },
    "beginner_intel": {
      "what_it_does": "A high-speed serving engine that runs large language models like Llama 3 on your GPU servers up to 24x faster than standard PyTorch.",
      "why_it_matters": "Invented PagedAttention to eliminate GPU memory fragmentation, dramatically cutting down the cost to run enterprise AI APIs.",
      "when_to_use": "When deploying local LLM endpoints handling concurrent user traffic.",
      "alternatives": ["TGI (Text Generation Inference)", "Ollama", "llama.cpp", "TensorRT-LLM"]
    },
    "quickstart_code": "pip install vllm\nvllm serve meta-llama/Meta-Llama-3-8B-Instruct --port 8000"
  }
  ```

### Agent 3: The Data Engineering & Compact Sharder
- **Role**: Compresses and shards 50,000 records so static web hosting never slows down.
- **Design Rules**:
  - Encode strings into integer lookup tables: `domains`, `subsystems`, `languages`, `accelerators`, `quantization`.
  - Save `catalog-packed.json` containing flat integer arrays for the client:
    `[id, name, owner, stars, forks, lang_id, dom_id, sub_id, license, primitives_list, hook_summary]`
  - Save 10 detailed domain shards in `public/data/details/{domain-slug}.json` loaded only when a tool is clicked.

### Agent 4: The 3D Knowledge Galaxy Engineer
- **Role**: Delivers the visual experience with Three.js or HTML5 2D/3D Canvas.
- **Key Enhancements**:
  - **Dynamic Topologies**:
    1. *Domain Planetary Clusters*: Group tools into gravitational clusters by AI layer.
    2. *Galaxy Spiral*: Galactic arms sorted by inference vs. training vs. agents.
  - **Cosmic Parallax Atmosphere**: Dynamic starfield on the `#07080a` canvas, neutral radial vignette, and desaturated domain hues (~30% saturation) so clusters read as hue rather than neon.
  - **Smooth Fly-To Camera**: Smooth interpolation towards focused nodes.
  - **Neighborhood Semantic Graph**: Highlights bridges between compatible AI tech (e.g., Qdrant $\leftrightarrow$ Ollama $\leftrightarrow$ LangGraph).

### Agent 5: The Synergetic AI Tech Stack Architect
- **Role**: Pairs complementary AI tools into functional application stacks.
- **Example Generated Architecture Blueprints**:
  1. *Autonomous Local Voice Agent*: `whisper.cpp` (Audio Transcription) + `llama.cpp` (Local Reasoning) + `ChatTTS` (Speech Synthesis) + `FastAPI` (Backend).
  2. *Enterprise Private RAG*: `LanceDB` (Embedded Vector Storage) + `vLLM` (High-Throughput Inference) + `BGE-M3` (Reranking) + `Open-WebUI` (Frontend).
  3. *Autonomous Code Refactor Swarm*: `Aider` (AST Code Transformer) + `Ollama` (Local DeepSeek-Coder) + `Docker` (Ephemeral Sandbox).

---

## 5. Technology Stack Selection & File Hierarchy

### Recommended Stack
- **Frontend Framework**: React 18 + Vite (Clean, minimal footprint, < 250 KB JS bundle).
- **Styling**: Tailwind CSS (Dark-mode first, Obsidian-inspired monochrome theme — see *Visual Language* below).
- **Icons**: Lucide React.
- **Visualization**: Optimized Custom 3D Canvas Projection (60 FPS on all laptops and phones without Three.js bundle weight).
- **Deployment**: GitHub Pages (`gh-pages` / GitHub Actions).

### Visual Language: Obsidian Dark Palette
The interface is deliberately monochrome. Depth is expressed through a four-step
surface ladder and 1px white hairlines — never through colored fills — and the
only solid accent in the system is inverted ink (near-white on near-black).

| Token | Value | Role |
| --- | --- | --- |
| `--obs-base` | `#07080a` | Page canvas and 2D canvas backdrop |
| `--obs-inset` | `#050608` | Recessed wells: inputs, code blocks, stat grids |
| `--obs-surface` | `#0c0e12` | Cards, panels, modal body |
| `--obs-raised` | `#101216` | Sticky bars, modal chrome, hover state |
| `--obs-line` | `rgba(255,255,255,0.08)` | Hairline border (wired to Tailwind `borderColor.DEFAULT`, so a bare `border` is already correct) |
| `--obs-ink` | `#eceef2` | Primary text and inverted button fill |
| `--obs-muted` | `#8f949e` | Secondary text |
| `--obs-faint` | `#61656d` | Tertiary text and separators |

Tokens live in `web/src/index.css` (`:root`) and are mirrored as Tailwind
utilities (`bg-obs-*`, `text-obs-*`) in `web/tailwind.config.js`.

Design rules:
1. **No purple, indigo, or violet anywhere** — including the 3D canvas. Galaxy
   domain hues are desaturated (~30% saturation) so clusters separate by hue
   without emitting neon glow.
2. **Accents are achromatic.** Active/selected states use
   `bg-white/[0.08]` + `ring-1 ring-inset ring-white/[0.14]`; the single solid
   action style is `.btn-primary` (ink fill, base-colored label).
3. **Every number is monospace tabular.** Both the `.num` component class and the
   `font-mono` base rule set `font-variant-numeric: tabular-nums slashed-zero`
   with `font-feature-settings: "tnum" 1, "zero" 1`, so star/fork/score columns
   never shift width as values change.
4. **Semantic color is state, not decoration**, and is muted to match:
   `signal.ok #7fbf9b`, `signal.star #d8b26a`, `signal.warn #d0a06a`,
   `signal.risk #c98375`, `signal.info #8aa7c4`.

### Suggested Repository File Structure
```
ai-toolscour/
├── .github/
│   └── workflows/
│       ├── deploy.yml            # Automatic GitHub Pages deployment
│       └── refresh_cron.yml       # Weekly scheduled cron crawler
├── pipeline/
│   ├── taxonomy_ai.py            # AI domain & hardware taxonomy classifier
│   ├── harvest_ai_tools.py       # Multi-source scraper (GH GraphQL + HF API)
│   ├── shard_builder.py          # Pack index into Tier 1 + Tier 2 domain shards
│   └── generate_stacks.py        # Generates synergetic AI stack blueprints
├── web/
│   ├── public/
│   │   ├── catalog-packed.json   # Packed Tier 1 index (Sub-5ms search)
│   │   └── data/details/         # Domain shards (ai-inference.json, rag.json, etc.)
│   ├── src/
│   │   ├── App.jsx               # Main explorer UI with tokenized search & pills
│   │   ├── Graph3DExplorer.jsx   # 3D Galaxy Canvas with smooth fly-to camera
│   │   ├── AIStackArchitect.jsx  # Synergetic AI architecture stack generator
│   │   ├── ModelInspector.jsx    # Deep sheet with ELI5 explanation & CLI run
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
└── README.md
```

---

## 6. Implementation Checklist for the Target Agent

To replicate this exact build for AI tools, provide this markdown specification to the next agent and instruct it to execute the following phases:

1. **Phase 1: Pipeline Setup**
   - Implement `pipeline/taxonomy_ai.py` with the 10 AI domains and hardware accelerators.
   - Run `pipeline/harvest_ai_tools.py` targeting AI topic tags and Hugging Face repositories.
2. **Phase 2: Tiered Sharding**
   - Encode data into `catalog-packed.json` (under 2 MB compressed) and generate domain JSON shards in `web/public/data/details/`.
3. **Phase 3: Frontend Interface**
   - Implement `App.jsx` with tokenized search, min-stars slider, and domain pills.
   - Implement `Graph3DExplorer.jsx` with smooth fly-to camera, neighborhood inspection sidebar, and 3D search.
   - Implement `AIStackArchitect.jsx` with multi-layer AI pipeline generation.
4. **Phase 4: Build Verification & Deployment**
   - Run `npm run build` and ensure clean Vite bundle output.
   - Configure `.github/workflows/deploy.yml` for automated GitHub Pages hosting.

---

*Specification verified against GitScour production benchmarks (123,153 repositories verified live against the GitHub API, 1MB-7.8MB gzip index, sub-5ms search).*
