---
title: "Scan of the week: RAGFlow — 546 findings, three precision bugs, nothing to disclose"
description: "Nox scanned infiniflow/ragflow at f9a53a3: 546 findings, 50 AI-* and 4 MCP-*. SEC-080 on translation files and MCP-009/MCP-011 on the wrong context were our bugs, now fixed. Real signal: TLS skip, mutable GA tags, a privileged sandbox container."
publishedAt: 2026-11-17
author: nox-hq
tags: [scan-of-the-week, ai-security, false-positives, precision]
---

Every two weeks we point Nox at one open-source AI project and report what we
find — honestly, including our own false positives. This week:
[`infiniflow/ragflow`](https://github.com/infiniflow/ragflow) — a full-stack
RAG engine with an agent runtime, MCP server, and sandboxed code execution —
at commit `f9a53a3`.

(Note: the queue entry read `ragflow-io/ragflow`. The correct GitHub org is
`infiniflow`; the queue has been corrected.)

Headline number first:

> **`nox scan . --offline` → 546 findings.**

This is a medium-sized codebase compared to what we've scanned before. Let's
see where those 546 go.

## A quarter of it is one rule on translation files

**198 of the 546 findings are SEC-080** ("Generic password assignment
detected"). Of those, 149 fire inside `web/src/locales/` — the i18n
translation files. Here's what triggered it, in Arabic:

```ts
// web/src/locales/ar.ts
password: 'كلمة المرور',
passwordDescription:
  'الرجاء إدخال كلمة المرور الحالية لتغيير كلمة المرور الخاصة بك.',
```

These are UI label strings. The rule is matching the key name `password` on
the left side of a TypeScript object literal, where the value is a translated
display string. That's not a credential — it's a label. The same pattern fires
across every locale file in the directory (Arabic, Chinese, Japanese, Korean,
French, Turkish, Portuguese, Russian, …).

That is our bug, not RAGFlow's: a translation catalogue is not a place where
passwords are assigned. **Fixed on main** ([nox#1100](https://github.com/nox-hq/nox/pull/1100)):
SEC-080 no longer reports a key named `password` in a file under a locale
directory (`locales/`, `i18n/`, `translations/`, …) whose name or folder is a
language tag (`ar.ts`, `zh-CN.json`, `de/common.yaml`). Re-running the same
scan with the fix drops 146 of these findings and nothing else from SEC-080. A
real password in an ordinary config file — or in `locales/index.ts`, which is
not a catalogue — is still reported. The fix ships in the next release; until
then, a `.nox.yaml` exclude does the same job:

```yaml
scan:
  exclude:
    - "web/src/locales/**"
```

## Two MCP rule precision bugs we exposed

This scan found two distinct precision bugs in Nox's own MCP rules, on top of
SEC-080. We're calling them out rather than hiding them.

### MCP-009 fires on a security pattern database

MCP-009 ("MCP tool metadata contains an instruction-override phrase") fired
at `internal/cli/filesystem/skill_hub/security/patterns.go:74,95` with
**high severity**. The file defines Go structs that hold detection regexes
for prompt injection, like:

```go
Pattern:   `(?i)ignore\s+(?:\w+\s+)*(previous|all|above|prior)\s+instructions`,
PatternID: "prompt_injection_ignore",
```

This is RAGFlow's *own* injection-detection library — the string is a
detection pattern, not an injection attempt. MCP-009 matched the pattern
*content* rather than any actual MCP tool description field. **False
positive.** The rule needs to scope its match to MCP tool description/schema
fields (JSON `description`, `annotations`) rather than any in-memory string
that happens to contain instruction-override vocabulary.

### MCP-011 fires on a UI cancellation message

MCP-011 ("MCP tool metadata stages credential/secret exfiltration") fired
**critical** at `web/src/pages/user-setting/data-source/component/gmail-token-field.tsx:349`
(and the matching Google Drive file). The triggering line:

```tsx
message.warning(
  'Verification canceled. Upload the credential again to restart.',
);
```

This is a React `message.warning()` call shown to the user when they cancel
an OAuth authorization flow. The word `credential` in a user-facing UI string
is not MCP tool metadata and is not exfiltrating anything to anyone. **False
positive.** The rule's confidence was correctly set to `low`, but the severity
(`critical`) overstates the signal. The fix is to constrain matching to actual
MCP server config or tool-schema contexts, not arbitrary TypeScript string
literals.

Both are **fixed on main** in the same change ([nox#1100](https://github.com/nox-hq/nox/pull/1100)):
MCP-009 no longer reports a detection table — a string next to a `PatternID`
field — and MCP-011 no longer reports text in a `.tsx`/`.jsx` component that
defines no agent tool. A component that does register one (WebMCP
`registerTool`, an AI SDK `tool()`) is still checked. With all three fixes the
same scan reports 396 findings instead of 546: exactly the 146 SEC-080, 2
MCP-009 and 2 MCP-011 findings above, and nothing new.

### AGENT-004 on AGENTS.md coding conventions

AGENT-004 ("Data-exfiltration or concealment directive in an agent rules
file") fired at `web/AGENTS.md:187` — a markdown file that documents
React coding conventions for the web frontend (naming, component structure,
reuse). It is in the same AGENTS.md format popularized by agentic coding
tools, but its content is entirely harmless style guidance. The flagged line
is a formatting preference, not a directive to any running agent. **False
positive** (medium/low confidence, correctly marked low).

## The genuine signal

Strip the locale-file noise, the MCP rule misfires, and the test-email
DATA-001 hits, and you get a tighter list of real findings:

**TLS certificate verification disabled (HARDEN-001, high ×5)**
Five places in the Go code set `InsecureSkipVerify: true`:
`internal/cli/http_client.go`, `internal/cli/common_command.go` (×2),
`internal/engine/elasticsearch/client.go`, and `internal/utility/http_client.go`.
The developers have documented the trade-off with CodeQL suppressions
(`// codeql[go/disabled-certificate-check] Local cluster self-signed`), but
the risk is real: if an operator configures a remote URL for the API server or
Elasticsearch backend, TLS is not verified and a network attacker can
intercept the connection. **True positive — documented but real.**

**Mutable GitHub Action tags (IAC-013, high ×9)**
Nine steps in `.github/workflows/release.yml` and `release-python.yml` are
pinned to tag references (`uses: actions/something@v3`) instead of commit
SHAs. Supply-chain standard: pin by digest. **True positive.**

**Privileged sandbox container (IAC-007, critical ×1)**
The `sandbox-executor-manager` service in `docker/docker-compose-base.yml`
runs with `privileged: true`. The comment explains why — it's the sandboxed
code execution backend, restricted to loopback. This is an intentional design
choice that RAGFlow has documented, but it carries container-escape risk in
multi-tenant contexts and deserves a note in deployment guides. **True
positive — by design, not hidden.**

**Root containers and COPY ownership (IAC-001 ×4, IAC-123 ×21)**
Dockerfiles run as root and use COPY without `--chown`. Well-understood
hardening gap; worth a CI check but no urgency.

**SHA1 / MD5 in messaging integrations (CRYPTO-001 ×16)**
DingTalk and WeCom webhook adapters use SHA1 for HMAC signatures (required by
those platforms' own APIs). OceanBase and Vastbase schema files use MD5 for
internal checksums. These are platform constraints, not independent design
choices. Worth noting, low exploitability.

## AI-specific findings: mostly noise, one worth watching

Of the 50 AI-* rule hits:

- **AI-017 ×19** ("excessively high token limit"): every tool adapter in
  `internal/agent/tool/` (arxiv, bgpt, duckduckgo, github, google, pubmed,
  tavily, wikipedia, …) got one. The summarization middleware also has a
  `DefaultMaxTokens = 160000` constant. These are intentional upper bounds
  on how much context each tool can return; they're not "unlimited". The rule
  fires when a constant or parameter name contains a token-limit concept and
  the value is high. At low confidence across component defaults, this is
  mostly noise.

- **AI-039 ×13** ("AI webhook uses insecure HTTP"): nine of these are in test
  fixtures. The remaining four include a template default
  (`docker/service_conf.yaml.template:160` — a localhost URL), an Akshare tool
  that calls a finance data API over HTTP, a WhatsApp gateway binding, and test
  assertions. The Akshare call to an HTTP endpoint in a production tool handler
  (`internal/agent/tool/akshare.go:257`) is the one finding worth a look —
  if that API's response is ever used without validation, the HTTP transport
  could allow manipulation. Medium severity; the team should confirm.

- **AI-006 ×4** (production): the findings land on `fmt.Printf("Answer: %s\n",
  r.Answer)` in a CLI display function, a migration-log message that includes
  a field *name* (not content), and a panic message. None of these are
  unredacted logging of sensitive prompts. **False positive.**

## AI inventory

Nox found a rich component picture: an MCP runtime (`internal/mcp/`), the
agent-go framework wired to E2B sandbox execution, 8 embedded RAG prompt
templates, pgvector, and model references for Claude and GPT-4o (unpinned
in the provider registry). No pinned model digest anywhere in the codebase —
all model names are mutable string references.

## Nothing to disclose

No leaked credential, no exploitable code path, no novel vulnerability. The
InsecureSkipVerify instances and the privileged container are documented
design decisions the RAGFlow team is aware of. There is nothing here that
requires coordinated disclosure — and we wouldn't publish it if there were.

## Suggested `.nox.yaml`

```yaml
scan:
  exclude:
    - "web/src/locales/**"   # i18n strings — not secrets
    - "tools/chatgpt-on-wechat/**"  # vendored third-party plugin
    - "deps/**"              # downloaded binary deps
```

## Takeaway

546 findings → 56 we confirmed as real (HARDEN-001 ×5, IAC-013 ×9, IAC-007 ×1,
IAC-001 ×4, IAC-123 ×21, CRYPTO-001 ×16) → 0 to disclose. The biggest single
source of noise was our own: SEC-080 on translation files, plus two MCP
precision misfires. All three are fixed, and the same scan now reports 396. The genuine hardening work is well-defined: pin
GA tags by SHA, add a TLS-verify flag for configurable remote targets, drop
root from the production Dockerfiles, and audit the Akshare tool's HTTP call.

Nox is open source (Apache-2.0): <https://github.com/nox-hq/nox>.
