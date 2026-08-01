---
title: "Scan of the week: openai-agents-python — 378 findings, 0 genuine issues"
description: "Nox scanned openai/openai-agents-python at 21c88f5 and returned 378 findings. After triage: 0 true positives, and the most interesting result was a SEC-163 false positive pattern we fixed in nox's own rules."
publishedAt: 2026-08-01
author: nox-hq
tags: [scan-of-the-week, ai-security, false-positives, precision]
---

Every two weeks we point Nox at one open-source AI project and report what we
find — honestly, including our own false positives. This week:
[`openai/openai-agents-python`](https://github.com/openai/openai-agents-python),
OpenAI's official Python SDK for building multi-agent workflows, at commit
`21c88f5`.

Headline number first, because hiding it would be dishonest:

> **`nox scan .` → 378 findings.**

After two hours of triage: zero genuine security issues. Here is exactly what
that number is made of.

## The AI-specific findings: 40 → 0

The AI rules fired 40 times. We opened every high and critical finding against
source. Here is the full scorecard:

**AI-007 (1 × high) — false positive.** `src/agents/tracing/processors.py:133`
reads `api_key = item_key or self.api_key` — resolving which API key to use for
a batch of traces. The rule triggered on the variable assignment. Actual
logging on the lines that follow only says "OPENAI_API_KEY is not set" — the
key value itself is never logged. This is a variable-assignment hit, not a
print/log hit.

**AI-034 (23 × high/medium) — all false positive.** The rule flags "AI agent
forced to use tool calls without validation" and fired on every occurrence of
`tool_choice="required"` or `"required"` in proximity to tool_choice-related
code. Breakdown:
- **12 hits in `docs/`** (four languages): code examples showing how to use
  `tool_choice="required"`. Documentation snippets.
- **7 hits in `integration_tests/`**: test fixtures that intentionally force a
  tool call to verify the behavior. Testing what the setting does is not the
  same as unsafely applying it in production.
- **4 hits in source model files** (`any_llm_model.py:785`,
  `litellm_model.py:649`, `openai_chatcompletions.py:635`,
  `openai_responses.py:1735`): none of these lines set `tool_choice="required"`.
  Two set a fallback of `"auto"`. One is inside a comment that says
  `#   Input should be 'none', 'auto' or 'required'` (an error-message quote
  from pydantic). The fourth reads `model_settings.tool_choice` as part of a
  converter — it does not set the value.

**AI-033 (1 × medium) — false positive.** `chatcmpl_stream_handler.py:518`
contains `saw_content_filter = False` — a boolean initialised to detect when a
provider signals a content filter block via `finish_reason`. The rule saw a
variable that mentions "content_filter" and inferred content filtering was being
disabled. It is not. The variable is a detection flag.

**AI-031 (2 × medium) — false positive.** Integration tests demonstrating
`ShellTool`, with `needs_approval=True` in one case — which is exactly the
approval gate the rule looks for. Test fixtures, not production exposure.

**AI-045 (1 × high) — false positive.**
`src/agents/sandbox/memory/prompts/memory_consolidation_prompt.md:507` is a
system prompt that instructs an agent to consolidate its memory. The rule
flagged it as "AI agent with self-modification capability." The file is a
structured memory-management workflow, not an unguarded self-rewrite loop.

**AI-050 (12 × medium) — false positive.** "AI API retries disabled." Findings
land across `retry.py` and `model_retry.py`. The actual code is the retry
policy implementation itself — returning `RetryDecision(retry=False)` under
legitimate conditions like "provider said replay is unsafe" or "attempt
> max_retries." The findings in the OpenAI model files (`max_retries=0`) are
deliberate: the framework has its own retry layer and disables SDK-level retries
to prevent double-retry. The code even has a `should_disable_provider_managed_retries()`
guard function.

## The non-AI noise: 338 findings

| Rule | Count | What it is |
|---|---|---|
| SEC-163 | 101 | High-entropy hex (see below) |
| SEC-446 | 72 | "Cloudflare API Key" — 64 hits are on `"cloudflare_bucket_mount"` type strings in tests |
| SLOP-001 | 62 | Undeclared package imports (mainly `anyio`/`httpx` — transitive deps of `openai`) |
| SEC-819 | 26 | "Modal API Token" — README placeholders like `my-modal-secret` |
| SEC-542 | 22 | "Cloudflare API Token (alternate)" — error class name substrings |
| SEC-161 | 6 | High-entropy in test fixture data |
| SEC-793 | 6 | "Encryption key" — `encryption_key="my-secret-password"` in documentation examples |
| DATA-001/002/010 | 14 | Synthetic PII in example code (SSN `123-45-6789`, MRN, email) |

None of these are real credentials or exploitable paths. The synthetic PII
findings are intentional — `examples/basic/tool_guardrails.py` uses a fake SSN
with the comment `# Sensitive data that should be blocked!` to demonstrate the
guardrail feature.

## A bug in our own rules — and the fix

The SEC-163 "high-entropy hex" rule was the biggest noise generator: 101 hits,
almost all false positives. The most interesting cluster was in
`src/agents/extensions/experimental/codex/codex_tool.py`:

```python
configured_key=resolved_options.run_context_thread_id_key,
```

The rule extracted `resolved_options.run_context_thread_id_key` (43 chars) as
a candidate because it appears after an assignment operator and contains the
keyword `key` on the same line (triggering the context boost). Shannon entropy
of a long snake_case identifier with 17+ distinct characters crosses 4.0 bits —
the lowered threshold.

Two other patterns contributed to the same rule's noise:

- **f-string templates**, e.g. `f"{DEFAULT_RUN_CONTEXT_THREAD_ID_KEY}_{suffix}"`:
  the quoted-string tokeniser extracts the template body and the entropy check
  fires on a string full of uppercase letters and braces.
- **Method-call expressions as assignment RHS**, e.g.
  `approval_key = RunContextWrapper._resolve_approval_key(interruption)`:
  the assignment RHS tokeniser extracts `RunContextWrapper._resolve_approval_key`
  (ending before the `(`). The identifier has high structural entropy.

None of these are secrets. We shipped three targeted fixes to `entropy.go`:

1. **Skip function-call RHS in the assignment tokeniser.** If the token
   extracted from the RHS of an `=` assignment ends immediately before a `(`
   character, it is a function-call expression whose return value is not visible
   in source. We skip it.

2. **Exclude `SCREAMING_SNAKE_CASE` identifiers.** A string consisting only of
   uppercase letters, digits, and underscores with at least one underscore is a
   constant name — never a credential. Added `isScreamingSnakeCase` to the
   `isLikelyNotSecret` filter.

3. **Exclude lowercase snake_case / dot-chain identifiers.** A string of only
   lowercase letters, digits, underscores, and dots with at least one underscore
   is a variable name or attribute access chain. Added `isLowercaseDotChain`
   to the same filter.

4. **Exclude template expressions.** A string containing both `{` and `}` is a
   template placeholder — Python f-string, shell variable substitution. Added
   `containsTemplateBraces` to the filter.

All four changes ship with regression tests pinned to the exact
openai-agents-python patterns that exposed them.

## `.nox.yaml` tip

If you run Nox on a repo like this, two lines eliminate most of the noise:

```yaml
scan:
  exclude:
    - "docs/**"
    - "integration_tests/**"
    - "examples/**"
```

Documentation, integration test fixtures, and example code all behave
differently from production source. Pattern-based rules that have no visibility
into intent (it is a test! it is a doc example!) will always fire more on those
paths. Excluding them is the right call for most CI workflows.

## Nothing to disclose

Every finding we opened traced to a false positive. There is no leaked
credential, no exploitable code path, no live secret. The openai-agents-python
SDK gates shell execution behind `needs_approval=True`, ships a complete retry
policy that intentionally overrides provider SDK retries, and applies content
filter detection — not disabling. There is nothing here requiring coordinated
disclosure.

## The honest takeaway

378 → 0 real issues. That is not a criticism of nox — it is the honest state of
AI-security scanning precision on a mature, carefully written SDK. The value in
this week's scan is not a finding in openai-agents-python; it is four new
`isLikelyNotSecret` exclusions that will reduce noise on every subsequent scan.

```sh
nox scan . --offline
```

Nox is open source (Apache-2.0): <https://github.com/nox-hq/nox>.
