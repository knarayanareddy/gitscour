# GitScour 🔭

> A high-performance, queriable knowledge base of GitHub repositories (>500 stars) categorized by domain, subsystem, and artifact distinction. Hosted 100% free on **GitHub Pages** with automated zero-maintenance CI/CD.

![GitScour Preview](https://img.shields.io/badge/Status-Live%20Preview-success?style=for-the-badge)
![Hosting Cost](https://img.shields.io/badge/Hosting%20Cost-%240.00%2Fmo-blue?style=for-the-badge)

---

## ⚡ Core Architecture

GitScour eliminates traditional backend database costs by combining static pre-indexing with in-browser query execution:

1. **Ingestion & Classification Pipeline (`pipeline/`):**
   * Deterministic taxonomy engine classifying repositories across 4 orthogonal dimensions:
     * **Artifact Type:** `System Engine`, `Library / SDK`, `Framework`, `Developer Tool / CLI`, `Curated List / Docs`.
     * **Domain / Genre:** `Databases & Storage`, `AI & Machine Learning`, `Cloud & Infrastructure`, `Security & Cryptography`, `Developer Tooling & Compilers`, `Web Platforms`.
     * **Architectural Subsystem:** `Vector Database`, `Distributed SQL Engine`, `LLM Inference & Serving`, `Service Mesh`, etc.
     * **Primary Language & Runtime**.
   * Filters out generic "awesome lists" and tutorials so users searching for systems software find actual codebases.

2. **Web Explorer & In-Browser SQL Studio (`web/`):**
   * **Explorer Mode:** Instant client-side faceted filtering across domains, subsystems, star thresholds, and languages.
   * **SQL Studio Mode:** WebAssembly SQL execution console allowing arbitrary queries (`SELECT`, `WHERE`, `ORDER BY`, `LIMIT`) with one-click CSV export.

3. **Zero-Maintenance Automation (`.github/workflows/`):**
   * `backfill_123k.yml` (monthly) enumerates the full >500★ universe, rebuilds the
     index and shards, verifies them, and opens a pull request with the result -- so a
     data refresh is reviewable instead of silently overwriting the deployed catalog.
   * `deploy.yml` (weekly + on push) deploys *exactly* the catalog committed to the
     branch after `verify_catalog.py` passes. It no longer harvests during the build:
     regenerating shards from a partial index during deploy is how the deployed Tier-2
     data could drift away from the repository.

---

## 🎨 Design System — Obsidian Dark

The UI is monochrome by design: depth comes from a four-step surface ladder and
1px white hairlines, never from colored fills, and every number is set in
monospace with tabular figures.

| Surface | Value | Used for |
| --- | --- | --- |
| `--obs-base` | `#07080a` | Page canvas, 3D canvas backdrop |
| `--obs-inset` | `#050608` | Inputs, code blocks, stat wells |
| `--obs-surface` | `#0c0e12` | Cards, panels, modal body |
| `--obs-raised` | `#101216` | Sticky bars, modal chrome, hover |
| `--obs-line` | `rgba(255,255,255,0.08)` | Hairline border (Tailwind `border` default) |
| `--obs-ink` | `#eceef2` | Primary text, inverted buttons |

There is no purple/indigo accent anywhere in the app, including the 3D galaxy —
domain hues are desaturated so clusters separate without glowing. Semantic
colors are reserved for state and muted to match (`signal.ok`, `signal.star`,
`signal.warn`, `signal.risk`, `signal.info`). Tokens live in
`web/src/index.css`; the Tailwind mirror (`bg-obs-*`, `text-obs-*`) is in
`web/tailwind.config.js`, and the full rationale is in
[`docs/AI_TOOLS_METHODOLOGY_BLUEPRINT.md`](docs/AI_TOOLS_METHODOLOGY_BLUEPRINT.md#visual-language-obsidian-dark-palette).

---

## 🚀 Quick Start

### 1. Run the Web Application Locally
```bash
cd web
npm install
npm run dev
```
Open `http://localhost:5173` to explore the catalog.

### 2. Run the Classification Pipeline (offline demo)
```bash
python3 pipeline/generate_seed.py
```
Enriches 16 curated seed records through the real taxonomy engine and writes them
to `pipeline/seed_demo.json` (gitignored). This is a self-contained demo — it
**never writes into `web/public/`**, so running it cannot clobber the live
catalog artifacts (`repos.json`, `catalog-index.json`, the shards) the way an
older version of this script did.

### 3. Fetch Repositories via GitHub GraphQL API
```bash
export GITHUB_TOKEN="your_pat_token"
python3 pipeline/ingest.py
```

### 4. Full backfill (enumerate every repo above a star threshold)

GitHub truncates *any* search query at 1,000 results, so a harvester that sweeps a
handful of star windows can never return more than ~1,000 records per window no
matter how deep it paginates. Closing a 70k-record gap requires partitioning the
star range instead of sampling it:

```bash
export GITHUB_TOKEN="your_pat_token"

# 1. Partition the star continuum into windows of <=1000 repos and harvest each
#    one concurrently, checkpointing so an interrupted run resumes where it left off.
python3 pipeline/harvest_enumerate.py --min-stars 500 \
  --output harvest/raw_repos.jsonl --manifest harvest/windows_done.jsonl

# 2. Merge into the live catalog, classify new rows through the taxonomy engine,
#    and regenerate Tier-1 index + Tier-2 domain shards from one source of truth.
python3 pipeline/rebuild_catalog.py --harvest harvest/raw_repos.jsonl

# 3. Gate the artefacts on internal consistency before committing.
python3 pipeline/verify_catalog.py
```

`reconcile_stale_rows.py` is an optional pass in front of `rebuild_catalog.py`: it
resolves catalog rows the sweep did not match, drops deleted / taken-down /
sub-threshold repos, and collapses renames so one project is never listed twice
under its old and new `owner/name`.

| Script | Role |
| --- | --- |
| `harvest_enumerate.py` | Window-partitioned GraphQL sweep; the only harvester that can exceed 1,000 records per query |
| `rebuild_catalog.py` | Single consolidation point for all four artefacts (`catalog-packed.json`, `catalog-index.json`, `repos.json`, `data/details/*.json`) |
| `verify_catalog.py` | Cross-artefact integrity gate (ids, encodings, star floor, shard coverage) |
| `reconcile_stale_rows.py` | Live re-validation of rows missing from the current universe |
| `harvest_scale.py`, `backfill_worker.py`, `scale_50k.py` | Earlier samplers, capped at ~1k records per window; retained as reference |
| `pack_index.py`, `shard_manager.py` | Superseded artefact writers kept for reference -- they each rebuild only *part* of the set, which is how the index and shards drifted apart |

> `scale_50k.py` re-derives ids with `abs(hash(url))`. Python salts string hashing per process, so re-running it rewrites every id in the catalog and breaks Tier-2 lookups; `rebuild_catalog.py` assigns stable ids inside JavaScript's exact-integer range instead.
