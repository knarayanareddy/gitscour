import os
import sys
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.append(os.path.dirname(__file__))
from taxonomy_engine import enrich_repository_record
from shard_manager import build_sharded_dataset

GRAPHQL_QUERY = """
query($q: String!) {
  search(query: $q, type: REPOSITORY, first: 60) {
    nodes {
      ... on Repository {
        databaseId
        name
        owner { login }
        description
        stargazerCount
        forkCount
        primaryLanguage { name }
        licenseInfo { spdxId name }
        repositoryTopics(first: 6) {
          nodes { topic { name } }
        }
        pushedAt
      }
    }
  }
}
"""

def fetch_window(token: str, win: str):
    q = f"{win} sort:stars-desc"
    payload = json.dumps({"query": GRAPHQL_QUERY, "variables": {"q": q}}).encode("utf-8")
    req = urllib.request.Request(
        "https://api.github.com/graphql",
        data=payload,
        headers={"Authorization": f"Bearer {token}", "User-Agent": "GitScour/1.0", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=12) as r:
        data = json.loads(r.read().decode("utf-8"))
        nodes = data.get("data", {}).get("search", {}).get("nodes", [])
        return win, nodes

def parse_node(node):
    topics = [t["topic"]["name"] for t in node.get("repositoryTopics", {}).get("nodes", []) if t.get("topic")]
    lic = (node.get("licenseInfo") or {}).get("spdxId") or (node.get("licenseInfo") or {}).get("name") or "Unknown"
    raw = {
        "id": node.get("databaseId"),
        "name": node.get("name"),
        "owner": (node.get("owner") or {}).get("login", ""),
        "description": node.get("description") or "",
        "stars": node.get("stargazerCount", 0),
        "forks": node.get("forkCount", 0),
        "language": (node.get("primaryLanguage") or {}).get("name") or "Other",
        "license": lic,
        "topics": topics,
        "pushed_at": node.get("pushedAt")
    }
    return enrich_repository_record(raw)

def main():
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    
    windows = [
        "stars:>80000",
        "stars:50000..80000",
        "stars:30000..50000",
        "stars:20000..30000",
        "stars:14000..20000",
        "stars:9000..14000",
        "stars:6000..9000",
        "stars:4000..6000",
        "stars:2500..4000",
        "stars:1600..2500",
        "stars:1000..1600",
        "stars:700..1000",
        "stars:500..700"
    ]

    print(f"🚀 Running concurrent harvest across {len(windows)} star windows...", flush=True)
    all_nodes = []

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(fetch_window, token, w): w for w in windows}
        for fut in as_completed(futures):
            win = futures[fut]
            try:
                _, nodes = fut.result()
                print(f"  ✓ Finished window {win}: {len(nodes)} repos", flush=True)
                all_nodes.extend(nodes)
            except Exception as e:
                print(f"  ✗ Error on {win}: {e}", flush=True)

    harvested = {}
    for n in all_nodes:
        if n and n.get("databaseId"):
            harvested[n["databaseId"]] = parse_node(n)

    # Merge with existing repos.json
    existing = []
    try:
        with open("web/public/repos.json", "r", encoding="utf-8") as f:
            existing = json.load(f)
    except Exception:
        pass

    merged = {r["id"]: r for r in existing}
    for r in harvested.values():
        merged[r["id"]] = r

    all_repos = sorted(list(merged.values()), key=lambda x: x["stars"], reverse=True)
    print(f"\n✅ Total unique enriched repositories in local database: {len(all_repos)}", flush=True)
    build_sharded_dataset(all_repos, base_dir="web/public")

if __name__ == "__main__":
    main()
