"""Tests for authoritative metadata refresh and public-only reconciliation."""

import io
import json
import sys
import unittest
import urllib.error
from collections import Counter
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))

from harvest_enumerate import Limiter  # noqa: E402
from rebuild_catalog import attach_deep, merge_live_record  # noqa: E402
from reconcile_stale_rows import resolve  # noqa: E402


class RefreshTest(unittest.TestCase):
    def test_live_empty_metadata_wins_over_shard(self):
        catalog = {'test/repo': {'id': 17}}
        attach_deep(catalog, {17: {'description': 'stale', 'topics': ['old'],
                                   'pushed_at': '2026-09-25', 'is_archived': False,
                                   'beginner_intel': {'what_it_does': 'Curated'}}})
        merge_live_record(catalog, {'owner': 'Test', 'name': 'Repo', 'id': 99,
                                    'stars': 700, 'forks': 14, 'description': '', 'topics': [],
                                    'pushed_at': None, 'is_archived': True}, Counter())
        row = catalog['test/repo']
        self.assertEqual(row['id'], 17)
        self.assertEqual(row['full_name'], 'Test/Repo')
        self.assertEqual(row['description'], '')
        self.assertEqual(row['topics'], [])
        self.assertEqual(row['license'], 'Unknown')
        self.assertIsNone(row['pushed_at'])
        self.assertTrue(row['is_archived'])
        self.assertEqual(row['beginner_intel']['what_it_does'], 'Curated')

    def test_reconciliation_does_not_publish_private_repository(self):
        body = {'private': True, 'stargazers_count': 1000, 'name': 'repo'}
        with patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(body).encode())):
            self.assertEqual(resolve('test-token', 'test/repo', 500, Limiter(0))['verdict'], 'blocked')

    def test_auth_error_cannot_be_a_drop(self):
        failure = urllib.error.HTTPError('https://api.github.com/', 401, 'Unauthorized', {}, None)
        with patch('urllib.request.urlopen', side_effect=failure):
            self.assertEqual(resolve('test-token', 'test/repo', 500, Limiter(0))['verdict'], 'error')
