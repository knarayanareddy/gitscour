import os
import sys
import json
import re
from typing import List, Dict, Any

def slugify(text: str) -> str:
    """Converts domain or subsystem name to safe URL/file slug."""
    text = text.lower().replace('&', 'and')
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')

def build_sharded_dataset(repos: List[Dict[str, Any]], base_dir: str = "web/public"):
    """
    Splits the repository dataset into:
    1. Tier 1: Compact Global Index (`catalog-index.json`) for instant catalog search,
       faceted filtering, and 3D galaxy rendering (<2 MB).
    2. Tier 2: Domain-level deep detail shards (`data/details/{domain_slug}.json`) 
       lazy-fetched on demand when a user clicks a modal or filters a sector.
    """
    os.makedirs(f"{base_dir}/data/details", exist_ok=True)

    tier1_index = []
    shards = {}

    for r in repos:
        # Tier 1 (Lightweight representation for instant in-browser operations)
        tier1_index.append({
            "id": r["id"],
            "name": r["name"],
            "owner": r["owner"],
            "full_name": r.get("full_name") or f"{r['owner']}/{r['name']}",
            "description": r.get("description") or "",
            "stars": r["stars"],
            "forks": r["forks"],
            "language": r.get("language") or "Other",
            "license": r.get("license") or "Unknown",
            "artifact": r.get("artifact") or "Application / Service",
            "domain": r.get("domain") or "Other / General",
            "subsystem": r.get("subsystem") or "General Components",
            "primitives": r.get("primitives") or [],
            "compatibility": r.get("compatibility") or [],
            "keywords": r.get("keywords") or [],
            "topics": (r.get("topics") or [])[:5],
            "pushed_at": r.get("pushed_at"),
            "url": r.get("url") or f"https://github.com/{r['owner']}/{r['name']}",
            "shard": slugify(r.get("domain") or "other-general"),
            # Brief hook for instant card preview without loading detail shard
            "hook": (r.get("beginner_intel") or {}).get("what_it_does") or r.get("description") or ""
        })

        # Tier 2 (Deep Intelligence Sheet Shards)
        domain_slug = slugify(r.get("domain") or "other-general")
        if domain_slug not in shards:
            shards[domain_slug] = {}

        shards[domain_slug][r["id"]] = {
            "id": r["id"],
            "name": r["name"],
            "owner": r["owner"],
            "description": r.get("description") or "",
            "beginner_intel": r.get("beginner_intel") or {},
            "license_intel": r.get("license_intel") or {},
            "maturity": r.get("maturity") or {},
            "quickstart_code": r.get("quickstart_code") or f"git clone https://github.com/{r['owner']}/{r['name']}.git",
            "primitives": r.get("primitives") or [],
            "compatibility": r.get("compatibility") or [],
            "usecases": r.get("usecases") or [],
            "keywords": r.get("keywords") or []
        }

    # Write Tier 1 Index
    index_path = f"{base_dir}/catalog-index.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(tier1_index, f, separators=(',', ':')) # compact minified JSON

    # Also maintain legacy repos.json symlink/alias so existing routes don't break
    with open(f"{base_dir}/repos.json", "w", encoding="utf-8") as f:
        json.dump(tier1_index, f, separators=(',', ':'))

    print(f"✅ Generated Tier 1 Compact Index: {index_path} ({len(tier1_index)} repos, {os.path.getsize(index_path) / 1024:.1f} KB)")

    # Write Tier 2 Shards
    for slug, records in shards.items():
        shard_path = f"{base_dir}/data/details/{slug}.json"
        with open(shard_path, "w", encoding="utf-8") as f:
            json.dump(records, f, separators=(',', ':'))
        print(f"  📁 Shard [{slug}]: {len(records)} deep intelligence sheets ({os.path.getsize(shard_path) / 1024:.1f} KB)")

if __name__ == "__main__":
    repos_file = "web/public/repos.json"
    if os.path.exists(repos_file):
        with open(repos_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        build_sharded_dataset(data)
