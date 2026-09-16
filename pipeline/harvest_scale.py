import os
import sys
import json
import time
import subprocess
from typing import List, Dict, Any, Optional
from taxonomy_engine import enrich_repository_record

GRAPHQL_QUERY = """
query($queryString: String!, $cursor: String) {
  rateLimit {
    remaining
    resetAt
  }
  search(query: $queryString, type: REPOSITORY, first: 50, after: $cursor) {
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
        repositoryTopics(first: 10) {
          nodes {
            topic {
              name
            }
          }
        }
        pushedAt
        readme: object(expression: "HEAD:README.md") {
          ... on Blob {
            text
          }
        }
      }
    }
  }
}
"""

def execute_graphql(query: str, variables: Dict[str, Any]) -> Dict[str, Any]:
    """Executes GraphQL query via gh CLI directly using its configured authentication."""
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

    raw_readme = (node.get("readme") or {}).get("text") or ""
    # Extract first 500 chars of readme if available to aid semantic keyword extraction
    readme_snippet = raw_readme[:500].replace("\n", " ").strip() if raw_readme else ""

    raw = {
        "id": node.get("databaseId"),
        "name": node.get("name"),
        "owner": node.get("owner", {}).get("login", ""),
        "description": node.get("description") or "",
        "readme_snippet": readme_snippet,
        "stars": node.get("stargazerCount", 0),
        "forks": node.get("forkCount", 0),
        "language": (node.get("primaryLanguage") or {}).get("name") or "Other",
        "license": license_id,
        "topics": topics,
        "pushed_at": node.get("pushedAt")
    }
    return enrich_repository_record(raw)

def harvest_batch(star_queries: List[str], max_pages_per_query: int = 2) -> List[Dict[str, Any]]:
    """
    Harvests repositories across multiple targeted star windows.
    Extracts rich architecture metadata and de-duplicates by repository ID.
    """
    harvested = {}
    total_queries = len(star_queries)

    print(f"🚀 Starting Live Scale Harvester across {total_queries} star windows...")

    for idx, query_filter in enumerate(star_queries, 1):
        print(f"\n[{idx}/{total_queries}] Executing window: {query_filter}")
        cursor = None
        
        for page in range(max_pages_per_query):
            try:
                variables = {
                    "queryString": f"{query_filter} sort:stars-desc",
                    "cursor": cursor
                }
                data = execute_graphql(GRAPHQL_QUERY, variables)
                
                rate_limit = data.get("data", {}).get("rateLimit", {})
                remaining = rate_limit.get("remaining")
                print(f"  Page {page + 1}: Rate limit remaining = {remaining}")

                search_res = data.get("data", {}).get("search", {})
                nodes = search_res.get("nodes", [])
                
                new_nodes = 0
                for node in nodes:
                    if node and node.get("databaseId"):
                        repo_id = node["databaseId"]
                        if repo_id not in harvested:
                            harvested[repo_id] = parse_graphql_node(node)
                            new_nodes += 1

                print(f"  Harvested {new_nodes} new repos from page (Total: {len(harvested)})")

                page_info = search_res.get("pageInfo", {})
                if not page_info.get("hasNextPage"):
                    break
                cursor = page_info.get("endCursor")

                # Respect API hygiene
                time.sleep(0.5)

            except Exception as e:
                print(f"  ⚠️ Error scraping window '{query_filter}' on page {page + 1}: {e}")
                break

    return list(harvested.values())

def run_harvester(output_file: str = "web/public/repos.json", merge_existing: bool = True):
    # Diverse queries across star ranges to gather high-signal repos
    star_windows = [
        "stars:>40000",
        "stars:20000..40000",
        "stars:10000..20000",
        "stars:5000..10000",
        "stars:2000..5000",
        "stars:500..2000"
    ]

    new_records = harvest_batch(star_windows, max_pages_per_query=2)

    existing_records = []
    if merge_existing and os.path.exists(output_file):
        try:
            with open(output_file, "r", encoding="utf-8") as f:
                existing_records = json.load(f)
            print(f"\nLoaded {len(existing_records)} existing records to merge.")
        except Exception as e:
            print(f"Warning: could not read {output_file}: {e}")

    # Merge by ID, keeping manual high-polish beginner intel if present
    merged_map = {r["id"]: r for r in existing_records}
    for r in new_records:
        r_id = r["id"]
        if r_id in merged_map:
            # Preserve rich manual overrides if previously curated
            if "beginner_intel" in merged_map[r_id] and merged_map[r_id]["beginner_intel"].get("what_it_does"):
                r["beginner_intel"] = merged_map[r_id]["beginner_intel"]
            if "quickstart_code" in merged_map[r_id] and not merged_map[r_id]["quickstart_code"].startswith("git clone"):
                r["quickstart_code"] = merged_map[r_id]["quickstart_code"]
        merged_map[r_id] = r

    final_list = sorted(list(merged_map.values()), key=lambda x: x["stars"], reverse=True)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(final_list, f, indent=2)

    print(f"\n✅ Harvest complete! Successfully wrote {len(final_list)} total repos to {output_file}")

if __name__ == "__main__":
    run_harvester()
