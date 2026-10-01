---
title: "Scan of the week: pydantic-ai — when the scanner flags its own defense"
description: "Nox scanned pydantic/pydantic-ai at commit 06ba88f: 1,502 findings, 89% test/CI noise, 0 true positives — and one rule fired on the most careful SSRF protection we've seen."
publishedAt: 2026-10-01
author: nox-hq
tags: [scan-of-the-week, ai-security, false-positives, precision]
---

Every two weeks we point Nox at one open-source AI project and report what we
find — honestly, including our own false positives. This week:
[`pydantic/pydantic-ai`](https://github.com/pydantic/pydantic-ai), the type-safe
Python AI agent framework, at commit `06ba88f`.

Headline number first:

> **`nox scan .` → 1,502 findings.**

At this point in the series, that number should look familiar. Here is what it
actually means.

## 89% is tests and CI

Of the 1,502 findings, **1,337** land in `tests/` or `.github/`. The split:

| Location | Findings | Dominant noise source |
|---|---|---|
| `tests/models/` | 541 | VCR cassettes (1,220 YAML files) |
| `.github/workflows/` | 431 | IAC rules on agentic CI lock files |
| `tests/realtime/`, `tests/cassettes/`, `tests/harness/` | 267 | More cassettes |

The `tests/models/` tree holds 200 MB of YAML cassette recordings of real API
interactions. Anthropic's web-search tool returns `encrypted_content` blobs — base64
strings several kilobytes long — and entropy detectors field-day on them, producing
200 SEC-055 "Cargo Registry Token" hits per cassette batch. None of those blobs is a
token; they are opaque API-side search result ciphertext.

The `.github/workflows/` noise comes from the
[gh-aw](https://github.com/github/gh-aw) agentic CI lock files
(`*.lock.yml`). These generated workflows use `continue-on-error: true` on almost
every step (354 IAC-018 hits) because agentic jobs are designed to keep running past
individual failures. IAC-308 fires on `workflow_dispatch` triggers that exist so
engineers can kick jobs manually. All expected, all noise in this context.

The recommended `.nox.yaml` for this repo:

```yaml
scan:
  exclude:
    - "tests/**/*.yaml"          # VCR cassettes
    - "tests/**/*.yml"
    - ".github/workflows/*.lock.yml"  # gh-aw generated files
```

## The production findings: 165 total, 0 true positives

After stripping test/CI noise, 165 findings remain across the production source
trees. We opened the source at every high and critical location.

### The irony award: MCP-018 fires on the SSRF blocklist

`pydantic_ai/_ssrf.py` is one of the most carefully written security modules we have
seen in this series. It maintains an explicit blocklist of cloud metadata service IP
addresses — AWS IMDS (`169.254.169.254`), Azure WireServer (`168.63.129.16`),
Alibaba Cloud (`100.100.100.200`), GCP, Scaleway, Oracle, ECS credential endpoints —
and blocks any outbound HTTP request that resolves to one of them, even when
`allow_local=True` bypasses the private-range checks.

Nox's **MCP-018** rule ("MCP server references a cloud metadata endpoint (SSRF
target)") fired three times — on the file that *prevents* SSRF. The rule pattern
matches the endpoint IP addresses themselves, not outbound connection attempts to
them. A blocklist is the right defense; listing it is not a risk.

This is a precision bug in MCP-018. The rule should check for code that *connects
to* these endpoints, not for code that *enumerates them in a deny list*. We are
tracking this fix.

### SEC-860 calls model names API keys

`pydantic_ai/models/_known_model_names.py` is a large catalog of known provider
model strings in the format `'provider:model-name'` — `'xai:grok-4'`,
`'xai:grok-4-0709'`, etc. The `xai:` provider prefix matches the pattern Nox uses
to detect xAI API keys, producing two HIGH "Detected xAI API Key" findings in a
file that contains no secrets whatsoever.

The fix requires tightening the SEC-860 pattern to require entropy characteristics
and positional context (assignment to a variable named `*key*`, `*token*`, `*api*`)
rather than matching any string containing the prefix.

### VARIANT-002 flags the CVE-2020-14343 fix

`skills/_loader.py` in `pydantic_ai_harness` parses YAML frontmatter using
`yaml.load(frontmatter, Loader=UniqueKeyLoader)` where `UniqueKeyLoader` extends
`yaml.BaseLoader`. CVE-2020-14343 is about `yaml.FullLoader` and `yaml.Loader`
allowing arbitrary Python object construction. The fix is to use `SafeLoader` or
`BaseLoader` — which is exactly what this code does.

Nox's VARIANT-002 rule flags `yaml.load()` calls regardless of the `Loader`
argument. It should walk the class hierarchy: `BaseLoader` and `SafeLoader` are
safe; `FullLoader`, `Loader`, and `UnsafeLoader` are not. We are tracking this fix.

### SLOP-001 doesn't climb the pyproject.toml tree

The `src/pydantic_clai2/` package imports `termflow` (37 hits) and
`src/pydantic_ai_harness/` imports packages like `opentelemetry` in scoped plugins.
SLOP-001 ("possible slopsquatting") fires because it looks for the package name in
the nearest `pyproject.toml` — but `termflow` is declared in
`src/pydantic_clai2/pyproject.toml`, which is in a parent directory of the file
doing the import. The monorepo layout confuses the lookup; the package is real and
is declared. False positive, monorepo-aware path traversal needed.

### The other high/critical findings at a glance

| Rule | Count | Verdict |
|---|---|---|
| MCP-011 (tool-poisoning) | 2 critical | FP: fires on `Authorization: Bearer {token}` in model-discovery functions, not MCP tool descriptions |
| SEC-073 (DB connection string) | 2 critical | FP: `postgres:postgres@localhost:54320` — dev placeholder in examples |
| AI-034 (forced tool calls) | 7 high | FP: model adapter code mapping `tool_choice='required'` to provider APIs — intended framework feature |
| AI-011 (unrestricted tool access) | 6 high | FP: `CodeMode(tools='all')` in documentation and README examples |
| AI-002 (prompt injection) | 1 high | FP: compaction module intentionally builds summaries from conversation history |
| SEC-801/803 (API key) | 2 high | FP: `"awf-anthropic-proxy"` / `"awf-copilot-proxy"` — explicit proxy placeholders |
| VARIANT-002 (PyYAML) | 1 high | FP: `BaseLoader` is the safe loader, per above |
| TAINT-AI-001 (taint) | 1 high | FP: taint flow incorrectly follows env vars into a hardcoded GCS URI constant |
| CRYPTO-001 (SHA1) | 2 medium | FP: `hashlib.sha1(x, usedforsecurity=False)` — content ID, 6 hex chars, not crypto |

### AI-031: the shell-execution documentation tax

25 low-severity AI-031 ("AI agent has shell execution capabilities") findings land
in `.md` files — README, skill references, docs. All of them are documentation
examples showing how the `Shell` capability is used. The rule fires on markdown
code blocks containing `Shell()` or `shell` configurations. Documentation is not a
live capability. The right fix is to scope AI-031 to Python source files, not
prose.

## Nothing to disclose

No leaked credential, no exploitable code path, no live secret, no vulnerability in
pydantic-ai's own code requiring coordinated disclosure. The project ships an SSRF
module that most AI frameworks don't even have, uses `usedforsecurity=False`
correctly on its non-security SHA1 call, and pins every GitHub Action to a full
commit SHA. Clean bill of health.

## What this scan taught us

pydantic-ai is the best-defended target in this series to date. The three most
actionable findings are bugs in Nox's own rules:

1. **MCP-018** should detect connection attempts, not blocklist entries.
2. **VARIANT-002** should walk the YAML Loader class hierarchy before firing.
3. **SEC-860** needs entropy + assignment-context gating to avoid hitting model-name catalogs.

Run it on your own project:

```sh
nox scan . --offline
```

Nox is open source (Apache-2.0): <https://github.com/nox-hq/nox>.
