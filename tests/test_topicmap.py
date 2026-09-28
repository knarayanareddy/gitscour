"""W4 §3.5 — topic co-occurrence map + per-domain topic counts."""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pipeline"))

import facets as facets_mod  # noqa: E402
from topicmap import build_topic_map, write_topic_map  # noqa: E402


def make_records(n=80):
    """Deterministic fixture with well-defined topic frequencies.

    rows 0..39  -> topics ['llm', 'agents']       (pair 40)
    rows 40..64 -> topics ['llm', 'rag']          (llm df 65, rag df 25, pair 25)
    rows 65..79 -> topics ['obscure']             (df 15 — below min_count)
    """
    recs = []
    for i in range(n):
        if i < 40:
            topics = ["llm", "agents"]
        elif i < 65:
            topics = ["llm", "rag"]
        else:
            topics = ["obscure"]
        recs.append({
            "id": 1000 + i, "name": f"r{i}", "owner": "o", "stars": 500 + i,
            "domain": "AI & Machine Learning" if i % 2 else "Databases & Storage",
            "subsystem": "Agents", "language": "Python",
            "primitives": [], "compatibility": [],
            "topics": topics,
        })
    return recs


class TopicMapTest(unittest.TestCase):
    def test_df_and_pair_floors(self):
        data = build_topic_map(make_records())  # min_count=25, min_pair=10
        names = [t["name"] for t in data["topics"]]
        self.assertIn("llm", names)
        self.assertIn("agents", names)
        self.assertIn("rag", names)
        self.assertNotIn("obscure", names)      # df 15 < 25
        by_name = {t["name"]: t for t in data["topics"]}
        self.assertEqual(by_name["llm"]["count"], 65)
        self.assertEqual(by_name["agents"]["count"], 40)
        # llm-agents pair = 40, llm-rag = 25, agents-rag = 0 (never co-occur)
        llm_edges = {e[0]: e[1] for e in by_name["llm"]["edges"]}
        self.assertEqual(llm_edges.get("agents"), 40)
        self.assertEqual(llm_edges.get("rag"), 25)
        self.assertNotIn("obscure", llm_edges)
        agent_targets = {e[0] for e in by_name["agents"]["edges"]}
        self.assertNotIn("rag", agent_targets)

    def test_pair_floor(self):
        # drop the llm-rag rows to 0 and the llm-agents overlap to 30, then
        # prove the pair floor can exclude a topic that passes the df floor
        recs = make_records()
        for i in range(40, 65):
            recs[i]["topics"] = ["llm"]        # rag gone; llm df stays 65
        for i in range(30, 40):
            recs[i]["topics"] = ["llm"]        # llm-agents co-occurrence -> 30
        data = build_topic_map(recs)
        by_name = {t["name"]: t for t in data["topics"]}
        self.assertEqual(by_name["agents"]["count"], 30)   # df 30 >= 25
        self.assertEqual({e[0]: e[1] for e in by_name["llm"]["edges"]}["agents"], 30)
        strict = build_topic_map(recs, min_pair=35)        # pair 30 < 35 -> edge gone
        strict_by = {t["name"]: t for t in strict["topics"]}
        self.assertEqual(strict_by["llm"]["edges"], [])
        self.assertEqual(strict_by["agents"]["edges"], [])

    def test_ordering_and_shape(self):
        data = build_topic_map(make_records())
        counts = [t["count"] for t in data["topics"]]
        self.assertEqual(counts, sorted(counts, reverse=True))
        for t in data["topics"]:
            edge_counts = [e[1] for e in t["edges"]]
            self.assertEqual(edge_counts, sorted(edge_counts, reverse=True))
            self.assertLessEqual(len(t["edges"]), 10)
        self.assertEqual(data["min_count"], 25)
        self.assertEqual(data["min_pair"], 10)

    def test_deterministic(self):
        a = build_topic_map(make_records())
        b = build_topic_map(list(reversed(make_records())))
        self.assertEqual(a, b)

    def test_empty_shape(self):
        data = build_topic_map([{"topics": []} for _ in range(10)])
        self.assertEqual(data["topics"], [])
        self.assertEqual(data["pairs_considered"], 0)

    def test_write_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            size = write_topic_map(make_records(), tmp)
            path = os.path.join(tmp, "topic-map.json")
            self.assertEqual(os.path.getsize(path), size)
            with open(path, encoding="utf-8") as fh:
                loaded = json.load(fh)
            self.assertEqual(loaded, build_topic_map(make_records()))


class TopicsByDomainTest(unittest.TestCase):
    def test_counts_by_domain(self):
        recs = make_records()
        f = facets_mod.build_facets(recs)
        tbd = f["topics_by_domain"]
        self.assertEqual(sorted(tbd.keys()),
                         ["AI & Machine Learning", "Databases & Storage"])
        global_counts = {x["name"]: x["count"] for x in f["topics"]}
        for dom, entries in tbd.items():
            for e in entries:
                self.assertLessEqual(e["count"], global_counts.get(e["name"], 0), dom)
                self.assertGreater(e["count"], 0)
        for dom in tbd:
            names = [e["name"] for e in tbd[dom]]
            self.assertIn("llm", names)

    def test_domains_without_topics_absent(self):
        recs = make_records()
        for r in recs:
            r["topics"] = []
        f = facets_mod.build_facets(recs)
        self.assertEqual(f["topics_by_domain"], {})
        self.assertEqual(f["topics"], [])


if __name__ == "__main__":
    unittest.main()
