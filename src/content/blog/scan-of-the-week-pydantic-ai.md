---
title: "Scan of the week: pydantic-ai (or, what 800 test cassettes do to a security scanner)"
description: "Nox returned 1,358 findings against pydantic/pydantic-ai. Strip the test cassettes and CI workflows and it collapses to a handful of correctly-flagged patterns — all mitigated."
publishedAt: 2026-11-01
author: nox-hq
tags: [scan-of-the-week, ai-security, pydantic, false-positives, precision]
---

Every two weeks we point Nox at one open-source AI project and report what we
find — honestly, including our own false positives. This week:
[`pydantic/pydantic-ai`](https://github.com/pydantic/pydantic-ai), the
type-safe AI agent framework, at commit `e286b84`.

Headline number first, because hiding it would be dishonest:

> **`nox scan .` → 1,358 findings.**

That's actually a *smaller* number than most AI framework scans. Here's why
it's still mostly noise — and what the signal actually looks like.

## Three noise sources eat most of the count

### Test cassettes (≈150 findings)

pydantic-ai ships a large VCR-style test suite: over 800 YAML cassette files
recording real HTTP exchanges with every model provider it supports — Anthropic,
OpenAI, Google, Bedrock, Mistral, Cohere. Those cassettes contain raw HTTP
responses: base64-encoded binary, streaming SSE payloads, image data, tool call
JSON. Entropy detectors (SEC-042, SEC-043, SEC-143, SEC-520) fire on all of it.
Every finding points at a cassette file, not source code. None are actionable.

### CI workflows (≈350 findings)

The project's `.github/workflows/` tree is substantial — benchmarks, model
health checks, an agentic workflow guard, a bot reviewer. Two rules dominate:

- **IAC-018** (303 findings): `continue-on-error: true` in CI steps. The rule
  exists because silently swallowing failures in security-critical steps hides
  regressions. In this repo, the pattern is nearly always "don't let a flaky
  model provider cancel the whole matrix run", which is a reasonable tradeoff.
  Result: correct flag, accepted practice.
- **IAC-155 / IAC-308 / IAC-309** (~70 findings): various workflow hygiene
  issues (action pinning, environment isolation). Low severity and expected at
  this scale.

### SLOP-001: internal script imports (265 findings)

The agentic workflow scripts under `.github/scripts/` import packages that
aren't declared in any project lockfile — they're invoked with packages
pre-installed in the Actions runner. Nox's slopsquat detector (SLOP-001) flags
undeclared imports as potential typosquat targets. This is a real risk class,
but here the detection fired on an internal shim and a monitoring script, not
on library code users pull. The findings are structural noise from how the
project packages its CI helpers.

## The AI-specific findings: what actually matters

121 findings triggered AI-family rules. We read the source at every high and
critical location. Here is what we found.

### IAC-011: `pull_request_target` — correctly flagged, knowingly accepted

7 critical findings. `pull_request_target` workflows that check out fork code
are [a well-known attack surface](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/):
a malicious PR can inject commands that run with the base repo's secrets.

pydantic-ai uses this pattern in `bots.yml` for its automated PR reviewer. The
team knows: the file carries `# zizmor: ignore[dangerous-triggers]` with a
documented rationale and a split-checkout design where the bot step is isolated
from the code checkout step. **This is the one finding we'd highlight in a
real engagement** — not as a bug, but as a conscious risk that deserves ongoing
review and documentation. The team has done that work. Nox flagging it is
correct; the team's response to it is also correct.

### AI-031: "shell execution capability" — false positive ×46

AI-031 matches the pattern `tools?\s*[:=]\s*\[.*?(exec|shell|bash)` and fires
on every documentation example that shows how to give an agent shell tools. All
46 hits are in `docs/` — they describe *how to enable* a capability, not an
insecure use of one. Our rule needs context-awareness: a pattern in a Markdown
code block that explains a feature is not the same as the feature being used
without a guard.

### AI-050: `max_retries=0` — false positive ×23

23 findings, all in docs and in the batch-API adapters for OpenAI and Anthropic.
The batch API is fire-and-forget by design: the client submits a batch, the
provider processes it asynchronously, and retrying the *submission* step is
wrong — you'd create duplicate batches. `max_retries=0` here is a correct
choice, not a resilience hole. We saw the same pattern in the Bedrock and
Anthropic batch adapters.

### AI-034: forced tool calls — false positive ×15

`tool_choice = 'REQUIRED'` in Cohere's adapter and `tool_choice = 'any'` in
Mistral's adapter. Both are adapter translation code: pydantic-ai's internal
`ToolChoice.required` is being mapped to each provider's wire-format value.
There is no security issue in mapping an internal enum to a provider API string.

### AI-011: unrestricted tool access — false positive ×12

All 12 hits are in `docs/harness/code-mode.md` and `docs/harness/control-and-safety.md`
— documentation showing how `CodeMode(tools='all')` and `ToolCallJudge(tools='all')`
work. In both cases `tools='all'` means "apply this security gate to *all* tools",
which is the safer option. The rule conflates "granting unrestricted access" with
"scoping a guard to all tools". The documentation examples are showing the secure
configuration.

### AI-006: prompt logging — false positive ×11

Eleven files triggered our prompt-logging detector. After reading each one:
four are Playwright browser-dialog handlers where "prompt" is a browser dialog
type; three are UI rendering functions that display conversation history to the
terminal (intentional, not a data leak); two are log lines that record only task
IDs; one is a UI status message containing the word "prompt". None log
unredacted LLM prompt or response content to a sink that would be a security issue.

## One genuine observation (not a scanner finding)

This came from reading the source, not from a scanner rule. The instrumentation
module `pydantic_ai_slim/pydantic_ai/capabilities/instrumentation.py` sets
`include_content: bool = True` as its default. With this setting, OpenTelemetry
spans carry the full prompt and response text. This isn't wrong — users who
enable telemetry presumably want content — but it is opt-out rather than opt-in
for a privacy-sensitive default. The option exists and is documented; teams
deploying pydantic-ai with telemetry should verify they've set it explicitly
rather than relying on the default.

## Nothing to disclose

pydantic-ai ships with a `THREAT_MODEL.md`. They've documented their assets,
adversaries, data flows, and mitigations — including the SSRF-class risks in
the URL-fetching and realtime session features, and explicit notes on what
the framework does and does not protect. That document pre-answers the questions
a security scanner would raise. No finding from this scan rises to a level
requiring coordinated disclosure.

## The honest takeaway

1,358 → a handful of signal that the team already knows about. The two largest
contributors to the count — test cassette entropy and CI `continue-on-error` —
are structural features of how the project is tested and released, not security
failures. The AI-specific rules were mostly tripped by documentation, adapter
translation code, and security-gate configurations that look like what they
guard against.

pydantic-ai is a well-engineered framework with a formal threat model,
documented security decisions, and a test suite thorough enough to break
a scanner's entropy detectors. That's a good problem to have.

## Scope it down with `.nox.yaml`

If you scan a test-heavy repo with VCR cassettes, add this:

```yaml
scan:
  exclude:
    - "tests/cassettes/**"
    - "tests/models/cassettes/**"
    - "docs/**"
```

Cassette YAML files are recorded API responses, not source. Excluding them
lets the scanner spend its budget on code you actually ship.

---

Nox is open source (Apache-2.0): <https://github.com/nox-hq/nox>. Run it
on your own AI project:

```sh
nox scan . --offline
```
