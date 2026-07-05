---
title: "Scan of the week: LangGraph — 134,614 findings, and the 'critical' one was us"
description: "Nox scanned langchain-ai/langgraph: 134,614 findings, 99.8% noise. The lone critical AI finding flagged code that prevents the attack. Zero true positives; one AI-019 rule fix."
publishedAt: 2026-06-21
author: nox-hq
tags: [scan-of-the-week, ai-security, false-positives, precision]
---

Every two weeks we point Nox at one open-source AI project and report what we
find — honestly, our own false positives included. This week:
[`langchain-ai/langgraph`](https://github.com/langchain-ai/langgraph), the
stateful agent orchestration framework, at commit `2b1abc8`.

> **`nox scan .` → 134,614 findings.**

That number is big enough to stop any triage before it starts. Here is what it
actually means.

## 92% is Jupyter notebook image data

The top three rules — SEC-616 ("Firebase Cloud Messaging Key"), SEC-692 ("ELK
Stack API Key"), SEC-659 ("Split API Key") — together account for 86,417
findings, almost all under `examples/`. Opening one of those notebooks reveals
why: line 14 is the start of a base64-encoded PNG attached as a cell attachment.
A 200 KB image in base64 reliably contains substrings that match API-key
patterns. The scanner is doing its job faithfully; the corpus is wrong.

The next largest contributor is `libs/langgraph/uv.lock` — 5,967 "Prometheus
API Key" hits, SEC-680, every single one a package hash. Same story in
`libs/cli/js-examples/yarn.lock` (462 "IBM Cloud API Key" hits, SEC-533).
Lock files are not source code.

A `.nox.yaml` that contains the signal:

```yaml
scan:
  exclude:
    - "examples/**"
    - "**/*.lock"
    - "**/package-lock.json"
```

After those three lines, the total collapses by more than 99%.

## The AI/MCP findings: 30 → zero real

Nox produced 30 AI- and MCP-prefixed findings. We opened every one at source.

**AI-019 (high, ×20) — false positive, and we fixed it.** The message was
"Model loaded without hash verification." The actual code:

```python
# psycopg3 checkpoint store
self.supports_pipeline = Capabilities().has_pipeline()

# Redis cache store
async with conn.pipeline() as pipe:
```

The rule targets HuggingFace's standalone `pipeline("task")` function — a
legitimate supply-chain concern when called without a hash pin. But the Go RE2
pattern `pipeline\s*\(` matches any occurrence of the string `pipeline(`,
including the tail of method names like `has_pipeline()` and method calls like
`conn.pipeline()`. There is no negative lookbehind in RE2; we fixed it with a
character-class guard that requires `pipeline` to be preceded by a non-word,
non-dot character: `[^.a-zA-Z0-9_]pipeline\s*\(`. Four regression tests, all
green. This eliminates false positives on psycopg3, redis-py, and any other
library whose client API includes a `.pipeline()` method.

**MCP-011 (critical, ×1) — false positive, rule limitation noted.** The
finding read: "MCP tool metadata stages credential/secret exfiltration (tool
poisoning)." The actual code:

```python
def _validate_reconnect_location(base_url: httpx.URL, location: str) -> str:
    """Validate that a reconnect Location URL is same-origin as the base URL.

    Raises ValueError if the Location header points to a different origin
    (scheme + host + port), which would leak credentials to an external server.
    """
    parsed = urlparse(location)
    if not parsed.scheme and not parsed.netloc:
        return location
    # ... origin comparison, raises ValueError on mismatch
```

The rule matched `leak credentials` in the docstring that explains what the
function *prevents*. The code is a security control that deliberately validates
same-origin on SSE reconnect redirects — exactly the kind of defensive code
that should *not* fire. Nox's `applyMCPProsePrecision` already sets
`IgnoreInComments` for MCP-011, but Python docstring body lines start with
spaces, not `#`, so the comment-filter does not apply to them. We are tracking
this as a precision gap; a fix requires extending the defensive-context check
to docstring bodies.

**AI-008 (medium, ×1), AI-036 (medium, ×4) — false positive.** All five fire
on `chat_agent_executor.py` lines 341–356 — which is a Python docstring code
block showing a `ModelContext` dataclass with `gpt-3.5-turbo` as an example
value. Documentation, not production configuration.

**AI-039 (medium, ×1) — false positive.** "AI webhook uses insecure HTTP" on
`_async/client.py:111` where `url = "http://api"` is the internal base URL for
an in-process ASGI transport. The server lives in the same Python process; there
is no real HTTP request.

**AI-050 (medium, ×3) — false positive.** "AI API retries disabled" on three
locations in the SDK's SSE streaming code. The flagged expressions are
`retry = False` (a loop-control boolean in the reconnect logic) and
`self._retry = None` (resetting the SSE `retry:` field per-event, as
specified by the SSE spec). Neither disables retries; they are protocol
implementation details.

## The critical GitHub Actions findings

Two IAC-011 (critical) findings flagged `pull_request_target` triggers in
`.github/workflows/require_issue_link.yml` and `tag-external-prs.yml`. Both
workflows explicitly annotate: `NEVER CHECK OUT UNTRUSTED CODE FROM A PR's HEAD
IN A pull_request_target JOB.` Neither does so — they call the GitHub API via
`github-script` to manage labels and comments. The trigger is intentional and
safe; the rule has no way to verify whether code is actually checked out from
the PR branch, so it flags the trigger alone. False positives.

IAC-254 and IAC-351 (critical) flagged `POSTGRES_PASSWORD: postgres` in five
`docker-compose` test files. This is a local-test credential. It is also the
Docker-compose Postgres default and is used by thousands of open-source
projects' test stacks. The remaining IAC-254 hits (`_integration_test.yml:6`,
`_sdk_integration_test.yml:6`) matched `required: false` inside a
`workflow_call.secrets` block — a secrets *declaration*, not a hardcoded value.

The SEC-073 (critical, ×23) database-connection-string findings are
`postgresql://postgres:postgres@localhost/test` in test fixtures and
docker-compose files. Same story.

IAC-015 flags lines like
`echo "LANGSMITH_API_KEY=${{ secrets.LANGSMITH_API_KEY }}" >> .env` in the
integration test workflow. Using `${{ secrets.* }}` expansion inside a `run:`
block rather than an environment variable is a GitHub Actions hygiene note —
GitHub masks the value in logs, but writing it into a file via shell expansion
is slightly less safe than using the env-var form
(`echo "LANGSMITH_API_KEY=$LANGSMITH_API_KEY"`). Low severity, easy to
improve, genuinely worth noting.

## Nothing to disclose

After opening every high and critical finding against source: zero genuine,
exploitable vulnerabilities in LangGraph. The codebase is actively maintained.
The only real pattern we spotted — IAC-015 in one integration test workflow —
is a low-severity style note that poses no practical risk given GitHub's secret
masking. There is nothing here requiring coordinated disclosure.

## The honest takeaway

134,614 → zero. The scanner's loudest finding this week — a critical-severity
MCP tool-poisoning alert — landed on code that implements a security check to
*prevent* credential exfiltration. The most useful output was surfacing a
pattern bug in our own `AI-019` rule that would have produced the same false
positive on any project using psycopg3 or redis-py. We fixed that. Run it on
your own project:

```sh
nox scan . --offline
```

Nox is open source (Apache-2.0): <https://github.com/nox-hq/nox>.
