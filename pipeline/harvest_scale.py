import os
import sys
import json
import time
import subprocess
from typing import List, Dict, Any

sys.path.append(os.path.dirname(__file__))
from taxonomy_engine import enrich_repository_record
from shard_manager import build_sharded_dataset

# Fast GraphQL query without heavy README blob joins (which caused 504 timeouts on 100 items)
GRAPHQL_FAST_QUERY = """
query($queryString: String!, $cursor: String) {
  rateLimit {
    remaining
    resetAt
  }
  search(query: $queryString, type: REPOSITORY, first: 40, after: $cursor) {
    repositoryCount
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ... on Repository {
        databaseId
        name
        owner {
          login
        }
        description
        stargazerCount
        forkCount
        primaryLanguage {
          name
        }
        licenseInfo {
          spdxId
          name
        }
        repositoryTopics(first: 8) {
          nodes {
            topic {
              name
            }
          }
        }
        pushedAt
      }
    }
  }
}
"""

def execute_graphql(query: str, variables: Dict[str, Any]) -> Dict[str, Any]:
    cmd = [
        "gh", "api", "graphql",
        "-f", f"query={query}",
        "-F", f"queryString={variables['queryString']}"
    ]
    if variables.get("cursor"):
        cmd.extend(["-F", f"cursor={variables['cursor']}"])

    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"GraphQL request failed: {result.stderr.strip()}")

    return json.loads(result.stdout)

def parse_graphql_node(node: Dict[str, Any]) -> Dict[str, Any]:
    topics = [
        t["topic"]["name"] 
        for t in node.get("repositoryTopics", {}).get("nodes", []) 
        if t.get("topic")
    ]
    license_info = node.get("licenseInfo") or {}
    license_id = license_info.get("spdxId") or license_info.get("name") or "Unknown"

    raw = {
        "id": node.get("databaseId"),
        "name": node.get("name"),
        "owner": node.get("owner", {}).get("login", ""),
        "description": node.get("description") or "",
        "stars": node.get("stargazerCount", 0),
        "forks": node.get("forkCount", 0),
        "language": (node.get("primaryLanguage") or {}).get("name") or "Other",
        "license": license_id,
        "topics": topics,
        "pushed_at": node.get("pushedAt")
    }
    return enrich_repository_record(raw)

def harvest_batch():
    windows = [
        "stars:>40000",
        "stars:25000..40000",
        "stars:18000..25000",
        "stars:12000..18000",
        "stars:8000..12000",
        "stars:5000..8000",
        "stars:3500..5000",
        "stars:2500..3500",
        "stars:1800..2500",
        "stars:1200..1800",
        "stars:800..1200",
        "stars:500..800"
    ]

    harvested = {}
    print(f"🚀 Running resilient GraphQL scale harvester...")

    for i, win in enumerate(windows, 1):
        print(f"[{i}/{len(windows)}] Window: {win}")
        cursor = None
        for page in range(2):
            try:
                data = execute_graphql(GRAPHQL_FAST_QUERY, {
                    "queryString": f"{win} sort:stars-desc",
                    "cursor": cursor
                })
                nodes = data.get("data", {}).get("search", {}).get("nodes", [])
                for n in nodes:
                    if n and n.get("databaseId"):
                        harvested[n["databaseId"]] = parse_graphql_node(n)
                page_info = data.get("data", {}).get("search", {}).get("pageInfo", {})
                if not page_info.get("hasNextPage"):
                    break
                cursor = page_info.get("endCursor")
                time.sleep(0.4)
            except Exception as e:
                print(f"  Warning on {win} page {page}: {e}")
                time.sleep(1)
                break

    # Read existing
    index_file = "web/public/repos.json"
    existing = []
    if os.path.exists(index_file):
        try:
            with open(index_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            pass

    merged = {r["id"]: r for r in existing}
    for r in harvested.values():
        merged[r["id"]] = r

    all_repos = sorted(list(merged.values()), key=lambda x: x["stars"], reverse=True)
    print(f"\nFinal scale harvest count: {len(all_repos)} repositories")
    build_sharded_dataset(all_repos, base_dir="web/public")

if __name__ == "__main__":
    harvest_batch()
