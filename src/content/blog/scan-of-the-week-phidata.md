---
title: "Scan of the week: phidata — when the scanner flags the guardrail"
description: "Nox scanned phidatahq/phidata: 1,277 findings. The standout FP — MCP-009 firing on a prompt injection DETECTION class. Plus an AI-007 rule fix."
publishedAt: 2026-08-15
author: nox-hq
tags: [scan-of-the-week, ai-security, false-positives, precision]
---

Every two weeks we point Nox at one open-source AI project and report what we
find — honestly, including our own false positives. This week:
[`phidatahq/phidata`](https://github.com/phidatahq/phidata), the agent
framework behind the **Agno** library, at commit `b889441`.

> **`nox scan .` → 1,277 findings.**

A calm number by the standards of this series. Here is what it actually is.

## Where the findings live

The repo has two top-level content areas:

| Directory | Findings | Share |
|---|---|---|
| `cookbook/` — example scripts and demos | 681 | 53% |
| `libs/` — actual library code | 574 | 45% |
| `.github/` — CI workflows | 22 | 2% |

Scanning the cookbook tree for security issues is structurally similar to
scanning a documentation folder: the examples *demonstrate* patterns, they do
not *apply* them in production. That framing explains most of the noise.

## Rule-by-rule triage

### SEC-372 (216) — AWS S3 URLs, 100% false positive

Every one of these 216 "Detected AWS S3 URL" findings points to
`agno-public.s3.amazonaws.com`, a public read-only bucket Agno uses to host
sample datasets for cookbook examples (Thai recipes, PDF knowledge bases, etc.).
There are no credentials, no sensitive data references, and no private bucket
names. The rule exists to catch misconfigured private-bucket URLs in
infrastructure code; it does not apply here.

### AI-006 (210) and AI-026 (84) — "Prompt logged without redaction", mostly false positive

The AI-006/AI-026 rules fire on log calls that mention prompt or response
keywords. In `libs/agno/agno/agent/_run.py`, the dominant match is:

```python
log_warning(f"Failed to signal primary queue for run {run_id} completion")
log_warning(f"Failed to mark run {run_id} as completed in event buffer")
```

Neither line logs a prompt or LLM response. The word `run` in `run_id` does not
match the rule's keyword list — what trips the rule is the surrounding pattern
matching, which lands on these infrastructure status messages. For the cookbook
hits the picture is different: many of those examples deliberately print the
agent response as output, which is not insecure logging — it is the point of
the example.

Findings in `libs/agno/agno/utils/print_response/workflow.py` (4 AI-026 hits)
are also legitimate: `print_response` is a developer-facing display utility
whose entire purpose is printing the response to the console. A tool that exists
to show the response is not a secret logger.

### SLOP-001 (264) — undeclared imports, all false positive

The `cookbook/00_quickstart/run.py` orchestrator imports other cookbook scripts
by filename as Python modules. Nox sees sibling module names that do not appear
in `pyproject.toml` and flags them as undeclared dependencies. These are
cookbook-internal script references, not production dependency gaps.

### DATA-001 (141) — email addresses, nearly all false positive

Of the 141 findings, 122 are in `libs/`. Sampling them:

- `pyproject.toml`: `"hello@agno.com"` (package author contact)
- `agno/context/wiki/backend.py`: `"wiki-bot@agno.local"` (a git commit author
  for the wiki sync bot — a local placeholder domain)
- test files: email addresses in test fixtures and integration test payloads

None constitute data exposure. Emails in project metadata and test fixtures are
expected and harmless.

### SEC-163 (57) — high-entropy hex strings, false positive

The 55 hits in `libs/` land on:

- `agno/vectordb/weaviate/weaviate.py`: the string `"content_hash"` (a
  schema field name)
- `agno/utils/cryptography.py`: code that *generates* a PEM key pair using
  `cryptography.hazmat` — no hardcoded key, just key-generation logic
- `agno/learn/stores/user_profile.py`: a dynamic function-builder that
  constructs `inspect.Parameter` objects at runtime

None of these are hardcoded secrets. The SEC-163 entropy threshold is matching
identifier structure, not credential material.

## The critical findings (all 25 are false positives — mostly)

All 25 critical findings deserved a source check:

**SEC-004 (7) — private key header detected, false positive.** Six hits are
in unit test fixtures: `"-----BEGIN RSA PRIVATE KEY-----\nfake_key\n-----END..."`.
The seventh is at `github.py:54`, which validates that a caller-supplied
`private_key` *starts with* `"-----BEGIN"` — the rule matched the validation
pattern, not a stored key.

**SEC-008 (2) — GCP Service Account JSON, false positive.** Both are in
`tests/unit/context/test_google_context_providers.py` with mock service account
JSON (obviously fake values: `"private_key_id": "test_private_key_id"`).

**SEC-073 (9) — database connection strings, false positive.** All nine are
in cookbook examples or migration scripts with the placeholder credentials
`ai:ai@localhost:3306/ai` and `singlestore_user:singlestore_password@…`.
These are developer-getting-started examples, not production credentials.

**IAC-254 and IAC-351 (3) — hardcoded secret in config/demo, false positive.**
The `cookbook/91_tools/mcp/mcp_toolbox_demo/` directory ships a local demo with
`password: my-password` in its `docker-compose.yml` and `tools.yaml`. This is
a local-only development compose file with a clearly placeholder password. The
demo `README` says "run locally." Not a leaked credential.

**IAC-011 (1) — `pull_request_target` trigger, real but low severity.**
`.github/workflows/pr-triage.yml` uses the `pull_request_target` event, which
runs in the repository's privileged context (has access to secrets and write
permissions). The attack scenario — a malicious PR checking out and executing
untrusted code under this trigger — requires a `checkout` step that is not
present here. The workflow uses only `actions/github-script@v7` to interact
with PR metadata; there is no code execution from the PR author's branch.

The trigger pattern is inherently higher-risk than `pull_request`, and a future
maintainer adding a checkout step could introduce the pwn-request vector without
realising it. Worth tracking. Not exploitable as written.

**IAC-012 and IAC-317 (3) — untrusted event data in expression, false positive.**
These fire on `claude.yml` because `${{ github.event.comment.body }}` is
interpolated into the workflow's `if:` expression and into an `env:` variable.
The `if:` block uses GitHub's expression evaluator (not a shell), so injection
is not possible there. The `env:` variable is then consumed as `$COMMENT_BODY`
in a shell `echo "$COMMENT_BODY" | grep …` — the env-var pattern with quoting
is the *correct* safe approach, not the injection-vulnerable inline interpolation
`run: echo ${{ github.event.comment.body }}`. Both are false positives.

## The AI findings: 397, and the interesting ones

### MCP-009 (5) — tool-poisoning phrases, all false positive (and one is funny)

The five MCP-009 hits are:

- Four cookbook example files demonstrating prompt injection guardrails
- One in `libs/agno/agno/guardrails/prompt_injection.py:18`

That last one is worth quoting:

```python
class PromptInjectionGuardrail:
    def __init__(self, injection_patterns=None):
        self.injection_patterns = injection_patterns or [
            "ignore previous instructions",   # ← MCP-009 fires here
            "ignore your instructions",
            "you are now a",
            "forget everything above",
            ...
        ]
```

MCP-009 exists to detect MCP tool descriptions that contain instruction-override
phrases — real tool-poisoning payloads. It correctly fires on those strings
anywhere in `.py` files. But here the strings live inside a Python list that is
the guardrail's *detection vocabulary*. The scanner flagged the anti-injection
guard for containing injection phrases. The rule is technically correct; the
context is entirely defensive.

This is a known FP shape for MCP-009: code that implements prompt injection
detection *must* contain the strings it detects. The rule's `IgnoreInComments`
flag already suppresses matches in code comments; it does not suppress matches
in list literals. Short-term workaround: add `# nox:ignore MCP-009` at the
class level, or exclude `guardrails/` from MCP-009 scope in `.nox.yaml`. We
are tracking this pattern for a precision pass in a future release.

### AI-007 (3) — API key logged, false positive — **and we fixed it**

All three AI-007 hits are absence notifications, not credential leaks:

```python
# dalle.py:52
log_error("OPENAI_API_KEY not set. Please set the OPENAI_API_KEY environment variable.")

# azure_openai.py:45
log_error("AZURE_OPENAI_API_KEY not set")
```

The rule pattern fires on any log call that mentions `openai_api_key` or
`anthropic_api_key`. Logging "this key is missing" is the correct developer
UX. Logging the actual key value is the security issue.

This is a rule precision bug. The fix: add `ExcludeContextKeywords` of `"not
set"`, `"not found"`, `"not configured"`, and similar phrases to AI-007. When
the match lands on a line that also contains one of these phrases, the finding
is suppressed. The fix ships in this PR's `core/analyzers/ai/rules.go` change
with a regression test (`TestNoDetect_APIKeyNotSetMessage`).

### AI-002 (4) — user input into prompt template, false positive

The one lib hit (`agno/agent/_tools.py:626`) is:

```python
content=f"User inputs retrieved: {json.dumps(user_input_result, ensure_ascii=False)}"
```

This is a tool-call result message that JSON-serialises the user's input fields
before sending them back to the LLM. `json.dumps` provides structural encoding
— this is not raw string interpolation of untrusted input. The three cookbook
hits are in `dual_level_hitl/` example files demonstrating human-in-the-loop
patterns. No true positives.

### AI-019 (3) — tokenizer loaded without hash verification, plausible but by design

`agno/utils/tokens.py` loads HuggingFace tokenizers with
`Tokenizer.from_pretrained("Xenova/llama-3-tokenizer")` and similar. These are
*tokenizer* models (not inference models) fetched from trusted HuggingFace Hub
namespaces for local token counting. The supply-chain risk exists in principle
— a compromised namespace upload could swap a tokenizer — but the practical
severity is very low: a tampered tokenizer breaks token counting, it does not
execute code or exfiltrate data. By-design; no fix needed.

### AI-030 (15) — excessive tool permissions, all false positive

All 15 are in `cookbook/11_approvals/` and similar example directories that
specifically demonstrate the Agno approval and human-in-the-loop system.
Registering broad tools is the point of the examples; the examples also show
how to gate them with approval hooks. One lib hit (`agno/context/fs/provider.py`)
builds a `FileTools` instance with `enable_save_file=False` — not excessive.

### AI-031 (50) — agent has shell execution, mixed

The 26 cookbook hits are in demos that explicitly demonstrate shell-capable
agents. The 24 lib hits largely land at lines in `agent/_run.py` that handle
tool list filtering and requirements management — not shell execution. The one
library hit worth noting: `agno/models/anthropic/claude.py:684` wires the
Anthropic `code_execution_tool` when the model is configured to support it.
This is an intentional integration of the Claude API's sandboxed code-execution
feature, not an unsafe shell attachment.

## Nothing to disclose

No genuine exploitable vulnerability. The IAC-011 `pull_request_target` finding
is worth adding to the repo's workflow review backlog, but it is not a
reportable security issue. No credentials, no live injection paths, nothing
requiring coordinated disclosure. If anything here had been a true positive
requiring responsible disclosure, we would have contacted the maintainers before
publishing.

## `.nox.yaml` to cut the noise

For any repo with a large examples/cookbook tree:

```yaml
scan:
  exclude:
    - "cookbook/**"
    - "**/examples/**"
    - "**/tests/**"
    - "**/*_test.py"
    - "**/migrations/**"
```

That collapses ~900 of the 1,277 findings immediately. What remains is the
`libs/` source: 574 findings, of which the genuine count is 0-1 (the IAC-011
workflow concern is outside libs).

For the MCP-009 guardrails FP specifically:

```yaml
scan:
  rule_overrides:
    - id: MCP-009
      exclude_paths:
        - "**/guardrails/**"
        - "**/prompt_injection*"
```

## The honest takeaway

1,277 findings; zero true positive security issues in the library code; one
workflow pattern worth reviewing; and two rule precision bugs worth fixing.

The most memorable finding from this scan is the scanner flagging a class whose
entire job is to detect prompt injection — because it stores the injection
phrases it is looking for. Context is not something regex alone can judge.

We shipped the AI-007 fix today. The MCP-009 guardrail-context case is tracked
for a precision pass.

```sh
nox scan . --offline
```

Nox is open source (Apache-2.0): <https://github.com/nox-hq/nox>.
