import os
import sys
import csv
import json
import io
import time
import subprocess
from typing import List, Dict, Any

sys.path.append(os.path.dirname(__file__))
from taxonomy_engine import enrich_repository_record
from shard_manager import build_sharded_dataset

def fetch_language_csv(filename: str) -> List[Dict[str, Any]]:
    """Fetches high-star repositories from the authoritative kstars dataset."""
    cmd = [
        "gh", "api",
        "-H", "Accept: application/vnd.github.raw+json",
        f"repos/luizvbo/kstars/contents/data/processed/{filename}"
    ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15)
        if proc.returncode != 0:
            return []
        
        reader = csv.DictReader(io.StringIO(proc.stdout))
        items = []
        for row in reader:
            try:
                repo_url = row.get("Repo URL") or ""
                parts = repo_url.strip("/").split("/")
                if len(parts) >= 2:
                    owner = parts[-2]
                    name = parts[-1]
                else:
                    name = row.get("Project Name") or ""
                    owner = ""

                stars_raw = row.get("Stars") or "0"
                stars = int(float(stars_raw.replace(",", "")))
                if stars < 500:
                    continue # Strict >500 star constraint

                forks_raw = row.get("Forks") or "0"
                forks = int(float(forks_raw.replace(",", "")))

                desc = row.get("Description") or ""
                lang = row.get("Language") or filename.replace(".csv", "")

                items.append({
                    "id": abs(hash(f"{owner}/{name}")),
                    "name": name,
                    "owner": owner,
                    "description": desc,
                    "stars": stars,
                    "forks": forks,
                    "language": lang,
                    "license": "Open Source",
                    "topics": [],
                    "pushed_at": row.get("Last Commit") or "2026-09-01T00:00:00Z"
                })
            except Exception:
                continue
        return items
    except Exception as e:
        print(f"Error fetching {filename}: {e}")
        return []

def harvest_20000_scale():
    print("🚀 Starting Multi-Source Scale Harvester for 20,000+ Repositories...")

    # 1. Fetch language files from kstars (up to 1,000 repos per language across 30 languages)
    languages = [
        "Python.csv", "JavaScript.csv", "TypeScript.csv", "Go.csv", "Rust.csv",
        "CPP.csv", "C.csv", "Java.csv", "Shell.csv", "Ruby.csv", "PHP.csv",
        "CSharp.csv", "Swift.csv", "Kotlin.csv", "Dart.csv", "HTML.csv",
        "CSS.csv", "Lua.csv", "Elixir.csv", "Clojure.csv", "Haskell.csv",
        "Scala.csv", "Julia.csv", "R.csv", "PowerShell.csv", "Perl.csv",
        "Objective-C.csv", "ActionScript.csv", "CoffeeScript.csv", "DM.csv"
    ]

    raw_candidates = {}

    # Load existing catalog
    existing_file = "web/public/repos.json"
    if os.path.exists(existing_file):
        try:
            with open(existing_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
            for r in existing:
                raw_candidates[r["id"]] = r
            print(f"Loaded {len(existing)} existing records.")
        except Exception as e:
            print(f"Warning reading existing: {e}")

    # Fetch from kstars
    for idx, lang_file in enumerate(languages, 1):
        items = fetch_language_csv(lang_file)
        new_in_lang = 0
        for item in items:
            key = item["id"]
            if key not in raw_candidates:
                raw_candidates[key] = item
                new_in_lang += 1
        print(f"[{idx}/{len(languages)}] {lang_file}: +{new_in_lang} repos (Total: {len(raw_candidates)})", flush=True)
        time.sleep(0.1)

    print(f"\nProcessing {len(raw_candidates)} total records through Taxonomy Engine...")

    enriched_all = []
    for r in raw_candidates.values():
        if "artifact" in r and "domain" in r and "subsystem" in r:
            enriched_all.append(r)
        else:
            enriched_all.append(enrich_repository_record(r))

    # Sort descending by stars
    enriched_all.sort(key=lambda x: x["stars"], reverse=True)
    print(f"✅ Total enriched repositories: {len(enriched_all)}")

    # Build Tier 1 compact catalog index and Tier 2 sector shards
    build_sharded_dataset(enriched_all, base_dir="web/public")

if __name__ == "__main__":
    harvest_20000_scale()
