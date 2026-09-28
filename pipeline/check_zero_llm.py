#!/usr/bin/env python3
"""Zero-LLM guardrail (W5 section 5): fail if any scanned source file wires up
an LLM provider SDK.

The standing project constraint is that every feature ships deterministic and
rule-based with zero model calls.  This scanner makes that constraint *enforced*
rather than documented: both CI workflows run it beside ``verify_catalog``.

Design notes
------------
* Only **call / import / site** forms are matched (constructor calls, provider
  SDK import lines, API host names).  Static lexicons legitimately *name*
  providers — e.g. the compatibility rules and taxonomy term lists — and those
  strings never match call forms, so data can keep its words while executable
  wiring cannot.
* Scanned trees: ``pipeline/``, ``web/src/``, ``tests/`` (``*.py, *.js,
  *.jsx, *.mjs``).  The scanner scans itself too — adding a provider call here
  would fail its own gate.
* Exit codes: 0 = clean, 1 = violations found, 2 = bad usage.

Extending: add another alternative to RULES; keep each rule self-safe (the
pattern must not match its own source line) or this file trips its own gate.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Iterable, List, NamedTuple

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ROOTS = ("pipeline", "web/src", "tests")
SUFFIXES = (".py", ".js", ".jsx", ".mjs")
SKIP_DIRS = {"__pycache__", "node_modules", "dist", ".git", "legacy"}


class Violation(NamedTuple):
    path: str
    lineno: int
    rule: str
    snippet: str


RULES = (
    # Provider SDK import lines (python and JS both spell these two ways).
    ("sdk-import", re.compile(
        r"\b(?:import|from)\s+(?:openai|anthropic|langchain|google\.generativeai)\b"
        r"|\brequire\(\s*['\"](?:openai|anthropic)['\"]\s*\)"
        r"|\bimport\s*\(\s*['\"](?:openai|anthropic)['\"]\s*\)"
    )),
    # Provider client constructors: provider_client = ...Provider(...)
    ("sdk-constructor", re.compile(r"\b(?:OpenAI|Anthropic)\s*\(")),
    # Direct LLM HTTP APIs / gateways.
    ("llm-api-call", re.compile(r"\bllm_api\s*\(")),
    ("provider-site", re.compile(
        r"api\.openai\.com|api\.anthropic\.com|generativelanguage\.|"
        r"generativeai\.googleapis\.com"
    )),
)


def scan_text(text: str, name: str = "<memory>") -> List[Violation]:
    """Scan one text blob; returns every rule hit with line numbers."""
    hits: List[Violation] = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        for rule, pattern in RULES:
            match = pattern.search(line)
            if match:
                hits.append(Violation(name, lineno, rule, line.strip()[:120]))
    # One hit per line is enough signal; later rules add nothing.
    return _dedupe_first_rule(hits)


def _dedupe_first_rule(hits: List[Violation]) -> List[Violation]:
    seen = set()
    out = []
    for v in hits:
        key = (v.path, v.lineno)
        if key in seen:
            continue
        seen.add(key)
        out.append(v)
    return out


def iter_source_files(paths: Iterable[Path]) -> Iterable[Path]:
    for path in paths:
        if path.is_file():
            if path.suffix in SUFFIXES:
                yield path
        elif path.is_dir():
            for suffix in SUFFIXES:
                for file in sorted(path.rglob(f"*{suffix}")):
                    if any(part in SKIP_DIRS for part in file.parts):
                        continue
                    yield file


def scan(paths: Iterable[Path]) -> List[Violation]:
    """Scan files/directories (non-existent paths are skipped silently)."""
    violations: List[Violation] = []
    for file in iter_source_files(paths):
        try:
            text = file.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        try:
            display = file.resolve().relative_to(REPO_ROOT)
        except ValueError:
            display = file
        violations.extend(scan_text(text, str(display)))
    return violations


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Fail if scanned sources wire up an LLM provider SDK (zero-LLM guardrail)."
    )
    parser.add_argument(
        "paths", nargs="*",
        help=f"files or directories to scan (default: {', '.join(DEFAULT_ROOTS)})",
    )
    args = parser.parse_args(argv)
    if args.paths:
        targets = [Path(p) for p in args.paths]
    else:
        targets = [REPO_ROOT / root for root in DEFAULT_ROOTS]

    violations = scan(targets)
    if violations:
        print(f"zero-LLM guardrail FAILED: {len(violations)} provider call site(s):")
        for v in violations:
            print(f"  {v.path}:{v.lineno}: [{v.rule}] {v.snippet}")
        return 1
    checked = sum(1 for _ in iter_source_files(targets))
    print(f"zero-LLM guardrail clean: {checked} files scanned, "
          f"{len(RULES)} call-form rules, no provider SDK usage.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
