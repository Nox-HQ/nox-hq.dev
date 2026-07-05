---
title: "Scan of the week: smolagents (or, when a scanner flags a package as a typo of itself)"
description: "Nox scanned huggingface/smolagents — 323 findings, 65% from one example folder, zero real vulnerabilities, and one genuine bug in our own typosquatting rule."
publishedAt: 2026-06-07
author: nox-hq
tags: [scan-of-the-week, ai-security, agents, false-positives, precision]
---

Every two weeks we point Nox at one open-source AI project and report what we
find — honestly, our own false positives included. This week:
[`huggingface/smolagents`](https://github.com/huggingface/smolagents), the
lightweight agent framework, at commit `e8b988d`.

> **`nox scan .` → 323 findings.**

smolagents is an interesting target because its *entire premise* is running
code that an LLM wrote. If any framework should light up a security scanner,
it's this one. So what did 323 findings actually mean?

## 65% of it is one example folder

`examples/open_deep_research/` and its fixtures produced **209 of the 323
findings**. A single committed file of static YouTube browser cookies
(`scripts/cookies.py`) alone triggered 108 "PostHog API key" hits and 50
"high-entropy string" hits. Another 77 were OSV advisories against pinned
versions in example `requirements.txt` files — real CVE data, but scoped to an
example's dependencies, not the library. The library proper (`src/smolagents`)
accounted for just 58 findings.

The fix is the same as always — scope out what isn't source:

```yaml
scan:
  exclude:
    - "examples/**"
    - "docs/**"
```

## The AI findings: 24 → zero real

We opened every high- and critical-severity AI finding at its cited line.
**None were real vulnerabilities:**

- **"Model loaded without hash verification" ×11** — standard HuggingFace
  `from_pretrained(...)` calls (the Hub handles integrity itself), plus one hit
  on a *function literally named `load_model`* and one inside a docstring
  example.
- **"Agent has shell execution capabilities" ×4** — all on
  `secure_code_execution.md`, the doc that teaches smolagents' *sandboxed*
  executors (e2b, Docker, Modal). The scanner flagged the framework's headline
  feature, in the page explaining how it's sandboxed.
- **"High temperature" / "deprecated GPT-3.5"** — documentation snippets and a
  `"gpt-3.5-turbo"` example string.

smolagents runs model-written code by design, and the scan surfaced that — but
only in the docs about sandboxing, never at an unsafe `eval`/`exec` sink. No
prompt-injection, no agent-over-privilege, no MCP tool-poisoning findings at
all.

## The most useful finding was about us

Two findings were marked **critical: typosquatting**. They were
`huggingface_hub` and `python_pptx` — the *real, canonical packages*. Our
VULN-002 rule lowercased names but didn't normalize PEP 503 separators, so the
underscore form read as edit-distance 1 from the hyphenated popular name and got
flagged as a typo of itself. That's a genuine bug in Nox, not in smolagents — we
[fixed it](https://github.com/nox-hq/nox) the same day (normalize `-`/`_`/`.`
runs before the similarity check) with a regression test.

## Nothing to disclose

After opening every high and critical finding against source: zero real,
exploitable defects in smolagents, and nothing requiring coordinated
disclosure. A framework whose whole job is executing LLM-generated code came
through clean.

The honest takeaway, again: detection is easy, precision is hard. This week the
scanner's best output wasn't a finding in the target — it was a bug report
against itself. Run it on your own project:

```sh
nox scan . --offline
```

Nox is open source (Apache-2.0): <https://github.com/nox-hq/nox>.
