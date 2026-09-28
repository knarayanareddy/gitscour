import os
import sys
import json
import re

def slugify(text: str) -> str:
    text = text.lower().replace('&', 'and')
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')

def build_ultra_compact_dataset(base_dir: str = "web/public"):
    index_file = f"{base_dir}/catalog-index.json"
    if not os.path.exists(index_file):
        return

    with open(index_file, "r", encoding="utf-8") as f:
        repos = json.load(f)

    print(f"Optimizing {len(repos)} repositories into ultra-compact representation...")

    # Dictionary encoding maps
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

    for r in repos:
        dom_id = get_id(domain_map, r.get("domain"))
        sub_id = get_id(subsystem_map, r.get("subsystem"))
        lang_id = get_id(lang_map, r.get("language"))
        art_id = get_id(artifact_map, r.get("artifact"))

        # Truncate hook to 80 chars for ultra-compact preview
        hook = (r.get("hook") or r.get("description") or "")[:90]

        # Compact tuple/list: [id, name, owner, stars, forks, lang_id, dom_id, sub_id, art_id, lic, prims, hook]
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

        # Deep shard record
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
                "when_to_use": f"Use when building systems that require high performance in {r.get('subsystem', 'its domain')}.",
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

    # Invert mappings for client decompression: {id: name}
    dict_payload = {
        "domains": {v: k for k, v in domain_map.items()},
        "subsystems": {v: k for k, v in subsystem_map.items()},
        "languages": {v: k for k, v in lang_map.items()},
        "artifacts": {v: k for k, v in artifact_map.items()},
        "rows": compact_rows
    }

    packed_index_path = f"{base_dir}/catalog-packed.json"
    with open(packed_index_path, "w", encoding="utf-8") as f:
        json.dump(dict_payload, f, separators=(',', ':'))

    print(f"✅ Generated Packed Index: {packed_index_path} ({os.path.getsize(packed_index_path) / 1024:.1f} KB)")

    # Save deep detail shards
    os.makedirs(f"{base_dir}/data/details", exist_ok=True)
    for slug, records in shards.items():
        shard_path = f"{base_dir}/data/details/{slug}.json"
        with open(shard_path, "w", encoding="utf-8") as f:
            json.dump(records, f, separators=(',', ':'))
        print(f"  📁 Shard [{slug}]: {len(records)} deep records ({os.path.getsize(shard_path) / 1024:.1f} KB)")

if __name__ == "__main__":
    build_ultra_compact_dataset()
