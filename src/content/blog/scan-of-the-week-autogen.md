---
title: "Scan of the week: AutoGen — 304,629 findings, and 99.5% are SVGs and lock files"
description: "Nox scanned microsoft/autogen: 304,629 findings, dominated by base64-encoded SVG art triggering 10 broad-pattern rules. Fixed the same FP cluster that hit LangGraph."
publishedAt: 2026-06-15
author: nox-hq
tags: [scan-of-the-week, ai-security, false-positives, precision]
---

Every two weeks we point Nox at one open-source AI project and report what we
find — honestly, including our own false positives. This week:
[`microsoft/autogen`](https://github.com/microsoft/autogen), the multi-agent
framework for Python and .NET, at commit `027ecf0`.

> **`nox scan .` → 304,629 findings.**

That is the loudest number this series has produced. Here is what it actually is.

## 99.5% is three file categories

| Source | Findings | Share |
|---|---|---|
| SVG files (base64-encoded PNG diagrams) | 167,825 | 55.1% |
| Lockfiles (yarn.lock, package-lock.json) | 71,466 | 23.5% |
| Jupyter notebooks (embedded images) | 60,722 | 19.9% |
| PDF files (seed-memory docs) | 3,244 | 1.1% |
| **All source files combined** | **1,372** | **0.5%** |

The top five rules — SEC-616 ("Firebase Cloud Messaging Key"), SEC-692 ("ELK
Stack API Key"), SEC-533 ("IBM Cloud API Key"), SEC-664 ("Heap API Key"), and
SEC-590 ("Wave API Key") — together account for 264,233 findings. Every single
one of those findings lands in `dotnet/website/images/ag.svg`, the `group-chat`
notebook, or one of the SVG diagrams under `python/docs/`. The pattern that
triggers them: `[a-zA-Z0-9]{32}`, with the vendor keyword (`fcm`, `elk`, `ibm`,
`heap`, `wave`) appearing somewhere in the same file. In a 1.3 MB SVG containing
a base64-encoded PNG, the keyword appears a handful of times inside the binary
stream and the rule engine then finds tens of thousands of 32-character
alphanumeric substrings throughout the rest of the base64 blob.

Five more rules (SEC-659, SEC-661, SEC-697, SEC-569, SEC-455) fire with the same
structural problem on `yarn.lock` hashes and package-lock IDs.

**This is a bug in our rules, not in AutoGen.** And it is a bug we have seen
before — the [LangGraph scan](/blog/scan-of-the-week-langgraph) already named
SEC-616, SEC-692, and SEC-659 as its dominant false positives. We should have
fixed all ten of them then. We fixed them now.

## The rule fix: word boundaries + secretShape

All ten rules shared the same structural gap: a broad bare-character-class pattern
(`[a-zA-Z0-9]{32}`) without word boundaries (`\b`) and without the
`secretShape` post-filter that peer rules SEC-574 and SEC-629 already use.

The fix adds `\b...\b` and sets `secretShape: true, minEntropy: 3.5` on all
ten:

```
SEC-455  [a-z0-9]{32}       → \b[a-z0-9]{32}\b  + secretShape
SEC-533  [a-zA-Z0-9_-]{44}  → \b[a-zA-Z0-9_-]{44}\b  + secretShape
SEC-569  [a-zA-Z0-9]{24}    → \b[a-zA-Z0-9]{24}\b  + secretShape
SEC-590  [a-zA-Z0-9]{32}    → \b[a-zA-Z0-9]{32}\b  + secretShape
SEC-616  [a-zA-Z0-9]{32}    → \b[a-zA-Z0-9]{32}\b  + secretShape
SEC-659  [a-zA-Z0-9]{32}    → \b[a-zA-Z0-9]{32}\b  + secretShape
SEC-661  [a-zA-Z0-9]{32}    → \b[a-zA-Z0-9]{32}\b  + secretShape
SEC-664  [a-zA-Z0-9]{32}    → \b[a-zA-Z0-9]{32}\b  + secretShape
SEC-692  [a-zA-Z0-9]{32}    → \b[a-zA-Z0-9]{32}\b  + secretShape
SEC-697  [a-zA-Z0-9]{32}    → \b[a-zA-Z0-9]{32}\b  + secretShape
```

Word boundaries (`\b`) mean the regex only matches where the 32-char
alphanumeric run is surrounded by non-word characters — a quote, a space, an
equals sign. In a continuous base64 stream there is at most one such boundary,
and the `secretShape` filter then rejects anything that looks like a CamelCase
identifier rather than a random token. Real API keys quoted in config files hit
both conditions. Base64 image data does not.

Six regression tests (two structural, one per rule for the positive case) ship
with the fix. All pass; `go test ./core/...` is green on non-environment tests.

## The 80 AI findings: 57 in source, mostly false positives

Of the 80 AI-prefixed findings, 57 land in actual source files (the other 23 are
in `.ipynb` documentation notebooks). We opened all 57 at source.

### What is not real

**AI-006 and AI-026 (×14) — docstring examples.** AutoGen uses RST-style
docstrings with embedded `.. code-block:: python` sections. Lines like:

```python
logger.info(LLMCallEvent(prompt_tokens=10, completion_tokens=20, response=response, messages=messages))
print(response.content, flush=True)
```

…appear inside multi-line Python docstrings illustrating how to use the logging
and streaming APIs. Nox scans them as source. They are documentation.

**AI-008 (×6) — model references in docstring examples.** All six
"Model reference without version pin" findings are on `model="gpt-4"` inside
`.. code-block:: python` example sections in `_factory.py`, `_sse.py`,
`_streamable_http.py`, and `_openai_assistant_agent.py`. Not production
configuration.

**AI-016 (×2) — system_message in docstring example.** The
"System prompt or instructions returned to user" finding targets
`system_message="You combine the review..."` inside a code example in
`_team.py`. No runtime exposure.

**AI-028 (×8) — seed=None in .NET agents.** These flag `seed = null` in
`OpenAIChatAgent.cs`, `GPTAgent.cs`, and `ChatCompletionsClientAgent.cs`.
The finding reads "LLM seed not set, causing non-deterministic output." But in
every flagged file, `seed` is an explicit optional constructor parameter
(`int? seed = null`). Setting non-determinism as the caller-controlled default
is correct agent design, not a misconfiguration. False positives.

**AI-036 (×14) — gpt-3.5 in a model capability registry.** The bulk of the
AI-036 hits land in `_model_info.py`, which maps model aliases to their
capability sets. Entries like:

```python
"gpt-3.5-turbo-0125": {"vision": False, "function_calling": True, ...}
```

…declare backwards-compatibility support, not active usage. The rule exists to
catch places where a deprecated model is selected; it should not fire on a
capability dictionary.

### What is real (and low severity)

**AI-019 — llama_cpp model loading without hash verification (1 finding).**
`_llama_cpp_completion_client.py:253`:

```python
pretrained = Llama.from_pretrained(repo_id=repo_id, filename=filename, **kwargs)
```

The `repo_id` and `filename` values come from the caller. `from_pretrained`
downloads the GGUF file from HuggingFace Hub without verifying a SHA-256
checksum. If a user points this at a repo that has been tampered with, the
tampered weights load silently. This is a genuine supply-chain design gap — not
exploitable from outside AutoGen (the caller controls `repo_id`), but worth
noting for anyone deploying `autogen-ext` with user-supplied model references.
Low severity. No coordinated disclosure needed.

**AI-036 — gpt-3.5-turbo as the AutoGen Studio UI default (2 findings).**
`autogen-studio/frontend/src/components/views/settings/manager.tsx:57` and
`panel.tsx:61` both return `gpt-3.5-turbo` as the fallback model when no
server-side default is configured. New AutoGen Studio deployments get gpt-3.5 by
default. Low severity; users can change it, but the default is dated.

**AI-006 — LLM response content in production debug log (1 finding).**
`_selector_group_chat.py:276` logs `response.content` at `trace_logger.debug`
level when the model fails to select a valid speaker name. In production with
debug logging enabled, full LLM responses (which can include retrieved RAG
context) appear in logs. The code is intentional — it aids debugging — but worth
redacting in security-sensitive deployments.

## Nothing to disclose

There are no exploitable vulnerabilities in this scan. The `Llama.from_pretrained`
finding is a known ecosystem characteristic of the llama-cpp-python / HuggingFace
Hub stack, not a specific autogen defect. The AutoGen Studio model default is a
usability note. Nothing here requires coordinated disclosure — and we would not
publish it if it did.

## `.nox.yaml` to cut the noise

If you run Nox on a repo with similar content:

```yaml
scan:
  exclude:
    - "**/*.svg"
    - "**/*.lock"
    - "**/package-lock.json"
    - "**/*.ipynb"
    - "**/*.pdf"
    - "**/docs/**"
    - "**/website/**"
    - "**/benchmarks/**"
```

After the rule fix ships, the SVG and lock-file volume collapses on its own.
But scanning notebooks and large documentation trees for secrets is rarely
useful; excluding them is almost always the right call.

## The honest takeaway

304,629 findings; one real supply-chain design gap (low severity) and two dated
model defaults. That is a 0.001% signal-to-noise ratio — and 99.5% of it traces
to ten broad-pattern rules missing word boundaries. We found the bug on
autogen. We fixed it. The fix makes every future scan cleaner.

```sh
nox scan . --offline
```

Nox is open source (Apache-2.0): <https://github.com/nox-hq/nox>.