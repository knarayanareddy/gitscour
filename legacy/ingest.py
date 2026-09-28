import os
import json
import time
import urllib.request
import urllib.error
from typing import List, Dict, Any
from taxonomy_engine import enrich_repository_record

GITHUB_API_GRAPHQL = "https://api.github.com/graphql"

GRAPHQL_QUERY = """
query($queryString: String!, $cursor: String) {
  search(query: $queryString, type: REPOSITORY, first: 100, after: $cursor) {
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
      }
    }
  }
}
"""

def fetch_graphql_chunk(token: str, query_string: str, cursor: str = None) -> Dict[str, Any]:
    headers = {
        "User-Agent": "GitScour-Data-Collector/1.0",
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = json.dumps({
        "query": GRAPHQL_QUERY,
        "variables": {
            "queryString": query_string,
            "cursor": cursor
        }
    }).encode("utf-8")

    req = urllib.request.Request(GITHUB_API_GRAPHQL, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode('utf-8')}")
        raise

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

def run_range_scrape(token: str, min_stars: int = 500, max_stars: int = 600, max_pages: int = 10) -> List[Dict[str, Any]]:
    results = []
    cursor = None
    query_str = f"stars:{min_stars}..{max_stars} sort:stars-desc"
    print(f"Scraping range: {query_str}")

    for page in range(max_pages):
        data = fetch_graphql_chunk(token, query_str, cursor)
        search_data = data.get("data", {}).get("search", {})
        nodes = search_data.get("nodes", [])
        
        for node in nodes:
            if node:
                results.append(parse_graphql_node(node))

        page_info = search_data.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")
        time.sleep(0.5)

    return results

if __name__ == "__main__":
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        print("Note: GITHUB_TOKEN environment variable is not set. Run with token to execute live scraping.")
    else:
        repos = run_range_scrape(token, min_stars=50000, max_stars=500000, max_pages=1)
        print(f"Scraped and classified {len(repos)} sample repos.")
        with open("sample_scraped.json", "w") as f:
            json.dump(repos, f, indent=2)
