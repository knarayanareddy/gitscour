"""Shared Tier-2 partition naming; keep in sync with web/src/catalog-shards.mjs."""

import re

TARGET_ROWS = 12_000
MAX_SHARD_BYTES = 48 * 1024 * 1024


def slugify(text):
    text = (text or 'other-general').lower().replace('&', 'and')
    return re.sub(r'[^a-z0-9]+', '-', text).strip('-') or 'other-general'


def part_count(rows):
    """Power-of-two fanout keeps layout stable across ordinary catalog growth."""
    return 1 << (max(0, rows - 1) // TARGET_ROWS).bit_length()


def shard_name(slug, repo_id, parts):
    count = parts.get(slug, 1)
    return f'{slug}--{repo_id % count}' if count > 1 else slug
