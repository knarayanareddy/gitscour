"""W3 §2.1/2.4/2.8 — search index, edges, and facets builders.

Covers the keep-rules (name/owner df==1 kept, body-only df==1 dropped,
stop-word cap), delta-ordinal roundtrip, deterministic output, match-count-first
ranking, edges invariants (no self-edges, >=1 edge per row, General* never
scored), and facet counts against a recount.
"""

import json
import math
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pipeline"))

import facets as facets_mod  # noqa: E402
import neighbors  # noqa: E402
import search_index as si  # noqa: E402


def make_records(n=30):
    """Deterministic fixture large enough for the df cap (n // 10) to be > 1."""
    recs = []
    for i in range(n):
        recs.append({
            "id": 1000 + i,
            "name": f"tool-{i}" if i % 3 else "shared-name",
            "owner": "acme" if i % 5 else "singleton-owner-unique",
            "stars": 1000 - i * 10,
            "forks": i,
            "language": "Rust" if i % 2 else "Python",
            "domain": "Developer Tooling & Compilers" if i % 2 else "Databases & Storage",
            "subsystem": "General Components" if i % 4 == 0 else f"Sub-{i % 6}",
            "artifact": "Library / SDK",
            "license": "MIT License",
            "primitives": ["simd"] if i % 3 == 0 else [],
            "hook": "A fast query engine for analytics workloads" if i % 2 else "",
            "description": "A fast query engine for analytics workloads",
            "topics": ["vector-search"] if i % 4 == 1 else ([] if i % 7 else ["sql", "olap"]),
            "compatibility": ["PostgreSQL Compatible"] if i % 5 == 2 else [],
            "domain_margin": i % 9,
        })
    return recs


class SearchIndexTest(unittest.TestCase):
    def test_keep_rules(self):
        # n=30 -> df cap is 3, so keep-rule assertions need LOW-df tokens:
        # distinct per-row name tokens (df==1, name-owned) and a body token
        # present in exactly 2 rows (df==2, kept), while a body token in
        # 4 rows would exceed the cap and drop.
        recs = make_records()
        for i, r in enumerate(recs):
            r["name"] = f"uniqueowner{i}tool"
        recs[0]["description"] = recs[0]["hook"] = "twinword sharedbodytoken"
        recs[1]["description"] = recs[1]["hook"] = "twinword other"
        for r in recs[2:6]:
            r["description"] = r["hook"] = "exceedcapword text"
        idx = si.build_search_index(recs)
        tokens = set(idx["t"])
        self.assertIn("uniqueowner7tool", tokens)  # name-owned, df==1
        self.assertIn("uniqueowner9tool", tokens)
        self.assertIn("twinword", tokens)          # body df==2
        self.assertNotIn("sharedbodytoken", tokens)  # body df==1 → noise, dropped
        self.assertNotIn("exceedcapword", tokens)  # df==4 > cap==3
        self.assertNotIn("other", tokens)          # body df==1

    def test_stopword_cap(self):
        # n=30 -> cap = 3; a token in every row exceeds it and drops
        recs = make_records()
        for r in recs:
            r["description"] = r["hook"] = "omnipresent fillerword text"
        idx = si.build_search_index(recs)
        self.assertNotIn("omnipresent", set(idx["t"]))
        self.assertNotIn("fillerword", set(idx["t"]))
        # but an omnipresent NAME token over the cap also drops (df rule)
        for r in recs:
            r["name"] = "shared"
        idx = si.build_search_index(recs)
        self.assertNotIn("shared", set(idx["t"]))

    def test_delta_roundtrip_and_range(self):
        recs = make_records()
        idx = si.build_search_index(recs)
        n = len(recs)
        for ti, tok in enumerate(idx["t"]):
            pairs = idx["p"][ti]
            self.assertEqual(len(pairs) % 2, 0, tok)
            pos, last = 0, -1
            while pos < len(pairs):
                last = pairs[0] if pos == 0 else last + pairs[pos]
                self.assertTrue(0 <= last < n, f"{tok}: ordinal {last} out of range")
                code = pairs[pos + 1]
                self.assertTrue(0 <= (code & 0x3FF) < (1 << len(si.FIELDS)))
                pos += 2
            # ascending ordinals (delta encoding assumes doc-order scan)
            ords, pos, last = [], 0, -1
            while pos < len(pairs):
                last = pairs[0] if pos == 0 else last + pairs[pos]
                ords.append(last)
                pos += 2
            self.assertEqual(ords, sorted(ords), tok)

    def test_deterministic_output(self):
        recs = make_records()
        a = si.build_search_index(recs)
        b = si.build_search_index(list(reversed(list(reversed(recs)))))
        self.assertEqual(a["t"], b["t"])
        self.assertEqual(a["d"], b["d"])
        self.assertEqual(a["p"], b["p"])

    def test_df_matches_postings(self):
        recs = make_records()
        idx = si.build_search_index(recs)
        for ti, tok in enumerate(idx["t"]):
            self.assertEqual(idx["d"][ti], len(idx["p"][ti]) // 2, tok)

    def test_query_match_count_first(self):
        # rows matching BOTH tokens must outrank any single-token row,
        # regardless of how strong the single-token score is. Token dfs stay
        # under the cap (n=30 -> 3): sql in rows 0+2, vector in rows 0+1.
        recs = make_records()
        for r in recs:                                  # clear fixture topics (they blow the df cap)
            r["topics"] = []
        recs[0]["topics"] = ["sql", "vector"]          # both, low stars
        recs[1]["topics"] = ["vector"]                  # single, but huge stars
        recs[2]["topics"] = ["sql"]                     # single, low stars
        recs[1]["name"] = "vector"                      # single-token row, name tf
        recs[1]["stars"] = 99999
        idx = si.build_search_index(recs)
        stars = [r["stars"] for r in recs]
        ranked = [o for o, _ in si.query_search_index(idx, "sql vector", stars)]
        self.assertIn(0, ranked)
        self.assertIn(1, ranked)
        self.assertLess(ranked.index(0), ranked.index(1))

    def test_query_deterministic_and_empty(self):
        recs = make_records()
        idx = si.build_search_index(recs)
        stars = [r["stars"] for r in recs]
        a = si.query_search_index(idx, "fast rust", stars)
        b = si.query_search_index(idx, "fast rust", stars)
        self.assertEqual(a, b)
        self.assertEqual(si.query_search_index(idx, "", stars), [])
        self.assertEqual(si.query_search_index(idx, "unfindabletoken", stars), [])

    def test_write_search_index_roundtrip(self):
        recs = make_records()
        with tempfile.TemporaryDirectory() as tmp:
            size = si.write_search_index(recs, tmp)
            path = os.path.join(tmp, "search-index.json")
            self.assertTrue(os.path.exists(path))
            self.assertEqual(os.path.getsize(path), size)
            with open(path, encoding="utf-8") as fh:
                idx = json.load(fh)
            self.assertEqual(idx["n"], len(recs))


class EdgesTest(unittest.TestCase):
    def test_invariants(self):
        recs = make_records()
        data = neighbors.build_edges(recs)
        edges = data["edges"]
        self.assertEqual(len(edges), len(recs))
        for i, lst in enumerate(edges):
            self.assertGreaterEqual(len(lst), 1, f"row {i} has no edge")
            self.assertLessEqual(len(lst), neighbors.K)
            for j, w in lst:
                self.assertNotEqual(j, i, "self-edge")
                self.assertTrue(0 < w <= 1, f"weight {w} outside (0,1]")
        rep = data["report"]
        self.assertEqual(rep["min_degree"], 8)
        # The <=25% bucket gate runs against the REAL catalog in smoke-test.mjs
        # (19.7% measured); this tiny fixture has only 6 subsystems so its
        # endpoint distribution is naturally lumpier — sanity level only.
        self.assertLessEqual(rep["top_bucket"]["pct"], 50.0)

    def test_general_subsystem_not_scored(self):
        def row(i, subsystem, language, artifact):
            return {
                "id": 1000 + i, "name": f"r{i}", "owner": "o", "stars": 500 + i,
                "language": language, "domain": "Other / General",
                "subsystem": subsystem, "artifact": artifact,
                "primitives": [], "topics": [], "compatibility": [],
            }

        # A: two rows sharing a REAL subsystem score above the fallback
        real = neighbors.build_edges([row(0, "Container Orchestration", "Go", "CLI Tool"),
                                      row(1, "Container Orchestration", "Rust", "Game Engine")])
        self.assertGreater(real["edges"][0][0][1], neighbors.FALLBACK_WEIGHT)

        # B: identical rows whose only shared group is a General* subsystem —
        # General* contributes 0 similarity, so no candidate pair exists and
        # every edge is the ordinal-window fallback at exactly 0.1
        gen = neighbors.build_edges([row(0, "General Components", "Cobol", "CLI Tool"),
                                     row(1, "General Components", "Erlang", "Game Engine")])
        self.assertEqual(gen["edges"][0][0][1], neighbors.FALLBACK_WEIGHT)
        self.assertEqual(gen["edges"][1][0][1], neighbors.FALLBACK_WEIGHT)

    def test_deterministic(self):
        recs = make_records()
        a = neighbors.build_edges(recs)
        b = neighbors.build_edges(recs)
        self.assertEqual(a["edges"], b["edges"])
        self.assertEqual(a["report"], b["report"])


class FacetsTest(unittest.TestCase):
    def test_counts_match_recount(self):
        recs = make_records()
        f = facets_mod.build_facets(recs)
        self.assertEqual(f["total"], len(recs))
        from collections import Counter
        recount = Counter(r["domain"] for r in recs)
        got = {x["name"]: x["count"] for x in f["domains"]}
        self.assertEqual(got, dict(recount))
        # subsystem entries carry their domain parent
        for item in f["subsystems"]:
            self.assertIn("domain", item)
        self.assertGreater(len(f["languages"]), 0)
        self.assertGreater(len(f["topics"]), 0)

    def test_topics_only_counts_real_topics(self):
        recs = make_records()
        f = facets_mod.build_facets(recs)
        topic_names = {x["name"] for x in f["topics"]}
        self.assertIn("vector-search", topic_names)
        self.assertIn("sql", topic_names)
        self.assertNotIn("", topic_names)


if __name__ == "__main__":
    unittest.main()
