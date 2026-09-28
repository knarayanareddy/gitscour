import os
import sys
import json
import time
import subprocess
from typing import List, Dict, Any

sys.path.append(os.path.dirname(__file__))
from taxonomy_engine import enrich_repository_record
from shard_manager import build_sharded_dataset

# Clean, robust GraphQL search query targeting 30 items per page
GRAPHQL_FAST_QUERY = """
query($queryString: String!, $cursor: String) {
  rateLimit {
    remaining
    resetAt
  }
  search(query: $queryString, type: REPOSITORY, first: 30, after: $cursor) {
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

def harvest_phase1(max_pages_per_window: int = 2):
    """
    Crawls across 24 distinct star slices to harvest a deep, diverse cross-section
    of projects from 500 stars up to 500,000+ stars without triggering timeouts.
    """
    windows = [
        "stars:>80000",
        "stars:50000..80000",
        "stars:35000..50000",
        "stars:25000..35000",
        "stars:18000..25000",
        "stars:14000..18000",
        "stars:10000..14000",
        "stars:8000..10000",
        "stars:6500..8000",
        "stars:5000..6500",
        "stars:4000..5000",
        "stars:3200..4000",
        "stars:2500..3200",
        "stars:2000..2500",
        "stars:1600..2000",
        "stars:1300..1600",
        "stars:1000..1300",
        "stars:850..1000",
        "stars:700..850",
        "stars:600..700",
        "stars:550..600",
        "stars:520..550",
        "stars:500..520"
    ]

    harvested = {}
    print(f"🚀 Starting Phase 1 Scaled Harvest across {len(windows)} star windows...")

    for i, win in enumerate(windows, 1):
        print(f"[{i}/{len(windows)}] Window: {win}")
        cursor = None
        for page in range(max_pages_per_window):
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
                time.sleep(0.3)
            except Exception as e:
                print(f"  Warning on {win} page {page}: {e}")
                time.sleep(0.5)
                break

    # Read existing repos to merge
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
    print(f"\n✅ Total unique enriched repositories harvested: {len(all_repos)}")

    # Emit Tier 1 index & Tier 2 shards
    build_sharded_dataset(all_repos, base_dir="web/public")

if __name__ == "__main__":
    harvest_phase1()
