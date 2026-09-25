import re
from typing import Dict, List, Any, Optional

# --- EXPANDED TAXONOMY DOMAINS & SUBSYSTEMS ---
TAXONOMY_RULES = {
    "Operating Systems & Low-Level": {
        "keywords": ["kernel", "operating-system", "os", "linux", "embedded", "firmware", "driver", "hardware", "cpu", "arm", "risc-v", "hypervisor", "virtualization", "system-programming"],
        "strong": ["kernel", "operating-system", "embedded", "firmware", "hypervisor"],
        "subsystems": {
            "Kernel & Core OS": ["kernel", "linux-kernel", "bootloader", "os-kernel", "monolithic-kernel", "microkernel"],
            "Embedded & IoT Firmware": ["firmware", "embedded", "arduino", "esp32", "microcontroller", "stm32", "rtos"],
            "Emulators & Hypervisors": ["emulator", "hypervisor", "virtualization", "qemu", "kvm", "game-engine"]
        }
    },
    "Databases & Storage": {
        "keywords": ["database", "datastore", "key-value", "relational", "sql", "nosql", "timeseries", "vector-db", "vector-search", "vector-database", "graph-database", "embedded-db", "sqlite", "postgres", "postgresql", "mysql", "redis", "mongodb", "cache", "storage", "lakehouse", "big-data", "bigdata"],
        "strong": ["database", "datastore", "key-value", "nosql", "relational", "sql", "sqlite", "postgres", "postgresql", "mysql", "redis", "mongodb", "vector-db", "vector-search", "vector-database", "graph-database", "embedded-db", "lakehouse", "big-data", "bigdata"],
        "subsystems": {
            "Vector Database": ["vector-search", "vector-database", "vector", "embeddings", "approximate-nearest-neighbor", "ann", "faiss", "hnsw", "milvus", "qdrant", "weaviate", "chroma"],
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
        "strong": ["ai", "artificial-intelligence", "machine-learning", "deep-learning", "llm", "neural-network", "pytorch", "tensorflow", "nlp", "computer-vision", "diffusion", "stable-diffusion", "generative-ai"],
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
        "keywords": ["infrastructure", "cloud-native", "devops", "kubernetes", "container", "orchestration", "serverless", "iac", "monitoring", "docker", "terraform", "helm", "cloud", "observability", "web-server", "reverse-proxy", "load-balancer", "service-mesh", "aws", "azure", "gcp", "api-gateway"],
        "strong": ["infrastructure", "cloud-native", "devops", "kubernetes", "container", "orchestration", "serverless", "iac", "monitoring", "docker", "terraform", "helm", "cloud", "observability", "web-server", "reverse-proxy", "load-balancer", "service-mesh", "aws", "azure", "gcp", "api-gateway"],
        "subsystems": {
            "Container Orchestration & Runtime": ["kubernetes", "k8s", "containerd", "docker", "cgroups", "podman", "mesos", "scheduler", "wasm-runtime", "containers"],
            "Infrastructure as Code (IaC)": ["terraform", "opentofu", "pulumi", "cloudformation", "ansible", "provisioning", "gitops", "argocd", "flux", "iac"],
            "Service Mesh & API Gateway": ["service-mesh", "mesh", "api-gateway", "envoy", "istio", "traefik", "reverse-proxy", "load-balancer", "caddy", "nginx", "kong"],
            "Observability & Tracing": ["observability", "opentelemetry", "prometheus", "grafana", "tracing", "distributed-tracing", "jaeger", "metrics", "apm", "logging"],
            "Edge & Serverless Computing": ["serverless", "edge-computing", "lambda", "functions", "faas", "cloudflare-workers", "deno-deploy"]
        }
    },
    "Security & Cryptography": {
        "keywords": ["security", "cybersecurity", "cryptography", "infosec", "authentication", "authorization", "penetration-testing", "vulnerability", "auth", "oauth", "password", "crypto", "encryption", "hacking", "osint", "sast", "owasp"],
        "strong": ["security", "cybersecurity", "cryptography", "infosec", "authentication", "authorization", "penetration-testing", "vulnerability", "auth", "oauth", "encryption", "hacking", "osint", "sast", "owasp"],
        "subsystems": {
            "Zero Trust & Identity/Auth": ["auth", "authentication", "authorization", "oauth2", "oidc", "sso", "identity-provider", "keycloak", "rbac", "zero-trust", "jwt", "passwords"],
            "Secrets & Key Management": ["secrets-management", "vault", "kms", "encryption-at-rest", "pki", "certificates", "hsm", "secrets"],
            "Vulnerability & Static Analysis": ["sast", "dast", "security-scanner", "vulnerability-scanner", "cve", "static-analysis", "trivy", "semgrep", "osint", "scanner"],
            "Cryptography & ZK Proofs": ["cryptography", "zero-knowledge", "zk-snark", "elliptic-curve", "post-quantum", "tls", "wireguard", "end-to-end-encryption"],
            "Penetration Testing & Red Team": ["red-team", "pentesting", "exploit", "reverse-engineering", "malware-analysis", "packet-sniffer", "metasploit", "wireshark", "payload"]
        }
    },
    "Developer Tooling & Compilers": {
        "keywords": ["developer-tools", "devtools", "compiler", "bundler", "transpiler", "linter", "formatter", "cli", "profiler", "debugger", "git", "terminal", "shell", "editor", "ide", "vim", "neovim", "testing", "runtime", "build-system", "build-tool"],
        "strong": ["developer-tools", "devtools", "compiler", "bundler", "transpiler", "linter", "formatter", "profiler", "debugger", "testing", "editor", "ide", "vim", "neovim", "runtime", "build-system", "build-tool"],
        "subsystems": {
            "Compilers & Runtimes": ["compiler", "interpreter", "llvm", "bytecode", "jit", "virtual-machine", "runtime", "v8", "webassembly", "rustc"],
            "Bundlers & Build Systems": ["bundler", "build-system", "vite", "webpack", "turborepo", "bazel", "esbuild", "rollup", "package-manager", "npm", "cargo", "make", "cmake", "gradle", "maven"],
            "Linters & Code Quality": ["linter", "code-formatter", "static-analysis", "eslint", "prettier", "biome", "ruff", "ast-parser"],
            "Testing & QA Automation": ["testing", "e2e-testing", "playwright", "cypress", "unit-testing", "fuzzing", "mocking", "benchmark", "test-framework"],
            "Terminal & Editor Utilities": ["cli", "terminal", "tui", "command-line", "shell", "shell-extension", "zsh", "prompt", "neovim", "vim", "tmux"]
        }
    },
    "Web Platforms & Frameworks": {
        "keywords": ["web-framework", "frontend", "backend", "fullstack", "react", "vue", "svelte", "rest-api", "graphql", "javascript", "typescript", "html", "css", "nodejs", "web", "angular", "rails", "django", "laravel", "spring-boot"],
        "strong": ["web-framework", "react", "vue", "svelte", "angular", "rails", "django", "laravel", "spring-boot", "rest-api", "graphql"],
        "subsystems": {
            "Full-Stack & SSR Frameworks": ["fullstack", "ssr", "nextjs", "remix", "nuxt", "sveltekit", "astro", "fastapi", "django", "express", "actix-web", "fiber", "rails", "spring-boot", "flask", "laravel"],
            "UI Component Architecture": ["ui-library", "component-library", "design-system", "tailwind", "radix-ui", "shadcn", "css-in-js", "animation", "icons", "react", "vue"],
            "API Architecture (GraphQL/gRPC)": ["graphql", "grpc", "trpc", "rest-api", "protobuf", "openapi", "websocket", "realtime-web", "api"],
            "State Management & Data Fetching": ["state-management", "redux", "zustand", "tanstack-query", "swr", "reactive", "signals"]
        }
    },
    "Education & Curated Learning": {
        "keywords": ["tutorial", "education", "roadmap", "curated-list", "cheatsheet", "interview", "computer-science", "algorithm", "books", "guide", "free-programming-books", "awesome"],
        "strong": ["tutorial", "education", "roadmap", "curated-list", "cheatsheet", "interview", "books", "computer-science", "awesome"],
        "subsystems": {
            "Learning Roadmaps & Study Plans": ["roadmap", "study-plan", "interview", "coding-interview", "guide", "career"],
            "Curated Resources & Awesome Lists": ["awesome", "awesome-list", "resources", "curated-list", "public-apis"],
            "Interactive Tutorials & Exercises": ["tutorial", "build-your-own", "project-based", "practice", "algorithms", "data-structures", "exercises"]
        }
    },
    "Networking & Distributed Systems": {
        "keywords": ["networking", "distributed-systems", "p2p", "protocol", "transport", "webrtc", "message-broker", "message-queue", "messaging", "mqtt", "rpc", "bittorrent", "socket", "vpn", "wireguard"],
        "strong": ["networking", "p2p", "transport", "webrtc", "message-broker", "message-queue", "messaging", "mqtt", "rpc", "bittorrent", "socket", "protocol", "vpn", "wireguard"],
        "subsystems": {
            "Event Streaming & Message Broker": ["message-broker", "event-driven", "kafka", "rabbitmq", "nats", "pulsar", "sqs", "pubsub"],
            "P2P & Decentralized Networking": ["peer-to-peer", "p2p", "bittorrent", "ipfs", "libp2p", "dht", "decentralized"],
            "Low-Level Protocols & Transports": ["tcp", "udp", "quic", "http3", "webrtc", "socket", "tun-tap", "ebpf", "packet-processing", "vpn", "rpc", "serialization", "thrift", "protobuf"]
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

# --- Taxonomy v2: token-precise keyword matching + calibrated margin rule ---
# v1 used raw substring tests (`kw in corpus`), which let `os` match
# *repository/host/cross*, `ai` match *rails/email*, `sql` match *graphql* — and,
# with no minimum score, a single accidental +1 assigned the domain, while ties
# favored whichever domain the dict declared first (Operating Systems won every
# tie). v2 compiles every keyword once into a token-bounded pattern:
#   * leading look-behind blocks any alphanumerically-adjacent prefix
#     (so `mysql` never yields `sql`);
#   * trailing look-ahead blocks letters but allows digits
#     (so `arm` matches "arm64" and `oauth` matches "oauth2");
#   * interior separators (space, -, _, ., /) are interchangeable, so
#     `key-value` matches "key-value", "key_value" and "key value".
# Corpus and topics MUST be lowercased by the caller (the patterns are lowercase).
_MIN_DOMAIN_SCORE = 3   # a winning domain must clear this absolute score ...
_DOMAIN_MARGIN = 2      # ... and beat the runner-up by this much, else Other/General
_MARGIN_CAP = 9         # domain_margin ships as one small int in Tier-1
_KW_PATTERNS: Dict[str, "re.Pattern"] = {}


def compile_keyword(kw: str) -> "re.Pattern":
    pat = _KW_PATTERNS.get(kw)
    if pat is None:
        pieces = [p for p in re.split(r"[\s\-_./]+", kw.lower()) if p]
        core = "[^a-z0-9]+".join(re.escape(p) for p in pieces) or re.escape(kw.lower())
        # Plural-tolerant for keywords of 4+ letters (algorithm -> algorithms,
        # database -> databases) while short keywords stay strictly singular so
        # `os` can never match "gpt-oss" or "repository".
        trail = r"(?:s(?![a-z])|(?![a-z]))" if len(kw) >= 4 else r"(?![a-z])"
        pat = re.compile(rf"(?<![a-z0-9]){core}{trail}")
        _KW_PATTERNS[kw] = pat
    return pat


# Fixed priority breaks exact artifact-score ties deterministically (documented,
# not emergent from dict order).
_ARTIFACT_PRIORITY = [
    "Curated List / Docs",
    "Template / Starter",
    "Developer Tool / CLI",
    "Library / SDK",
    "System Service / Engine",
    "Framework",
    "Application / Service",
]


def classify_artifact(repo_name: str, description: str, topics: List[str]) -> str:
    """Scored artifact classification (v2): weighted evidence over exact tokens.

    Replaces v1's ordered if-chain where `"cli"` ⊂ *client* classified a Redis
    client library as Developer Tool / CLI, `"engine"` outranked library signals,
    and everything unmatched fell into the `Application / Service` catch-all
    (70.7% of the catalog). Deterministic: fixed buckets, fixed tie priority.
    """
    name = (repo_name or "").lower()
    desc = (description or "").lower()
    topic_list = [t.lower() for t in (topics or [])]
    topic_text = "\n".join(topic_list)

    # Curated lists stay early returns: name-anchored regexes and explicit topic
    # tags are high precision, and a curated list must never be outvoted.
    for pattern in CURATED_LIST_PATTERNS:
        if pattern.search(repo_name or "") or pattern.search(description or ""):
            return "Curated List / Docs"
    if {"awesome", "awesome-list", "roadmap", "cheatsheet", "reading-list",
            "learning", "tutorial", "checklist"} & set(topic_list):
        return "Curated List / Docs"

    corpus = f"{name}\n{desc}\n{topic_text}"
    scores: Dict[str, int] = {label: 0 for label in _ARTIFACT_PRIORITY}

    def add(label: str, kw: str, name_weight: int, body_weight: int) -> None:
        # name hit outweighs body hit for the same keyword (never both)
        pat = compile_keyword(kw)
        if pat.search(name):
            scores[label] += name_weight
        elif pat.search(corpus):
            scores[label] += body_weight

    # Template / Starter
    for kw in ("template", "boilerplate", "starter", "scaffold", "cookiecutter"):
        add("Template / Starter", kw, 6, 3)

    # Developer Tool / CLI — exact `cli`/`tui` tokens only, so `client` can never
    # leak in here; plus phrase and tool-genre evidence.
    for kw in ("cli", "tui"):
        add("Developer Tool / CLI", kw, 6, 5)
    for kw in ("command line tool", "command line interface", "terminal emulator",
               "version control", "infrastructure as code"):
        add("Developer Tool / CLI", kw, 4, 4)
    for kw in ("bundler", "linter", "formatter", "profiler", "debugger", "scanner",
               "compiler", "transpiler"):
        add("Developer Tool / CLI", kw, 4, 3)
    add("Developer Tool / CLI", "iac", 4, 4)
    add("Developer Tool / CLI", "codegen", 4, 4)
    add("Developer Tool / CLI", "code generator", 4, 4)

    # Library / SDK
    for kw in ("library", "sdk", "bindings"):
        add("Library / SDK", kw, 5, 4)
    for kw in ("client", "driver", "wrapper"):
        add("Library / SDK", kw, 4, 3)
    add("Library / SDK", "extension", 0, 3)

    # System Service / Engine — deliberately demoted: `engine`/`server` alone are
    # weak (a "query engine library" must stay a library), while server-ish nouns
    # carry the real signal.
    add("System Service / Engine", "daemon", 4, 4)
    add("System Service / Engine", "broker", 4, 3)
    add("System Service / Engine", "scheduler", 4, 2)
    add("System Service / Engine", "database server", 4, 3)
    for kw in ("engine", "server"):
        add("System Service / Engine", kw, 2, 2)
    for kw in ("database", "datastore", "in-memory", "store"):
        add("System Service / Engine", kw, 1, 1)

    # Framework (v1 also counted bare `platform`, which labelled Grafana a
    # framework — dropped as too weak to prove anything)
    add("Framework", "framework", 6, 5)

    best = max(scores.values())
    if best <= 0:
        return "Application / Service"
    for label in _ARTIFACT_PRIORITY:
        if label != "Application / Service" and scores[label] == best:
            return label
    return "Application / Service"


def classify_domain_and_subsystem(repo_name: str, description: str, topics: List[str],
                                  language: Optional[str]) -> tuple:
    """Taxonomy v2: token-scored domain selection with a calibrated margin rule.

    Returns ``(domain, subsystem, domain_margin)``:
      * domain   — winner only if ``best >= _MIN_DOMAIN_SCORE`` and
                   ``best - second >= _DOMAIN_MARGIN``; otherwise ``Other / General``.
                   Tie order is deterministic: (score, topic-hits, alphabetical).
      * subsystem— scored under the *accepted* domain only (an abstained domain
                   yields ``General Components``, so subsystem filters never show
                   labels the domain facet cannot reach). Zero-score fallback keeps
                   the v1 ``General <domain-head>`` format for stability.
      * domain_margin — capped 0..9 decisive gap (best - second), shipped in Tier-1
                   so the UI can flag low-confidence labels.
    """
    text_corpus = (f"{repo_name or ''} {description or ''} "
                   f"{' '.join(topics or [])} {language or ''}").lower()
    topic_text = "\n".join(t.lower() for t in (topics or []))

    ranked: List[tuple] = []
    for domain_name, domain_data in TAXONOMY_RULES.items():
        score = 0
        topic_hits = 0
        # `strong` keywords are near-definitive for their domain (kubernetes ->
        # Cloud, database -> Databases); a topic hit on them is worth +6 so a
        # generic topic elsewhere (cli, javascript) cannot force a 3-3 tie.
        strong = set(domain_data.get("strong") or ())
        generic_topic = 0
        for kw in domain_data["keywords"]:
            pat = compile_keyword(kw)
            if topic_text and pat.search(topic_text):
                if kw in strong:
                    score += 6
                else:
                    # non-strong topics are worth +3 but capped in total, so
                    # [javascript, typescript] cannot outvote a strong `runtime`
                    generic_topic += 1
                topic_hits += 1
            elif pat.search(text_corpus):
                score += 1
        if generic_topic:
            score += 3
        ranked.append((domain_name, score, topic_hits))
    ranked.sort(key=lambda r: (-r[1], -r[2], r[0]))

    (best_domain, best_score, _), (second_domain, second_score, _) = ranked[0], ranked[1]
    margin = max(0, min(_MARGIN_CAP, best_score - second_score))

    if best_score < _MIN_DOMAIN_SCORE or (best_score - second_score) < _DOMAIN_MARGIN:
        return "Other / General", "General Components", margin
    domain = best_domain

    subsystems = TAXONOMY_RULES[domain]["subsystems"]
    ranked_subs: List[tuple] = []
    for sub_name, sub_keywords in subsystems.items():
        sub_score = 0
        sub_topic_hits = 0
        for skw in sub_keywords:
            pat = compile_keyword(skw)
            if topic_text and pat.search(topic_text):
                sub_score += 4
                sub_topic_hits += 1
            elif pat.search(text_corpus):
                sub_score += 1
        ranked_subs.append((sub_name, sub_score, sub_topic_hits))
    ranked_subs.sort(key=lambda r: (-r[1], -r[2], r[0]))

    sub_name, sub_score, _ = ranked_subs[0]
    if sub_score == 0:
        # same format v1 used, so existing General* labels stay stable
        subsystem = f"General {domain.split('&')[0].strip()}"
    else:
        subsystem = sub_name
    return domain, subsystem, margin

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
    domain, subsystem, domain_margin = classify_domain_and_subsystem(name, description, topics, language)

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
        "domain_margin": domain_margin,
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
