---
title: "Scan of the week: Haystack (or, why 12,367 findings is mostly a docs folder)"
description: "Nox scanned deepset-ai/haystack and returned 12,367 findings. Strip the docs tree and it collapses to one real low-severity issue — plus a precision bug we fixed in our own rules."
publishedAt: 2026-05-24
author: nox-hq
tags: [scan-of-the-week, ai-security, rag, false-positives, precision]
---

Every two weeks we point Nox at one open-source AI project and report what we
find — honestly, including our own false positives. This week:
[`deepset-ai/haystack`](https://github.com/deepset-ai/haystack), the LLM/RAG
framework, at commit `56b5dd3`.

Headline number first, because hiding it would be dishonest:

> **`nox scan .` → 12,367 findings.**

That number says far more about scanner tuning than about Haystack's security.
Here's what it actually means.

## 94% of it is a docs folder

Of the 12,032 secret-detector hits, **11,301 live under `docs-website/`** —
versioned documentation, `.mdx` pages, sidebar config. The generic API-key and
entropy rules fired on URL fragments, Python `import` lines, git SHAs in
pinned GitHub Actions, and ordinary class names like
`_SentenceTransformersEmbeddingBackend`. The 196 "critical" connection-string
hits are placeholder templates — `postgresql://USER:PASSWORD@HOST:PORT/DB_NAME`.

The right answer for a repo like this is path-aware scoping. A two-line
`.nox.yaml` collapses the noise:

```yaml
scan:
  exclude:
    - "docs-website/**"
    - "**/releasenotes/**"
```

Generated and versioned docs are not source. This is the same lesson every
scan-of-the-week reinforces: precision is about *where* you look as much as
*what* you match.

## The AI findings: 138 → 1

The AI-specific rules produced 138 findings. We opened every high and critical
one against source. After triage, exactly **one** is a genuine issue:

- **AI-006 (logging, low severity) — real.** `llm_evaluator.py:217` logs the
  full prompt on error (`logger.warning(... prompt=prompt)`). RAG prompts can
  carry private retrieved context, so this is worth a redaction pass. Low
  severity, easy fix — the kind of hygiene finding the rule exists for.

Everything else was a false positive, and two are worth naming because they're
*our* bug, not Haystack's:

- **AI-009 (code execution, critical ×2) — false positive, fixed.** Both hits
  were `ast.literal_eval(...)` guarded by an explicit `unsafe` flag.
  `literal_eval` is Python's *safe* literal parser — not `eval`/`exec`. Our
  rule conflated the two. We shipped a fix (a word boundary so `literal_eval`
  no longer matches) with a regression test the same day we found it.
- **AI-019, AI-041, AI-047, AI-036, AI-008** — model-loading, temperature,
  HTTP-endpoint, and model-pin rules firing on docstring examples, a
  component's own `top_p` parameter, Ollama's `http://localhost:11434` local
  default, and release notes. Noise, not risk.

## Nothing to disclose

No leaked credential, no exploitable code path, no live secret. Haystack gates
its dynamic evaluation behind explicit `unsafe` flags and ships clean. There is
nothing here requiring coordinated disclosure — and we wouldn't publish it if
there were, not without telling them first.

## The honest takeaway

12,367 → a handful of signal. That's the real state of the art in AI-security
scanning: the detection is easy, the precision is hard, and most of the work is
teaching the scanner to ignore docs, tests, examples, and safe-by-design code.
We found one low-severity logging issue in Haystack and one critical-severity
*bug in our own rules* — and fixed ours. Run it on your own project:

```sh
nox scan . --offline
```

Nox is open source (Apache-2.0): <https://github.com/nox-hq/nox>.
