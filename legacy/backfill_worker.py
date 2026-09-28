import os
import sys
import json
import time
import urllib.request
import argparse
from concurrent.futures import ThreadPoolExecutor

sys.path.append(os.path.dirname(__file__))
from taxonomy_engine import enrich_repository_record
from shard_manager import build_sharded_dataset

GRAPHQL_QUERY = """
query($q: String!, $cursor: String) {
  search(query: $q, type: REPOSITORY, first: 100, after: $cursor) {
    pageInfo {
      hasNextPage
      endCursor
    }
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
        repositoryTopics(first: 8) {
          nodes { topic { name } }
        }
        pushedAt
      }
    }
  }
}
"""

def query_window(token: str, window_query: str, max_pages: int = 10):
    harvested = []
    cursor = None
    for p in range(max_pages):
        payload = json.dumps({
            "query": GRAPHQL_QUERY,
            "variables": {"q": f"{window_query} sort:stars-desc", "cursor": cursor}
        }).encode("utf-8")
        req = urllib.request.Request(
            "https://api.github.com/graphql",
            data=payload,
            headers={"Authorization": f"Bearer {token}", "User-Agent": "GitScour-Backfill/1.0", "Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                data = json.loads(r.read().decode("utf-8"))
                search = data.get("data", {}).get("search", {})
                nodes = search.get("nodes", [])
                for n in nodes:
                    if n and n.get("databaseId"):
                        lic = (n.get("licenseInfo") or {}).get("spdxId") or (n.get("licenseInfo") or {}).get("name") or "Unknown"
                        topics = [t["topic"]["name"] for t in n.get("repositoryTopics", {}).get("nodes", []) if t.get("topic")]
                        raw = {
                            "id": n.get("databaseId"),
                            "name": n.get("name"),
                            "owner": (n.get("owner") or {}).get("login", ""),
                            "description": n.get("description") or "",
                            "stars": n.get("stargazerCount", 0),
                            "forks": n.get("forkCount", 0),
                            "language": (n.get("primaryLanguage") or {}).get("name") or "Other",
                            "license": lic,
                            "topics": topics,
                            "pushed_at": n.get("pushedAt")
                        }
                        harvested.append(enrich_repository_record(raw))
                if not search.get("pageInfo", {}).get("hasNextPage"):
                    break
                cursor = search.get("pageInfo", {}).get("endCursor")
                time.sleep(0.5)
        except Exception as e:
            print(f"Error querying {window_query} page {p}: {e}")
            break
    return harvested

def main():
    parser = argparse.ArgumentParser(description="GitScour Autonomous Backfill Runner")
    parser.add_argument("--window", type=str, default="stars:>1000", help="Target star window")
    parser.add_argument("--output", type=str, default="web/public", help="Output directory")
    args = parser.parse_args()

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        print("Error: GITHUB_TOKEN environment variable required.")
        sys.exit(1)

    print(f"🚀 Running GitHub Actions Backfill Worker for window: {args.window}")
    records = query_window(token, args.window, max_pages=10)
    print(f"Captured {len(records)} records for window {args.window}")

    # Output shard chunk
    chunk_file = f"chunk_{abs(hash(args.window))}.json"
    with open(chunk_file, "w", encoding="utf-8") as f:
        json.dump(records, f)
    print(f"Saved chunk: {chunk_file}")

if __name__ == "__main__":
    main()
