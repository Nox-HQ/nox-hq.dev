---
title: "Scan of the week: SWE-agent — 141 findings, 0 to disclose"
description: "Nox scanned princeton-nlp/SWE-agent and returned 141 findings. After triage: mutable CI action tags are real, all four high/critical AI findings are false positives, and the AI-022 misfires led us to withdraw the rule rather than patch it."
publishedAt: 2026-09-15
author: nox-hq
tags: [scan-of-the-week, ai-security, false-positives, precision]
---

Every two weeks we point Nox at one open-source AI project and report what we
find — honestly, including our own false positives. This week:
[`princeton-nlp/SWE-agent`](https://github.com/princeton-nlp/SWE-agent), the
autonomous software engineering agent, at commit `3ea751c`.

> **`nox scan .` → 141 findings.**

That's a manageable number. Here is what it actually means.

## The breakdown

| Family | Count | Notes |
|---|---|---|
| SLOP | 51 | Import-without-manifest checks |
| IAC | 43 | CI/workflow rules |
| AI | 22 | AI-specific rules |
| DATA | 15 | Emails, PII patterns |
| TAINT | 5 | Taint propagation |
| CONT | 3 | Container |
| SEC | 2 | Credentials |

**By file location:**

| Path category | Findings |
|---|---|
| `sweagent/` (production src) | 56 |
| `tests/` | 46 |
| `trajectories/` (demo/replay data) | 19 |
| `.github/workflows/` | 13 |
| `docs/`, `config/` | 7 |

## The SLOP-001 story: 51 import-vs-package-name mismatches

The single largest rule family is SLOP-001 — "imported package not declared in
any dependency manifest." Fifty-one findings. Nearly all are false positives
rooted in the same mismatch: Python package names on PyPI don't always equal
their import names.

SWE-agent declares `swe-rex` in `pyproject.toml`, but the code imports
`swerex`. It declares `ruamel.yaml`, but a module imports `yaml` (provided by
`PyYAML` as a transitive dependency through `litellm`). The scanner saw
`import yaml` and found no `yaml` entry in the manifest — correctly, but not
meaningfully. A `.nox.yaml` exclude list reduces this family to zero:

```yaml
scan:
  exclude:
    - "trajectories/**"
    - "tests/test_data/**"
```

That drops the noise from 141 to around 60 without touching any real signal.

## The IAC-013 findings: five real supply-chain risks

Of the 43 IaC findings, five are `IAC-013` — GitHub Actions pinned to mutable
version tags instead of commit SHAs:

- `actions/checkout@v7`
- `actions/setup-python@v6`
- `sjvrijn/pytest-last-failed@v2`
- `actions/upload-artifact@v7`
- `codecov/codecov-action@v7.0.0`

These are real. A mutable tag means a tag owner can push a new commit and the
next CI run silently picks it up. For a project that runs on public-facing
infrastructure and processes untrusted GitHub issue content, a supply-chain
compromise of any of these actions could reach the agent's execution environment.

This is extremely common — the vast majority of GitHub Actions users pin by
version tag, not SHA. But "common" and "safe" are different things. The fix is
mechanical: `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683`
instead of `@v7`. GitHub's Dependabot handles it automatically.

## The AI findings: four high/critical, all false positives

Twenty-two AI-family findings, four rated high or critical. After opening the
source at every one:

### AI-PI-002 "critical" — trajectory viewer, not an LLM call

```
sweagent/inspector/server.py:52
"messages": [{"role": "system", "content": f"Submission generated - {exit_status}"}]
```

This looks alarming: tainted data flowing into a `system`-role message. But
`inspector/server.py` is SWE-agent's **web-based trajectory viewer** — it reads
saved `.traj` files and renders them in a browser. The `messages` dict it builds
is a display struct for the UI, not a payload sent to any LLM. The taint
analysis correctly identifies data flow into a dict key named `"role": "system"`,
but the sink is a visualization layer, not an API call. **False positive.**

This is a known challenge for taint-based rules: distinguishing between code
that *talks about* LLM message shapes and code that *sends* them. We're tracking
a refinement in the rule that requires a live LLM call site as the final sink.

### AI-002 "high" — debug logger, not a prompt template

```
sweagent/agent/reviewer.py:394
self.logger.debug(f"MODEL INPUT (user)\n{user_message}")
```

The rule fires because an f-string contains `user_message`. But the *actual*
prompt is assembled three lines above (lines 389–393) using
`Template(...).render(...)`. Line 394 is a `logger.debug` call that logs the
already-assembled prompt for inspection. The user content is not being injected
into a new template here — it is being observed after the fact. **False positive.**

### AI-022 "high" × 2 — reasoning model and replay driver

Both firings are on `temperature: 1.0`, which the rule considers too high:

1. `config/benchmarks/250212_sweagent_heavy_sbl.yaml:185` — model is `o1`
   with `reasoning_effort: "high"`. For OpenAI o1/o3 reasoning models,
   temperature=1.0 is the documented default, not a misconfiguration. The
   semantics differ from standard models.
2. `trajectories/demonstrations/str_replace_anthropic_demo.yaml:406` — model
   name is `replay`. The replay driver does not call any LLM; temperature in a
   trajectory file is recorded metadata from a past run.

Both are **false positives** — and this one is **our bug**.

## Why we withdrew the rule instead of patching it

The first fix we drafted added two exclusions to AI-022: suppress when
`reasoning_effort` appears within four lines, and when the model is named
`replay`. Reviewing it against configs the regression test did not cover showed
both were wrong:

- **The line window over-suppressed.** In a multi-model config — the exact shape
  of SWE-agent's benchmark files — an `o1` block's `reasoning_effort` silenced a
  neighbouring `gpt-4` block's `temperature: 1.0`, in either order. Whether a
  temperature belongs to a reasoning model is a question about the YAML block,
  not about line distance.
- **`name: replay` matched one spelling.** `name: "replay"` still fired, and one
  repository's naming convention would have become a global rule.

That pushed the real question forward: is AI-022 a security finding at all? It
reported temperature 0.8–1.0 at **High** as "allowing hallucination". Two
releases earlier, nox had withdrawn AI-041 for flagging temperature above 0.9,
on the grounds that sampling temperature is a tuning property with no
confidentiality, integrity or availability consequence. AI-022 flagged a strict
superset of those values — and 1.0 is the default of the OpenAI and Anthropic
APIs, and the only value o1/o3 accept.

So nox **v1.38.1 withdrew AI-022**, together with three siblings resting on the
same proposition (AI-023, AI-028, AI-037). None of them fires any more, and a
`nox:ignore`, baseline entry or VEX statement naming one now explains the
withdrawal instead of going silent. Re-scanning SWE-agent today produces
neither of the two findings above.

## What about DATA-003 and SEC-457?

Two other high-severity findings are worth naming because they looked alarming on
first read:

- **DATA-003 "high"** in a test trajectory (`tests/test_data/trajectories/…`):
  "Credit card number (Visa/MC)". The "number" is `4935787079994043` — the digits
  of an `execution_time` float (`0.4935787079994043` seconds) with the decimal
  stripped. Timing data in JSON, not a PAN. False positive.

- **SEC-457 "high"** × 2 in `tests/test_data/data_sources/debug_20240322.json`:
  "Detected Iterable API Key". The matched text is a substring of the Django test
  function name `admin_widgets.tests.AdminForeignKeyRawIdWidget_iterable` in a
  SWE-bench problem statement. False positive.

Both illustrate a common source of noise: test fixtures and benchmark datasets
contain strings that match credential patterns by coincidence.

## Nothing to disclose

No leaked credential, no exploitable code path, no true positive security
vulnerability. The five mutable GitHub Actions tags are a real supply-chain
hygiene issue, but they are publicly visible in the repository and require no
coordinated disclosure.

## The honest takeaway

141 findings → 5 real (mutable action tags, low-medium urgency), 0 disclosable.
That is roughly a 96% false-positive rate on this scan — better than many we have
run, but still dominated by SLOP-001 import-name mismatches and test-data
credential pattern collisions.

The one genuine AI-security signal in SWE-agent is what is *absent*: no
AI-006 logging issues in production code, no real prompt injection in the core
agent loop, no unpinned model references. It is a well-instrumented codebase.

If you maintain SWE-agent, a two-line `.nox.yaml` that excludes `trajectories/`
and `tests/test_data/` collapses the noise while leaving the real findings
visible. And pinning your GitHub Actions to SHAs is the one mechanical fix worth
scheduling.

```sh
nox scan . --offline
```

Nox is open source (Apache-2.0): <https://github.com/nox-hq/nox>.
