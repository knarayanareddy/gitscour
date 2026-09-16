import re
from typing import Dict, List, Any, Optional

# --- EXPANDED TAXONOMY DOMAINS & SUBSYSTEMS ---
TAXONOMY_RULES = {
    "Operating Systems & Low-Level": {
        "keywords": ["kernel", "operating-system", "os", "linux", "embedded", "firmware", "driver", "hardware", "cpu", "arm", "risc-v", "hypervisor", "virtualization", "system-programming"],
        "subsystems": {
            "Kernel & Core OS": ["kernel", "linux-kernel", "bootloader", "os-kernel", "monolithic-kernel", "microkernel"],
            "Embedded & IoT Firmware": ["firmware", "embedded", "arduino", "esp32", "microcontroller", "stm32", "rtos"],
            "Emulators & Hypervisors": ["emulator", "hypervisor", "virtualization", "qemu", "kvm", "game-engine"]
        }
    },
    "Databases & Storage": {
        "keywords": ["database", "datastore", "key-value", "relational", "sql", "nosql", "timeseries", "vector-db", "graph-database", "embedded-db", "sqlite", "postgres", "mysql", "redis", "mongodb", "cache", "storage"],
        "subsystems": {
            "Vector Database": ["vector-search", "vector-database", "embeddings", "approximate-nearest-neighbor", "ann", "faiss", "hnsw", "milvus", "qdrant", "weaviate", "chroma"],
            "Distributed SQL Engine": ["distributed-sql", "newsql", "spanner", "cockroachdb", "tidb", "yugabyte", "citus", "distributed-database"],
            "Key-Value & In-Memory Store": ["key-value", "redis", "memcached", "in-memory", "rocksdb", "leveldb", "badgerdb", "kv-store", "lsm-tree", "caching"],
            "Analytical & Columnar (OLAP)": ["olap", "columnar", "clickhouse", "duckdb", "data-warehouse", "parquet", "arrow", "analytics-database", "big-data", "hadoop", "spark"],
            "Time-Series Database": ["timeseries", "time-series", "influxdb", "timescaledb", "telemetry-db", "metrics-storage"],
            "Document & Graph Store": ["document-store", "mongodb", "graph-database", "neo4j", "rdf", "triplestore", "knowledge-graph"],
            "Storage Engine & Consensus": ["storage-engine", "raft", "paxos", "wal", "replication", "distributed-consensus", "etcd", "b-tree", "lsm"]
        }
    },
    "AI & Machine Learning": {
        "keywords": ["machine-learning", "deep-learning", "ai", "artificial-intelligence", "llm", "neural-network", "nlp", "computer-vision", "transformer", "pytorch", "tensorflow", "diffusion", "stable-diffusion", "generative-ai"],
        "subsystems": {
            "LLM Inference & Serving": ["llm-inference", "inference-engine", "vllm", "llama.cpp", "ollama", "tgi", "tensorrt", "model-serving", "onnxruntime", "gguf"],
            "Model Training & Fine-Tuning": ["fine-tuning", "lora", "qlora", "deepspeed", "megatron", "distributed-training", "gradient-descent", "pytorch-lightning", "axolotl", "training"],
            "Autonomous Agents & Workflows": ["agentic", "agents", "langchain", "llamaindex", "crewai", "autogen", "task-automation", "prompt-engineering", "function-calling", "agent"],
            "Computer Vision & Multimodal": ["computer-vision", "object-detection", "yolo", "segmentation", "diffusion", "stable-diffusion", "text-to-image", "ocr", "image-generation"],
            "MLOps & Model Registry": ["mlops", "model-registry", "experiment-tracking", "mlflow", "wandb", "feature-store", "data-versioning", "dvc"],
            "NLP & Speech Recognition": ["nlp", "whisper", "speech-to-text", "text-to-speech", "audio-processing", "embeddings", "tokenization", "huggingface", "tts"]
        }
    },
    "Cloud & Infrastructure": {
        "keywords": ["infrastructure", "cloud-native", "devops", "kubernetes", "container", "orchestration", "serverless", "iac", "monitoring", "docker", "terraform", "helm", "cloud"],
        "subsystems": {
            "Container Orchestration & Runtime": ["kubernetes", "k8s", "containerd", "docker", "cgroups", "podman", "mesos", "scheduler", "wasm-runtime", "containers"],
            "Infrastructure as Code (IaC)": ["terraform", "opentofu", "pulumi", "cloudformation", "ansible", "provisioning", "gitops", "argocd", "flux", "iac"],
            "Service Mesh & API Gateway": ["service-mesh", "api-gateway", "envoy", "istio", "traefik", "reverse-proxy", "load-balancer", "caddy", "nginx", "kong"],
            "Observability & Tracing": ["observability", "opentelemetry", "prometheus", "grafana", "tracing", "distributed-tracing", "jaeger", "metrics", "apm", "logging"],
            "Edge & Serverless Computing": ["serverless", "edge-computing", "lambda", "functions", "faas", "cloudflare-workers", "deno-deploy"]
        }
    },
    "Security & Cryptography": {
        "keywords": ["security", "cybersecurity", "cryptography", "infosec", "authentication", "authorization", "penetration-testing", "vulnerability", "auth", "oauth", "password", "crypto", "encryption", "hacking", "osint"],
        "subsystems": {
            "Zero Trust & Identity/Auth": ["auth", "authentication", "authorization", "oauth2", "oidc", "sso", "identity-provider", "keycloak", "rbac", "zero-trust", "jwt", "passwords"],
            "Secrets & Key Management": ["secrets-management", "vault", "kms", "encryption-at-rest", "pki", "certificates", "hsm"],
            "Vulnerability & Static Analysis": ["sast", "dast", "security-scanner", "vulnerability-scanner", "cve", "static-analysis", "trivy", "semgrep", "osint", "scanner"],
            "Cryptography & ZK Proofs": ["cryptography", "zero-knowledge", "zk-snark", "elliptic-curve", "post-quantum", "tls", "wireguard", "end-to-end-encryption"],
            "Penetration Testing & Red Team": ["red-team", "pentesting", "exploit", "reverse-engineering", "malware-analysis", "packet-sniffer", "metasploit", "wireshark", "payload"]
        }
    },
    "Developer Tooling & Compilers": {
        "keywords": ["developer-tools", "devtools", "compiler", "bundler", "transpiler", "linter", "formatter", "cli", "profiler", "debugger", "git", "terminal", "shell", "editor", "ide", "vim", "neovim", "testing"],
        "subsystems": {
            "Compilers & Runtimes": ["compiler", "interpreter", "llvm", "bytecode", "jit", "virtual-machine", "runtime", "v8", "webassembly", "rustc", "python", "golang"],
            "Bundlers & Build Systems": ["bundler", "build-system", "vite", "webpack", "turborepo", "bazel", "esbuild", "rollup", "package-manager", "npm", "cargo"],
            "Linters & Code Quality": ["linter", "code-formatter", "static-analysis", "eslint", "prettier", "biome", "ruff", "ast-parser"],
            "Testing & QA Automation": ["testing", "e2e-testing", "playwright", "cypress", "unit-testing", "fuzzing", "mocking", "benchmark", "test-framework"],
            "Terminal & Editor Utilities": ["cli", "terminal", "tui", "command-line", "shell", "shell-extension", "zsh", "prompt", "neovim", "vim", "tmux"]
        }
    },
    "Web Platforms & Frameworks": {
        "keywords": ["web-framework", "frontend", "backend", "fullstack", "react", "vue", "svelte", "http-server", "rest-api", "graphql", "javascript", "typescript", "html", "css", "nodejs", "web"],
        "subsystems": {
            "Full-Stack & SSR Frameworks": ["fullstack", "ssr", "nextjs", "remix", "nuxt", "sveltekit", "astro", "fastapi", "django", "express", "actix-web", "fiber", "rails", "spring-boot"],
            "UI Component Architecture": ["ui-library", "component-library", "design-system", "tailwind", "radix-ui", "shadcn", "css-in-js", "animation", "icons"],
            "API Architecture (GraphQL/gRPC)": ["graphql", "grpc", "trpc", "rest-api", "protobuf", "openapi", "websocket", "realtime-web", "api"],
            "State Management & Data Fetching": ["state-management", "redux", "zustand", "tanstack-query", "swr", "reactive", "signals"]
        }
    },
    "Education & Curated Learning": {
        "keywords": ["tutorial", "education", "roadmap", "curated-list", "cheatsheet", "interview", "computer-science", "learning", "algorithm", "books", "guide", "free-programming-books"],
        "subsystems": {
            "Learning Roadmaps & Study Plans": ["roadmap", "study-plan", "interview", "coding-interview", "guide", "career"],
            "Curated Resources & Awesome Lists": ["awesome", "awesome-list", "resources", "curated-list", "public-apis"],
            "Interactive Tutorials & Exercises": ["tutorial", "build-your-own", "project-based", "practice", "algorithms", "data-structures"]
        }
    },
    "Networking & Distributed Systems": {
        "keywords": ["networking", "distributed-systems", "p2p", "mesh", "protocol", "transport", "webrtc", "message-broker", "rpc", "bittorrent", "socket"],
        "subsystems": {
            "Event Streaming & Message Broker": ["message-broker", "event-driven", "kafka", "rabbitmq", "nats", "pulsar", "sqs", "pubsub"],
            "P2P & Decentralized Networking": ["peer-to-peer", "p2p", "bittorrent", "ipfs", "libp2p", "dht", "decentralized"],
            "Low-Level Protocols & Transports": ["tcp", "udp", "quic", "http3", "webrtc", "socket", "tun-tap", "ebpf", "packet-processing"]
        }
    }
}

CURATED_LIST_PATTERNS = [
    re.compile(r"^awesome-", re.IGNORECASE),
    re.compile(r"-awesome$", re.IGNORECASE),
    re.compile(r"\bawesome list\b", re.IGNORECASE),
    re.compile(r"\bcurated list\b", re.IGNORECASE),
    re.compile(r"\bresources list\b", re.IGNORECASE),
    re.compile(r"\bcheatsheet\b", re.IGNORECASE),
    re.compile(r"\broadmap\b", re.IGNORECASE),
    re.compile(r"\binterview-questions\b", re.IGNORECASE),
    re.compile(r"\bstudy plan\b", re.IGNORECASE),
    re.compile(r"\bbuild your own\b", re.IGNORECASE)
]

# --- ARCHITECTURAL PRIMITIVES LEXICON ---
PRIMITIVE_RULES = {
    "Zero-Copy": [r"\bzero-copy\b", r"\bzero copy\b", r"\bmmap\b", r"\bkernel bypass\b"],
    "SIMD / Vectorized": [r"\bsimd\b", r"\bvectorized\b", r"\bavx-?512\b", r"\bavx2\b", r"\bneon\b"],
    "WASM / WASI": [r"\bwasm\b", r"\bwebassembly\b", r"\bwasi\b"],
    "Raft Consensus": [r"\braft\b", r"\bpaxos\b", r"\bconsensus\b", r"\betcd\b"],
    "LSM-Tree / B-Tree": [r"\blsm\b", r"\blsm-tree\b", r"\bb-tree\b", r"\brocksdb\b", r"\bwal\b", r"\bwrite-ahead\b"],
    "eBPF / Kernel": [r"\bebpf\b", r"\bxdp\b", r"\bbpf\b", r"\bkernel module\b"],
    "CUDA / GPU Accelerated": [r"\bcuda\b", r"\bgpu\b", r"\btensorrt\b", r"\brocm\b", r"\bmetal\b"],
    "Lock-Free / Concurrency": [r"\block-free\b", r"\bconcurrency\b", r"\bthread-safe\b", r"\bchannel\b", r"\bactor model\b", r"\basync\b"],
    "HNSW / Vector Index": [r"\bhnsw\b", r"\bann\b", r"\bfaiss\b", r"\bivf\b", r"\bcosine similarity\b"],
    "Memory-Mapped / In-Memory": [r"\bin-memory\b", r"\bram\b", r"\bcache\b", r"\bmemcached\b", r"\bmcache\b"],
    "Columnar Storage": [r"\bcolumnar\b", r"\bparquet\b", r"\barrow\b", r"\bcolumn-oriented\b"],
    "AST / Parser Engine": [r"\bast\b", r"\bparser\b", r"\blexer\b", r"\btokeniz\b", r"\btree-sitter\b"],
    "Quantization (GGUF/GPTQ)": [r"\bgguf\b", r"\bquantiz\b", r"\bgptq\b", r"\bawq\b", r"\b4-bit\b", r"\b8-bit\b"]
}

# --- ECOSYSTEM & INTEROPERABILITY COMPATIBILITY LEXICON ---
COMPATIBILITY_RULES = {
    "PostgreSQL Compatible": [r"\bpostgres\b", r"\bpostgresql\b", r"\bpgwire\b", r"\bpg_dump\b"],
    "Redis Compatible": [r"\bredis\b", r"\bredis-cli\b", r"\bresp\b"],
    "Kubernetes Native": [r"\bkubernetes\b", r"\bk8s\b", r"\bhelm\b", r"\bcrd\b", r"\boperator\b"],
    "OpenTelemetry Native": [r"\bopentelemetry\b", r"\botel\b", r"\bjaeger\b", r"\btracing\b"],
    "Docker / OCI Compliant": [r"\bdocker\b", r"\boci\b", r"\bcontainerd\b"],
    "Prometheus Native": [r"\bprometheus\b", r"\bmetrics\b", r"\balertmanager\b"],
    "S3 API Compatible": [r"\bs3\b", r"\bminio\b", r"\bblob storage\b", r"\bobject storage\b"],
    "OpenAPI / REST": [r"\bopenapi\b", r"\bswagger\b", r"\brest\b", r"\brestful\b"],
    "gRPC / Protobuf": [r"\bgrpc\b", r"\bprotobuf\b", r"\bproto\b"],
    "GraphQL Native": [r"\bgraphql\b", r"\bapollo\b"],
    "OpenAI API Compatible": [r"\bopenai api\b", r"\bopenai-compatible\b", r"\bchat completions\b"]
}

# --- USE CASE SCENARIOS LEXICON ---
USECASE_RULES = {
    "Edge & Offline Computing": [r"\bedge\b", r"\boffline\b", r"\biot\b", r"\bembedded\b", r"\blocal-first\b"],
    "High-Throughput Analytics": [r"\banalytics\b", r"\bolap\b", r"\bbig data\b", r"\bthroughput\b", r"\bstreaming\b"],
    "Local LLM Inference": [r"\blocal ai\b", r"\blocal llm\b", r"\bself-hosted llm\b", r"\brun locally\b"],
    "Cloud Native Infrastructure": [r"\bcloud native\b", r"\bcloud-native\b", r"\bmulti-cloud\b", r"\bmicroservices\b"],
    "Autonomous Agent Systems": [r"\bagents\b", r"\bagentic\b", r"\bworkflow\b", r"\brag\b", r"\btool use\b"],
    "Zero Trust & Compliance": [r"\bzero trust\b", r"\bcompliance\b", r"\bsbom\b", r"\baudit\b", r"\bvulnerability\b"]
}

def classify_license_freedom(license_str: str) -> Dict[str, str]:
    """Classifies license risk and commercial usability."""
    lic = (license_str or "").upper()
    if any(p in lic for p in ["MIT", "APACHE-2.0", "APACHE 2.0", "BSD", "ISC", "CC0"]):
        return {
            "tier": "Permissive",
            "commercial": "Commercially Friendly",
            "desc": "Permissive license allowing proprietary commercial usage and modification without source redistribution."
        }
    elif any(p in lic for p in ["GPL", "AGPL", "LGPL", "MPL"]):
        return {
            "tier": "Copyleft",
            "commercial": "Source-Reciprocal (Caution)",
            "desc": "Copyleft license requiring derivative works or hosted modifications to make source available."
        }
    elif any(p in lic for p in ["BSL", "SSPL", "COMMERCIAL", "ELV2"]):
        return {
            "tier": "Fair-Core / Source-Available",
            "commercial": "Cloud Restriction",
            "desc": "Source-available license restricting competitive hosted cloud-service offerings."
        }
    return {
        "tier": "Unknown / Unspecified",
        "commercial": "Custom Terms",
        "desc": "Custom or unspecified license. Review the repository LICENSE file for explicit commercial terms."
    }

def classify_maturity(stars: int, forks: int, pushed_at: Optional[str]) -> Dict[str, str]:
    """Calculates battle-tested maturity rating."""
    if stars >= 50000:
        return {
            "rating": "Hyper-Scale / Industry Standard",
            "level": "tier-1",
            "desc": "Massively adopted across global technology industry."
        }
    elif stars >= 20000:
        return {
            "rating": "Production Battle-Tested",
            "level": "tier-2",
            "desc": "High ecosystem stability, active community, and proven production deployments."
        }
    elif stars >= 5000:
        return {
            "rating": "Rapid Growth / Emerging Core",
            "level": "tier-3",
            "desc": "Significant traction with expanding developer adoption."
        }
    else:
        return {
            "rating": "Promising / Specialized",
            "level": "tier-4",
            "desc": "Specialized utility or rising repository crossing high-star threshold."
        }

def match_lexicon_rules(text_corpus: str, rules_dict: Dict[str, List[str]], max_matches: int = 4) -> List[str]:
    """Extracts keywords matching predefined regex patterns."""
    matched = []
    for label, patterns in rules_dict.items():
        for pat in patterns:
            if re.search(pat, text_corpus, re.IGNORECASE):
                matched.append(label)
                break
        if len(matched) >= max_matches:
            break
    return matched

def classify_artifact(repo_name: str, description: str, topics: List[str]) -> str:
    """Classifies repository into artifact types to prevent curated lists from polluting code search."""
    full_text = f"{repo_name} {description} {' '.join(topics)}".lower()
    
    for pattern in CURATED_LIST_PATTERNS:
        if pattern.search(repo_name) or pattern.search(description):
            return "Curated List / Docs"
            
    if any(t in ["awesome", "awesome-list", "roadmap", "cheatsheet", "reading-list", "learning", "tutorial"] for t in topics):
        return "Curated List / Docs"

    if any(k in full_text for k in ["template", "boilerplate", "starter kit", "scaffold"]):
        return "Template / Starter"

    if any(k in full_text for k in ["cli", "terminal", "command line", "tui", "command-line tool"]):
        return "Developer Tool / CLI"

    if any(k in full_text for k in ["engine", "database server", "daemon", "server application", "service"]):
        return "System Service / Engine"

    if any(k in full_text for k in ["framework", "platform"]):
        return "Framework"

    if any(k in full_text for k in ["library", "sdk", "client", "driver", "package"]):
        return "Library / SDK"

    return "Application / Service"

def classify_domain_and_subsystem(repo_name: str, description: str, topics: List[str], language: Optional[str]) -> tuple:
    """
    Deterministically computes Primary Domain and Architectural Subsystem
    using multi-factor weighted heuristic scoring.
    """
    text_corpus = f"{repo_name} {description} {' '.join(topics)} {language or ''}".lower()
    topic_set = set(t.lower() for t in topics)

    best_domain = "Other / General"
    best_domain_score = 0
    best_subsystem = "General Components"

    for domain_name, domain_data in TAXONOMY_RULES.items():
        score = 0
        for kw in domain_data["keywords"]:
            if kw in topic_set:
                score += 3
            elif kw in text_corpus:
                score += 1
                
        if score > best_domain_score:
            best_domain_score = score
            best_domain = domain_name

    if best_domain in TAXONOMY_RULES:
        subsystems = TAXONOMY_RULES[best_domain]["subsystems"]
        best_sub_score = 0
        
        for sub_name, sub_keywords in subsystems.items():
            sub_score = 0
            for skw in sub_keywords:
                if skw in topic_set:
                    sub_score += 4
                elif skw in text_corpus:
                    sub_score += 1
            if sub_score > best_sub_score:
                best_sub_score = sub_score
                best_subsystem = sub_name

        if best_sub_score == 0:
            best_subsystem = f"General {best_domain.split('&')[0].strip()}"

    return best_domain, best_subsystem

def generate_beginner_context(name: str, domain: str, subsystem: str, language: str) -> Dict[str, Any]:
    """Generates intuitive contextual explanations for users discovering a project with zero background."""
    return {
        "what_it_does": f"A foundational {language} project in the {domain} ecosystem specialized for {subsystem}.",
        "why_it_matters": f"It solves complex {subsystem.lower()} challenges without requiring teams to reinvent low-level primitives.",
        "when_to_use": f"Use when your application demands reliable, high-performance {subsystem.lower()} with active community support.",
        "alternatives": ["Standard library solutions", "Cloud managed services", "Alternative open source engines"],
        "key_superpowers": ["High throughput", "Low resource overhead", "Battle-tested community stability"]
    }

def enrich_repository_record(raw_repo: Dict[str, Any]) -> Dict[str, Any]:
    name = raw_repo.get("name", "")
    owner = raw_repo.get("owner", {}).get("login") if isinstance(raw_repo.get("owner"), dict) else raw_repo.get("owner", "")
    description = raw_repo.get("description") or ""
    readme_snippet = raw_repo.get("readme_snippet") or ""
    topics = raw_repo.get("topics") or []
    language = raw_repo.get("language") or "Other"
    stars = int(raw_repo.get("stargazers_count") or raw_repo.get("stars") or 0)
    forks = int(raw_repo.get("forks_count") or raw_repo.get("forks") or 0)
    pushed_at = raw_repo.get("pushed_at") or raw_repo.get("updated_at")
    
    license_name = raw_repo.get("license")
    if isinstance(license_name, dict):
        license_name = license_name.get("spdx_id") or license_name.get("name")
    license_str = license_name or "Unknown"

    artifact = classify_artifact(name, description, topics)
    domain, subsystem = classify_domain_and_subsystem(name, description, topics, language)

    # Full text corpus including README snippet for deep keyword mining
    corpus = f"{name} {description} {readme_snippet} {' '.join(topics)} {language}".lower()

    # Deep enrichments
    primitives = match_lexicon_rules(corpus, PRIMITIVE_RULES)
    compatibility = match_lexicon_rules(corpus, COMPATIBILITY_RULES)
    usecases = match_lexicon_rules(corpus, USECASE_RULES)
    license_intel = classify_license_freedom(license_str)
    maturity_intel = classify_maturity(stars, forks, pushed_at)

    # Beginner context card
    beginner_intel = raw_repo.get("beginner_intel") or generate_beginner_context(name, domain, subsystem, language)

    # Consolidated high-signal keywords list for multi-facet indexing
    keywords = list(dict.fromkeys(
        [subsystem, artifact, domain] + primitives + compatibility + usecases + topics[:6]
    ))

    return {
        "id": raw_repo.get("id"),
        "name": name,
        "owner": owner,
        "full_name": f"{owner}/{name}" if owner else name,
        "description": description,
        "stars": stars,
        "forks": forks,
        "language": language,
        "license": license_str,
        "license_intel": license_intel,
        "artifact": artifact,
        "domain": domain,
        "subsystem": subsystem,
        "primitives": primitives,
        "compatibility": compatibility,
        "usecases": usecases,
        "maturity": maturity_intel,
        "beginner_intel": beginner_intel,
        "quickstart_code": raw_repo.get("quickstart_code") or f"git clone https://github.com/{owner}/{name}.git",
        "keywords": keywords,
        "topics": topics,
        "url": f"https://github.com/{owner}/{name}" if owner else f"https://github.com/{name}",
        "pushed_at": pushed_at
    }
