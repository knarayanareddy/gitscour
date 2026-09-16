import json
from taxonomy_engine import enrich_repository_record

# High-profile, diverse repositories >500 stars across all major domains and subsystems
SEEDS = [
    # Databases & Storage
    {
        "id": 1001,
        "name": "cockroach",
        "owner": "cockroachdb",
        "description": "CockroachDB - the open source, cloud-native distributed SQL database.",
        "stars": 30500,
        "forks": 3800,
        "language": "Go",
        "license": "BSL-1.1",
        "topics": ["sql", "distributed-database", "acid", "raft", "database", "spanner"],
        "pushed_at": "2026-09-12T10:00:00Z"
    },
    {
        "id": 1002,
        "name": "duckdb",
        "owner": "duckdb",
        "description": "DuckDB is an in-process SQL OLAP database management system",
        "stars": 26400,
        "forks": 2100,
        "language": "C++",
        "license": "MIT",
        "topics": ["olap", "sql", "columnar", "parquet", "database", "in-memory"],
        "pushed_at": "2026-09-14T14:30:00Z"
    },
    {
        "id": 1003,
        "name": "qdrant",
        "owner": "qdrant",
        "description": "Qdrant - High-performance, massive-scale Vector Database and Vector Search Engine written in Rust",
        "stars": 22300,
        "forks": 1600,
        "language": "Rust",
        "license": "Apache-2.0",
        "topics": ["vector-search", "vector-database", "embeddings", "hnsw", "approximate-nearest-neighbor", "rust"],
        "pushed_at": "2026-09-15T09:12:00Z"
    },
    {
        "id": 1004,
        "name": "milvus",
        "owner": "milvus-io",
        "description": "A cloud-native vector database, storage for next-generation AI applications",
        "stars": 32100,
        "forks": 3100,
        "language": "Go",
        "license": "Apache-2.0",
        "topics": ["vector-database", "vector-search", "ai", "embeddings", "faiss"],
        "pushed_at": "2026-09-11T18:40:00Z"
    },
    {
        "id": 1005,
        "name": "dragonfly",
        "owner": "dragonflydb",
        "description": "A modern replacement for Redis and Memcached, modern multi-threaded in-memory key-value store",
        "stars": 25800,
        "forks": 1200,
        "language": "C++",
        "license": "BSL-1.1",
        "topics": ["redis", "memcached", "key-value", "in-memory", "cache"],
        "pushed_at": "2026-09-13T16:00:00Z"
    },
    {
        "id": 1006,
        "name": "clickhouse",
        "owner": "ClickHouse",
        "description": "ClickHouse is a fast open-source column-oriented database management system",
        "stars": 41200,
        "forks": 6900,
        "language": "C++",
        "license": "Apache-2.0",
        "topics": ["clickhouse", "olap", "columnar", "big-data", "analytics-database", "sql"],
        "pushed_at": "2026-09-15T22:00:00Z"
    },
    {
        "id": 1007,
        "name": "rocksdb",
        "owner": "facebook",
        "description": "A persistent key-value store for fast storage environments",
        "stars": 29400,
        "forks": 6200,
        "language": "C++",
        "license": "Apache-2.0",
        "topics": ["storage-engine", "lsm-tree", "key-value", "embedded-db"],
        "pushed_at": "2026-09-08T11:00:00Z"
    },

    # AI & Machine Learning
    {
        "id": 2001,
        "name": "vllm",
        "owner": "vllm-project",
        "description": "A high-throughput and memory-efficient inference and serving engine for LLMs",
        "stars": 34800,
        "forks": 5100,
        "language": "Python",
        "license": "Apache-2.0",
        "topics": ["llm", "llm-inference", "serving", "pagedattention", "cuda", "model-serving"],
        "pushed_at": "2026-09-15T20:10:00Z"
    },
    {
        "id": 2002,
        "name": "llama.cpp",
        "owner": "ggerganov",
        "description": "LLM inference in C/C++ with zero dependencies",
        "stars": 72500,
        "forks": 10400,
        "language": "C++",
        "license": "MIT",
        "topics": ["llm", "llm-inference", "gguf", "transformer", "c-plus-plus"],
        "pushed_at": "2026-09-16T08:00:00Z"
    },
    {
        "id": 2003,
        "name": "ollama",
        "owner": "ollama",
        "description": "Get up and running with Llama 3.3, Mistral, Gemma 2, and other large language models.",
        "stars": 108000,
        "forks": 9200,
        "language": "Go",
        "license": "MIT",
        "topics": ["llm", "model-serving", "inference-engine", "llama", "local-ai"],
        "pushed_at": "2026-09-16T01:15:00Z"
    },
    {
        "id": 2004,
        "name": "langchain",
        "owner": "langchain-ai",
        "description": "Build context-aware reasoning applications with LLMs and agents",
        "stars": 98500,
        "forks": 16200,
        "language": "Python",
        "license": "MIT",
        "topics": ["langchain", "agents", "llm", "agentic", "rag"],
        "pushed_at": "2026-09-15T19:30:00Z"
    },
    {
        "id": 2005,
        "name": "whisper",
        "owner": "openai",
        "description": "Robust Speech Recognition via Large-Scale Weak Supervision",
        "stars": 71800,
        "forks": 8400,
        "language": "Python",
        "license": "MIT",
        "topics": ["speech-to-text", "whisper", "nlp", "audio-processing", "transformer"],
        "pushed_at": "2026-08-30T12:00:00Z"
    },
    {
        "id": 2006,
        "name": "deepspeed",
        "owner": "microsoft",
        "description": "DeepSpeed is a deep learning optimization library that makes distributed training and inference easy, efficient, and effective.",
        "stars": 36100,
        "forks": 4200,
        "language": "Python",
        "license": "Apache-2.0",
        "topics": ["distributed-training", "fine-tuning", "deep-learning", "pytorch", "megatron"],
        "pushed_at": "2026-09-14T15:20:00Z"
    },

    # Cloud & Infrastructure
    {
        "id": 3001,
        "name": "kubernetes",
        "owner": "kubernetes",
        "description": "Production-Grade Container Scheduling and Management",
        "stars": 113000,
        "forks": 39500,
        "language": "Go",
        "license": "Apache-2.0",
        "topics": ["kubernetes", "k8s", "containerd", "orchestration", "cloud-native"],
        "pushed_at": "2026-09-16T06:00:00Z"
    },
    {
        "id": 3002,
        "name": "opentofu",
        "owner": "opentofu",
        "description": "OpenTofu lets you declaratively manage your cloud infrastructure using Infrastructure as Code (IaC).",
        "stars": 24100,
        "forks": 1100,
        "language": "Go",
        "license": "MPL-2.0",
        "topics": ["opentofu", "terraform", "iac", "infrastructure", "cloud"],
        "pushed_at": "2026-09-15T11:45:00Z"
    },
    {
        "id": 3003,
        "name": "envoy",
        "owner": "envoyproxy",
        "description": "Cloud-native high-performance edge/middle/service proxy",
        "stars": 30200,
        "forks": 4700,
        "language": "C++",
        "license": "Apache-2.0",
        "topics": ["service-mesh", "api-gateway", "reverse-proxy", "envoy", "load-balancer"],
        "pushed_at": "2026-09-16T04:20:00Z"
    },
    {
        "id": 3004,
        "name": "prometheus",
        "owner": "prometheus",
        "description": "The Prometheus monitoring system and time series database.",
        "stars": 56900,
        "forks": 9100,
        "language": "Go",
        "license": "Apache-2.0",
        "topics": ["prometheus", "metrics", "observability", "timeseries", "monitoring"],
        "pushed_at": "2026-09-15T14:10:00Z"
    },
    {
        "id": 3005,
        "name": "traefik",
        "owner": "traefik",
        "description": "The Cloud Native Application Proxy",
        "stars": 52100,
        "forks": 5100,
        "language": "Go",
        "license": "MIT",
        "topics": ["traefik", "reverse-proxy", "api-gateway", "docker", "load-balancer"],
        "pushed_at": "2026-09-15T13:00:00Z"
    },

    # Security & Cryptography
    {
        "id": 4001,
        "name": "vault",
        "owner": "hashicorp",
        "description": "A tool for secrets management, encryption as a service, and privileged access management",
        "stars": 31200,
        "forks": 4200,
        "language": "Go",
        "license": "BSL-1.1",
        "topics": ["vault", "secrets-management", "security", "encryption-at-rest", "pki"],
        "pushed_at": "2026-09-14T17:00:00Z"
    },
    {
        "id": 4002,
        "name": "keycloak",
        "owner": "keycloak",
        "description": "Open Source Identity and Access Management for Modern Applications and Services",
        "stars": 24900,
        "forks": 6800,
        "language": "Java",
        "license": "Apache-2.0",
        "topics": ["auth", "authentication", "oidc", "oauth2", "sso", "identity-provider"],
        "pushed_at": "2026-09-15T21:00:00Z"
    },
    {
        "id": 4003,
        "name": "trivy",
        "owner": "aquasecurity",
        "description": "Find vulnerabilities, misconfigurations, secrets, SBOM in containers, Kubernetes, code repositories, clouds and more",
        "stars": 24300,
        "forks": 2400,
        "language": "Go",
        "license": "Apache-2.0",
        "topics": ["security-scanner", "vulnerability-scanner", "cve", "static-analysis", "sbom"],
        "pushed_at": "2026-09-15T16:30:00Z"
    },
    {
        "id": 4004,
        "name": "wireguard-go",
        "owner": "WireGuard",
        "description": "Go Implementation of WireGuard secure network tunnel",
        "stars": 5400,
        "forks": 1200,
        "language": "Go",
        "license": "MIT",
        "topics": ["cryptography", "wireguard", "vpn", "tunnel", "security"],
        "pushed_at": "2026-09-02T10:00:00Z"
    },

    # Developer Tooling & Compilers
    {
        "id": 5001,
        "name": "ruff",
        "owner": "astral-sh",
        "description": "An extremely fast Python linter and code formatter, written in Rust.",
        "stars": 36700,
        "forks": 1400,
        "language": "Rust",
        "license": "MIT",
        "topics": ["linter", "code-formatter", "rust", "python", "static-analysis"],
        "pushed_at": "2026-09-16T07:15:00Z"
    },
    {
        "id": 5002,
        "name": "vite",
        "owner": "vitejs",
        "description": "Next generation frontend tooling. It's fast!",
        "stars": 71900,
        "forks": 6300,
        "language": "TypeScript",
        "license": "MIT",
        "topics": ["bundler", "build-system", "vite", "esbuild", "frontend"],
        "pushed_at": "2026-09-15T18:00:00Z"
    },
    {
        "id": 5003,
        "name": "playwright",
        "owner": "microsoft",
        "description": "Playwright is a framework for Web Testing and Automation. It allows testing Chromium, Firefox and WebKit with a single API.",
        "stars": 69400,
        "forks": 4100,
        "language": "TypeScript",
        "license": "Apache-2.0",
        "topics": ["testing", "e2e-testing", "automation", "browser", "headless"],
        "pushed_at": "2026-09-16T03:00:00Z"
    },
    {
        "id": 5004,
        "name": "wasmtime",
        "owner": "bytecodealliance",
        "description": "A fast and secure runtime for WebAssembly and WASI",
        "stars": 15800,
        "forks": 1400,
        "language": "Rust",
        "license": "Apache-2.0",
        "topics": ["webassembly", "runtime", "virtual-machine", "wasi", "jit", "compiler"],
        "pushed_at": "2026-09-15T15:00:00Z"
    },

    # Web Platforms & Frameworks
    {
        "id": 6001,
        "name": "next.js",
        "owner": "vercel",
        "description": "The React Framework for the Web",
        "stars": 128500,
        "forks": 27100,
        "language": "JavaScript",
        "license": "MIT",
        "topics": ["react", "ssr", "fullstack", "nextjs", "web-framework"],
        "pushed_at": "2026-09-16T06:40:00Z"
    },
    {
        "id": 6002,
        "name": "fastapi",
        "owner": "fastapi",
        "description": "FastAPI framework, high performance, easy to learn, fast to code, ready for production",
        "stars": 79400,
        "forks": 7200,
        "language": "Python",
        "license": "MIT",
        "topics": ["fastapi", "rest-api", "asyncio", "pydantic", "web-framework"],
        "pushed_at": "2026-09-14T20:00:00Z"
    },
    {
        "id": 6003,
        "name": "shadcn-ui",
        "owner": "shadcn-ui",
        "description": "Beautifully designed components that you can copy and paste into your apps. Accessible. Customizable. Open Source.",
        "stars": 76800,
        "forks": 6500,
        "language": "TypeScript",
        "license": "MIT",
        "topics": ["ui-library", "component-library", "tailwind", "radix-ui", "design-system"],
        "pushed_at": "2026-09-15T22:30:00Z"
    },

    # Curated Lists & Resources (Tested to verify artifact classification separation)
    {
        "id": 7001,
        "name": "awesome-python",
        "owner": "vinta",
        "description": "An opinionated list of awesome Python frameworks, libraries, software and resources.",
        "stars": 224000,
        "forks": 25200,
        "language": "Python",
        "license": "CC0-1.0",
        "topics": ["awesome", "awesome-list", "python", "curated-list"],
        "pushed_at": "2026-09-10T12:00:00Z"
    },
    {
        "id": 7002,
        "name": "developer-roadmap",
        "owner": "kamranahmedse",
        "description": "Interactive roadmaps, guides and other educational content to help developers grow in their careers.",
        "stars": 305000,
        "forks": 39500,
        "language": "TypeScript",
        "license": "CC-BY-NC-SA-4.0",
        "topics": ["roadmap", "education", "developer-guide", "cheatsheet"],
        "pushed_at": "2026-09-15T11:00:00Z"
    }
]

def generate_dataset():
    enriched = [enrich_repository_record(r) for r in SEEDS]
    
    # Write to web app public directory
    output_path = "web/public/repos.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(enriched, f, indent=2)
    print(f"Generated {len(enriched)} enriched seed repos at {output_path}")

    # Print distribution stats
    domains = {}
    artifacts = {}
    subsystems = {}
    for r in enriched:
        domains[r["domain"]] = domains.get(r["domain"], 0) + 1
        artifacts[r["artifact"]] = artifacts.get(r["artifact"], 0) + 1
        sub = f"{r['domain']} -> {r['subsystem']}"
        subsystems[sub] = subsystems.get(sub, 0) + 1

    print("\n--- Classified Artifact Types ---")
    for a, count in artifacts.items():
        print(f"  {a}: {count}")

    print("\n--- Classified Domains ---")
    for d, count in domains.items():
        print(f"  {d}: {count}")

    print("\n--- Sample Subsystems ---")
    for s, count in list(subsystems.items())[:10]:
        print(f"  {s}: {count}")

if __name__ == "__main__":
    generate_dataset()
