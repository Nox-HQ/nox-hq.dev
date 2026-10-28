---
title: "Scan of the week: pydantic-ai — 1,606 findings, 0 to disclose"
description: "Nox scanned pydantic/pydantic-ai and returned 1,606 findings. After triage: base64 PNG image data in test cassettes drove 733 credential false positives, pull_request_target in six CI workflows is a real pattern the team already hardened, and security docstrings triggered the exfiltration rule."
publishedAt: 2026-10-28
author: nox-hq
tags: [scan-of-the-week, ai-security, false-positives, precision]
---

Every two weeks we point Nox at one open-source AI project and report what we
find — honestly, including our own false positives. This week:
[`pydantic/pydantic-ai`](https://github.com/pydantic/pydantic-ai), the
multi-provider agent framework from the Pydantic team, at commit `9ac853b`.

> **`nox scan . --offline` → 1,606 findings.**

This is the largest number in the series — and the most instructive.

## The breakdown

| Family | Count | Notes |
|---|---|---|
| SEC | 758 | Credential patterns |
| IAC | 487 | CI/workflow rules |
| SLOP | 236 | Import-without-manifest checks |
| AI | 86 | AI-specific rules |
| TAINT | 15 | Taint propagation |
| DATA | 13 | Structured data patterns |
| MCP | 5 | MCP-specific rules |
| VARIANT | 2 | Known CVE variants |
| AGENT | 2 | Agent behaviour |
| CRYPTO | 2 | Cryptographic patterns |

**By severity (raw, before triage):**

| Severity | Count |
|---|---|
| Critical | 18 |
| High | 573 |
| Medium | 362 |
| Low | 556 |
| Info | 97 |

This looks alarming. Here is what it actually means.

## The cassette cascade: 733 findings from PNG pixel data

The single largest source of noise is also the most surprising. pydantic-ai
ships 161 MB of VCR cassette files — YAML recordings of real LLM API responses
used in offline tests. Some of those recorded responses are AI-generated images
returned as base64-encoded PNG data. When Nox scans those cassette files, the
long base64 strings match several credential regex patterns (tracked as [#930](https://github.com/nox-hq/nox/issues/930)).

Two rules fire together:

- **SEC-055 (Cargo Registry Token) × 234** — the pattern targets a 64-character
  base64-like string starting with a specific prefix; base64-encoded PNG data
  produces thousands of candidate 64-character windows.
- **SEC-048 (NuGet API Key) × 153** — similar: 46-character base64 strings with
  matching entropy.

Total: **733 findings from one test fixture directory**
(`tests/cassettes/test_capability_image_generation/`). None are real credentials.
They are PNG pixels.

This is the largest single source of false positives we have ever seen in this
series, and it is entirely predictable: any multi-modal test suite that records
image responses verbatim will produce this class of noise. A two-line `.nox.yaml`
eliminates it:

```yaml
scan:
  exclude:
    - "tests/cassettes/**"
```

That collapses 1,606 findings to about 873 without touching any real signal.
If you use VCR cassettes with image data in your own project, the same exclude
applies.

## IAC-011 × 6: pull_request_target used carefully

Six CI workflows use the `pull_request_target` trigger:
`bots.yml`, `ci-duration-report.yml`, `docs-navigation.yml`, `package-label.yml`,
`pr-guard.yml`, and `protect-github-dir.yml`. The scanner flags this at
**critical / medium confidence** (IAC-011) because `pull_request_target` runs
with the base repository's secrets and write permissions, even for PRs from forks.

These are genuine `pull_request_target` uses, so the rule fires correctly.

But the pydantic-ai team knows this — each workflow carries a
`# zizmor: ignore[dangerous-triggers]` annotation with the reason, and the
implementation is carefully hardened. The automated code-reviewer workflow
(`bots.yml`) is the most elaborate example:

- The fork's code is never at the workspace root. A first checkout places the
  **base branch** (trusted) at the root; the fork head is checked out separately
  under `pr-head/` and declared as an `--add-dir` to the reviewer agent, not as
  the project root.
- `persist-credentials: false` on both checkouts keeps the GitHub token out of
  `.git/config`.
- bubblewrap PID-namespace isolation scrubs Anthropic and cloud provider secrets
  from subprocess environments — `ANTHROPIC_API_KEY` is not reachable from a
  process launched by the LLM.
- A config-file guard rejects any PR that modifies `CLAUDE.md`, `.claude/`,
  `AGENTS.md`, or `agent_docs/` — the instruction layer — before the reviewer runs.

The workflow's own comments explicitly acknowledge what is *not* prevented:
*"Prompt injection is NOT prevented and cannot be — reading attacker-authored
text IS this job's purpose."* The threat model is written down. The boundaries
are enforced by the toolchain, not by hope.

These are real findings in the sense that any `pull_request_target` workflow
deserves scrutiny. They are not vulnerabilities: the project has already done the
security work the rule exists to prompt.

## MCP-011 "critical": the security docstring that triggered the exfiltration rule

Two MCP-011 findings fire at **critical / low confidence** on these files:

```
src/pydantic_clai2/pydantic_clai2/models/openrouter.py:47
src/pydantic_clai2/pydantic_clai2/models/vllm.py:55
```

The MCP-011 pattern targets tool-poisoning text: phrases like *"send the contents
of ~/.ssh"* or *"forward credentials to the attacker"* in MCP tool metadata. Both
findings land on the same docstring:

```python
async def discover(connection: Connection, ...) -> list[str]:
    """Query only the requested endpoint; do not forward credentials across redirects."""
```

The phrase *"do not forward credentials"* matches the pattern
`forward\s+credentials?`. A docstring that documents a security property —
deliberately refusing to forward credentials on redirects, enforced by
`follow_redirects=False` two lines later — triggers the rule designed to catch
MCP server authors instructing models to forward credentials.

This is our bug. The rule applies `IgnoreInComments = true`, which strips
single-line `#` comments in Python, but Python docstrings are triple-quoted string
literals, not comments in the syntactic sense, so they are not suppressed. The fix
that extends the comment-suppression logic to docstrings for Python files is
tracked at [nox#927](https://github.com/nox-hq/nox/issues/927).

The functions themselves are standard API discovery clients with no security
concern: `follow_redirects=False`, tokens from a credential store, requests to a
fixed HTTPS endpoint.

## VARIANT-002 "high": yaml.BaseLoader flagged as the full loader

Two VARIANT-002 findings report *"CVE-2020-14343 variant: PyYAML full-loader
deserialization"* in:

```
src/pydantic_ai_harness/pydantic_ai_harness/skills/_loader.py:198
yaml.load(frontmatter, Loader=UniqueKeyLoader)
```

`UniqueKeyLoader` extends `yaml.BaseLoader` — which is the *safest* PyYAML
loader. It supports only strings, never arbitrary Python object construction.
CVE-2020-14343 affects `yaml.Loader` (the full loader) and `yaml.UnsafeLoader`.
`BaseLoader` is immune by design.

The false positive arises because the rule matches the shape
`yaml.load(..., Loader=<class>)` and requires the loader class to be one of the
safe known names. A custom subclass of `yaml.BaseLoader` is not on that list, so
it fires. The fix is to walk the MRO when a custom class is used: if it inherits
exclusively from `BaseLoader` or `SafeLoader`, suppress. **False positive.**
Tracked at [nox#928](https://github.com/nox-hq/nox/issues/928).

## What pydantic-ai actually gets right on AI security

After triage, the more interesting story is what the scanner *didn't* find.

**SSRF protection is comprehensive.** The `pydantic_ai/_ssrf.py` module ships a
curated deny-list of 169.254.0.0/16, 100.64.0.0/10, all RFC-1918 ranges, and
the instance-metadata endpoints for AWS, GCP, Azure, DigitalOcean and others.
It is applied to `HttpxProvider` and the MCP HTTP client. MCP-018 fired on this
file — the SSRF endpoint IPs appear inside the blocklist — but the code is
defensive, not offensive. Another rule-precision bug on our side, tracked at
[nox#929](https://github.com/nox-hq/nox/issues/929).

**The PromptInjectionDefender capability is opt-in and clearly labelled.** The
harness ships `PromptInjectionDefender` backed by `stackone-defender`, wrapped as
an `AbstractCapability`. It is not wired in by default. The AI-security posture
document in the harness explicitly models the trust boundary.

**LocalWorkspaceBackend is documented as sandboxed-nothing.** The workspace
backend for local execution carries an explicit docstring: *"This backend
isolates nothing."* That is an honest disclosure of its threat model, not a
missing feature. The capability docs steer production deployments toward sandbox
providers.

**All external GitHub Actions are pinned to commit SHAs.** Every third-party
action in the repository uses a full SHA reference rather than a mutable version
tag — one of the supply-chain hygiene items that has produced real findings in
every prior scan in this series. pydantic-ai has none.

## The SEC-002 and SEC-030 "critical" test fixtures

Three SEC-002 (AWS Secret Access Key) findings land in test files:

- `tests/models/test_bedrock.py:421` — `aws_secret_access_key='6666666666666666666666666666666666666666'`
- `tests/models/test_bedrock.py:8062` — same value, same fingerprint
- `tests/test_embeddings.py:2639` — same value

The key is forty 6s. It is a placeholder used to construct a `BedrockProvider`
for recording cassettes. Not a real credential.

SEC-030 (Stripe API Key) fires at `tests/harness/guardrails/test_detectors.py:80`
on a clearly fake `sk_live_…` placeholder. This is a test that verifies the secret
detector catches a Stripe key — the fixture *is* the thing the test is testing.
Still a false positive: no real credential is present.

## Nothing to disclose

No leaked credential, no exploitable code path, no true positive security
vulnerability. The six `pull_request_target` workflows are a genuinely risky
trigger pattern and the scanner is right to flag them; but they are already
hardened, publicly visible, and commented with the team's own security analysis.
No coordinated disclosure is warranted.

## The honest takeaway

1,606 findings → 6 real (pull_request_target, already mitigated) → 0 to disclose.
That is a 99.6% false-positive rate on this scan.

The dominant sources of noise, in order:

1. **Base64 image data in VCR cassettes** (733 findings) — exclude cassette
   directories from credential scanning ([#930](https://github.com/nox-hq/nox/issues/930)).
2. **Fake credentials in test fixtures** (4 findings) — placeholder AWS and Stripe
   keys used to test the application's own secret detection.
3. **Security docstrings triggering exfiltration rules** (2 findings) — comments
   that describe what code refuses to do match patterns for what bad code does
   ([#927](https://github.com/nox-hq/nox/issues/927)).
4. **Safe YAML loader subclass flagged as unsafe** (2 findings) — custom
   subclasses of `yaml.BaseLoader` inherit its safety
   ([#928](https://github.com/nox-hq/nox/issues/928)).
5. **SSRF deny-list IPs triggering SSRF detection** (1 finding) — defensive code
   listing blocked endpoints fires the rule designed to catch offensive code
   ([#929](https://github.com/nox-hq/nox/issues/929)).

Items 3–5 are precision bugs in Nox. Items 1 and 2 are expected behaviour
from credential regex rules that cannot see context.

The genuine AI-security picture for pydantic-ai is good: comprehensive SSRF
protection, opt-in prompt injection defence, an honest "this is not sandboxed"
disclosure on the local workspace backend, and SHA-pinned supply chain. The
`pull_request_target` CI workflows are the one area where a fresh pair of eyes
is valuable — and the team has already done the work.

If you scan pydantic-ai yourself, a `.nox.yaml` that excludes cassette
directories and test-data paths drops the noise to a manageable signal:

```yaml
scan:
  exclude:
    - "tests/cassettes/**"
    - "tests/**/*.yaml"
```

```sh
nox scan . --offline
```

Nox is open source (Apache-2.0): <https://github.com/nox-hq/nox>.
