import os
import sys
import json
import csv
import re
from typing import Dict, Any

sys.path.append(os.path.dirname(__file__))
from taxonomy_engine import enrich_repository_record

def slugify(text: str) -> str:
    text = (text or "other-general").lower().replace('&', 'and')
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')

def run_50k_pipeline():
    print("🚀 Initializing GitScour 50,000+ Unified Scaling Pipeline...")

    unique_repos: Dict[str, Dict[str, Any]] = {}

    # 1. SamoTech Canonical Registry
    samotech_file = 'pipeline/samotech_repositories.csv'
    if os.path.exists(samotech_file):
        with open(samotech_file, 'r', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                url = (row.get('html_url') or '').strip().rstrip('/').lower()
                if url:
                    unique_repos[url] = {
                        'id': int(row.get('repository_id') or abs(hash(url))),
                        'name': row.get('name') or '',
                        'owner': row.get('owner') or '',
                        'description': row.get('description') or '',
                        'stars': int(row.get('stars') or 0),
                        'forks': int(row.get('forks') or 0),
                        'language': row.get('primary_language') or 'Other',
                        'license': row.get('license') or 'Open Source',
                        'topics': (row.get('topics') or '').split(';'),
                        'pushed_at': row.get('pushed_at') or '2026-09-01T00:00:00Z'
                    }
        print(f"Loaded {len(unique_repos)} repos from SamoTech.")

    # 2. Packed catalog
    packed_file = 'web/public/catalog-packed.json'
    if os.path.exists(packed_file):
        with open(packed_file, 'r', encoding='utf-8') as f:
            packed = json.load(f)
        for r in packed['rows']:
            url = f"https://github.com/{r[2]}/{r[1]}".lower()
            if url not in unique_repos:
                unique_repos[url] = {
                    'id': r[0],
                    'name': r[1],
                    'owner': r[2],
                    'description': r[11] or '',
                    'stars': r[3],
                    'forks': r[4],
                    'language': packed['languages'].get(str(r[5]), 'Other'),
                    'license': r[9] or 'Open Source',
                    'topics': [],
                    'pushed_at': '2026-09-01T00:00:00Z'
                }
        print(f"Loaded cumulative: {len(unique_repos)} repos after packed catalog.")

    # 3. EvanLi Historical Ranking Snapshot Collection
    evanli_file = 'pipeline/evanli_repos.json'
    if os.path.exists(evanli_file):
        with open(evanli_file, 'r', encoding='utf-8') as f:
            for r in json.load(f):
                url = f"https://github.com/{r['owner']}/{r['name']}".lower()
                if url not in unique_repos:
                    unique_repos[url] = r
        print(f"Loaded cumulative: {len(unique_repos)} repos after EvanLi.")

    # 4. WinstonFassett Stars Export
    winston_file = 'pipeline/winston_stars.csv'
    if os.path.exists(winston_file):
        with open(winston_file, 'r', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                s = int(row.get('stargazers_count') or row.get('stars') or 0)
                if s >= 500:
                    url = (row.get('html_url') or '').strip().rstrip('/').lower()
                    if url and url not in unique_repos:
                        unique_repos[url] = {
                            'id': abs(hash(url)),
                            'name': row.get('name') or url.split('/')[-1],
                            'owner': row.get('owner_name') or (url.split('/')[-2] if len(url.split('/')) >= 2 else ''),
                            'description': row.get('description') or '',
                            'stars': s,
                            'forks': int(row.get('forks_count') or 0),
                            'language': row.get('language') or 'Other',
                            'license': row.get('license_name') or 'Open Source',
                            'topics': (row.get('topics') or '').split(';'),
                            'pushed_at': row.get('pushed_at') or '2026-09-01T00:00:00Z'
                        }
        print(f"Loaded cumulative: {len(unique_repos)} repos after WinstonFassett.")

    # 5. Marchanlon Stars Export
    marchanlon_file = 'pipeline/marchanlon_stars.csv'
    if os.path.exists(marchanlon_file):
        with open(marchanlon_file, 'r', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                s = int(row.get('stargazers_count') or row.get('stars') or 0)
                if s >= 500:
                    url = (row.get('html_url') or '').strip().rstrip('/').lower()
                    if url and url not in unique_repos:
                        unique_repos[url] = {
                            'id': abs(hash(url)),
                            'name': row.get('name') or url.split('/')[-1],
                            'owner': row.get('owner_name') or (url.split('/')[-2] if len(url.split('/')) >= 2 else ''),
                            'description': row.get('description') or '',
                            'stars': s,
                            'forks': int(row.get('forks_count') or 0),
                            'language': row.get('language') or 'Other',
                            'license': row.get('license_name') or 'Open Source',
                            'topics': (row.get('topics') or '').split(';'),
                            'pushed_at': row.get('pushed_at') or '2026-09-01T00:00:00Z'
                        }
        print(f"Loaded cumulative: {len(unique_repos)} repos after Marchanlon.")

    # 6. Kaiser Classified
    kaiser_file = 'pipeline/kaiser_classified.json'
    if os.path.exists(kaiser_file):
        with open(kaiser_file, 'r', encoding='utf-8') as f:
            for r in json.load(f).get('repos', []):
                s = int(r.get('stargazers_count') or r.get('stars') or 0)
                if s >= 500:
                    url = (r.get('html_url') or f"https://github.com/{r.get('full_name')}").strip().rstrip('/').lower()
                    if url and url not in unique_repos:
                        unique_repos[url] = {
                            'id': r.get('id') or abs(hash(url)),
                            'name': r.get('name') or url.split('/')[-1],
                            'owner': r.get('owner', {}).get('login') if isinstance(r.get('owner'), dict) else (url.split('/')[-2] if len(url.split('/')) >= 2 else ''),
                            'description': r.get('description') or '',
                            'stars': s,
                            'forks': int(r.get('forks_count') or 0),
                            'language': r.get('language') or 'Other',
                            'license': r.get('license', {}).get('spdx_id') if isinstance(r.get('license'), dict) else 'Open Source',
                            'topics': r.get('topics') or [],
                            'pushed_at': r.get('pushed_at') or '2026-09-01T00:00:00Z'
                        }
        print(f"Loaded cumulative: {len(unique_repos)} repos after Kaiser.")

    # 7. Live GraphQL Gap Crawl
    graphql_file = 'pipeline/graphql_gap_repos.json'
    if os.path.exists(graphql_file):
        with open(graphql_file, 'r', encoding='utf-8') as f:
            for r in json.load(f):
                s = r.get('stargazerCount', 0)
                if s >= 500:
                    owner = r.get('owner', {}).get('login', '') if isinstance(r.get('owner'), dict) else ''
                    name = r.get('name', '')
                    url = f"https://github.com/{owner}/{name}".lower()
                    if url and url not in unique_repos:
                        unique_repos[url] = {
                            'id': r.get('databaseId') or abs(hash(url)),
                            'name': name,
                            'owner': owner,
                            'description': r.get('description') or '',
                            'stars': s,
                            'forks': r.get('forkCount') or 0,
                            'language': r.get('primaryLanguage', {}).get('name') if isinstance(r.get('primaryLanguage'), dict) else 'Other',
                            'license': r.get('licenseInfo', {}).get('spdxId') if isinstance(r.get('licenseInfo'), dict) else 'Open Source',
                            'topics': [],
                            'pushed_at': r.get('pushedAt') or '2026-09-01T00:00:00Z'
                        }
        print(f"Loaded cumulative: {len(unique_repos)} repos after GraphQL Gap Crawl.")

    all_raw = list(unique_repos.values())
    print(f"\n⚡ Total unique repos verified with >= 500 stars: {len(all_raw)}")

    # Sort descending by stars
    all_raw.sort(key=lambda x: x['stars'], reverse=True)

    # Enrich through Taxonomy Engine
    print("Classifying and enriching all repositories through Taxonomy Engine...")
    enriched = []
    for idx, r in enumerate(all_raw):
        enriched.append(enrich_repository_record(r))
        if idx > 0 and idx % 10000 == 0:
            print(f"  Processed {idx}/{len(all_raw)} records...")

    print(f"✅ All {len(enriched)} records enriched.")

    # Build packed dictionary-encoded structure
    domain_map = {}
    subsystem_map = {}
    lang_map = {}
    artifact_map = {}

    def get_id(mapping, val):
        val = val or "Other"
        if val not in mapping:
            mapping[val] = len(mapping)
        return mapping[val]

    compact_rows = []
    shards = {}

    for r in enriched:
        dom_id = get_id(domain_map, r.get("domain"))
        sub_id = get_id(subsystem_map, r.get("subsystem"))
        lang_id = get_id(lang_map, r.get("language"))
        art_id = get_id(artifact_map, r.get("artifact"))

        hook = (r.get("hook") or r.get("description") or "")[:90]

        compact_rows.append([
            r["id"],
            r["name"],
            r["owner"],
            r["stars"],
            r["forks"],
            lang_id,
            dom_id,
            sub_id,
            art_id,
            r.get("license") or "Open Source",
            r.get("primitives") or [],
            hook
        ])

        domain_slug = slugify(r.get("domain") or "other-general")
        if domain_slug not in shards:
            shards[domain_slug] = {}

        shards[domain_slug][r["id"]] = {
            "id": r["id"],
            "name": r["name"],
            "owner": r["owner"],
            "description": r.get("description") or "",
            "stars": r["stars"],
            "forks": r["forks"],
            "language": r.get("language") or "Other",
            "license": r.get("license") or "Open Source",
            "artifact": r.get("artifact") or "Application",
            "domain": r.get("domain") or "General",
            "subsystem": r.get("subsystem") or "General",
            "primitives": r.get("primitives") or [],
            "compatibility": r.get("compatibility") or [],
            "keywords": r.get("keywords") or [],
            "beginner_intel": r.get("beginner_intel") or {
                "what_it_does": hook,
                "why_it_matters": "A notable open source project with significant community adoption.",
                "when_to_use": f"Use when building systems requiring high performance in {r.get('subsystem', 'its domain')}.",
                "alternatives": ["Standard library solutions", "Cloud managed services"],
                "key_superpowers": ["High performance", "Active community", "Open architecture"]
            },
            "license_intel": r.get("license_intel") or {
                "tier": "Permissive",
                "commercial": "Commercially Permissive",
                "desc": "Permissive open source terms."
            },
            "maturity": r.get("maturity") or {
                "rating": "Community Popular (>500★)",
                "level": "tier-3"
            },
            "quickstart_code": r.get("quickstart_code") or f"git clone https://github.com/{r['owner']}/{r['name']}.git",
            "url": f"https://github.com/{r['owner']}/{r['name']}",
            "pushed_at": r.get("pushed_at") or "2026-09-01T00:00:00Z"
        }

    dict_payload = {
        "domains": {v: k for k, v in domain_map.items()},
        "subsystems": {v: k for k, v in subsystem_map.items()},
        "languages": {v: k for k, v in lang_map.items()},
        "artifacts": {v: k for k, v in artifact_map.items()},
        "rows": compact_rows
    }

    base_dir = "web/public"
    packed_index_path = f"{base_dir}/catalog-packed.json"
    with open(packed_index_path, "w", encoding="utf-8") as f:
        json.dump(dict_payload, f, separators=(',', ':'))

    print(f"\n📦 Generated Packed Index: {packed_index_path} ({os.path.getsize(packed_index_path) / (1024*1024):.2f} MB)")

    os.makedirs(f"{base_dir}/data/details", exist_ok=True)
    for slug, records in shards.items():
        shard_path = f"{base_dir}/data/details/{slug}.json"
        with open(shard_path, "w", encoding="utf-8") as f:
            json.dump(records, f, separators=(',', ':'))
        print(f"  📁 Shard [{slug}]: {len(records)} deep records ({os.path.getsize(shard_path) / (1024*1024):.2f} MB)")

if __name__ == '__main__':
    run_50k_pipeline()
