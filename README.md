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

3. **Zero-Maintenance Automation (`.github/workflows/deploy.yml`):**
   * Scheduled GitHub Action runs weekly to update star counts and ingest new repos that cross the 500★ threshold.
   * Compiles the static bundle and deploys directly to GitHub Pages.

---

## 🚀 Quick Start

### 1. Run the Web Application Locally
```bash
cd web
npm install
npm run dev
```
Open `http://localhost:5173` to explore the catalog.

### 2. Run the Classification Pipeline
```bash
python3 pipeline/generate_seed.py
```

### 3. Fetch Repositories via GitHub GraphQL API
```bash
export GITHUB_TOKEN="your_pat_token"
python3 pipeline/ingest.py
```
