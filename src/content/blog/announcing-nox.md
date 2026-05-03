---
title: "Announcing Nox: the security scanner that understands your AI app"
description: "Open-source, AI-native security scanner with a cosign-signed plugin marketplace. 19 verified plugins, 717 rules, MCP-native. No SaaS, no telemetry, no source upload."
publishedAt: 2026-05-03
author: nox-hq
tags: [launch, ai-security, supply-chain]
---

If you're shipping LLM features — `chat.completions.create`, RAG ingest, agents
with tool calls, MCP servers — you've discovered that existing security
scanners don't actually understand any of it. They scan dependencies, they
scan IaC, they catch the occasional hard-coded API key. But the prompt
injection in your `request.json → service hop → chat.completions.create`
flow? The system prompt that leaks because someone wrote `f"... {user_input}"`
in the wrong place? The MCP server that exposes `file_read` and `http_request`
in the same tool context? Silence.

We built Nox to fix that.

## What Nox does

Nox is an open-source, language-agnostic security scanner with first-class AI
application security. Single binary. Apache 2.0. No SaaS. No telemetry. Source
code never leaves the build host.

It catches what other scanners miss:

- **Prompt injection** at the call site — `AI-PI-*` rules across Python, Go, TypeScript
- **Embedding leakage** when secrets / PII land in vector stores — OWASP LLM06
- **Agent over-privilege** — when `file_read` and `http_request` share an agent context (LLM07)
- **MCP server hardening** — 8 dedicated rules for MCP gateway misconfigurations
- **Cross-file AI taint** — `request.json` → service hop → `chat.completions.create` across functions and files
- **Polyglot AIBOM** — Python ingest + Go service + TypeScript frontend produce one inventory naming every model invocation, auth env var, and endpoint

It also covers the boring stuff every team needs: 160 secret detectors, 369
IaC rules, dependency CVEs with reachability filtering, container linting,
and 12 PII detection rules. **717 rules total**, deterministic, offline.

## Cosign-signed plugin marketplace

Every official plugin in the Nox marketplace ships cosign keyless signatures
tied to its `release.yml` workflow OIDC subject. The default trust policy is
fail-closed: install refuses an unsigned drop unless you explicitly opt out.

Trust chain:

```
cosign(checksums.txt) signed by release.yml workflow OIDC
   ⇒ checksums.txt contains <hex>  <tarball-name>
   ⇒ tarball SHA-256 == registry artifact.Digest (verified at install)
```

This is the security primitive Nox is built around: no plugin runs on your
host without supply-chain integrity. We launched today with **19 verified
plugins** across 7 tracks — every one of them cosign-signed, every install
verified at fetch time.

## Manifest-driven plugin pinning

Treat security plugins like dependencies. Pin them in `.nox.yaml`:

```yaml
# .nox.yaml — package.json for security
plugins:
  required:
    - nox/reachability
    - nox/taint-analysis
    - nox/grc
  trust_policy: default
```

Anyone cloning your repo gets the same verified plugins on first scan. CI
gets the same set as local. No dashboard config, no per-team drift.

## Agent-native via MCP

Give your AI agent secure, read-only access to scan results:

```json
{
  "mcpServers": {
    "nox": {
      "command": "nox",
      "args": ["serve", "--allowed-paths", "/path/to/repo"]
    }
  }
}
```

Read-only tools, workspace allowlisting, output size limits, sandboxed
execution. Drop-in for Claude Desktop, Cursor, Continue, or any MCP-aware
host. No competitor has an agent surface.

## Try it

```bash
brew install felixgeelhaar/tap/nox
nox scan .
```

That's the whole installation. The first scan will write a `findings.json`
into your current directory. Add `--format all` to also emit SARIF, CycloneDX,
SPDX, AIBOM, and a standalone HTML report.

## What's next

- **AI-DAST probes** beyond DAST-007..010 (the four we just shipped) —
  context-window attacks, function-call injection variants, RAG-pivot probes
- **First-party VSCode extension** — issue #47, started this week
- **Scan-of-the-week** posts: scan a popular open-source LLM SDK each week,
  publish what fired and what would have if the rule existed
- **Conference CFPs**: BSides AI, KubeCon Sigstore track, DEF CON AI Village

If you ship LLM features and want a security scanner that actually understands
what you're building, install Nox and tell us what you find. The repo is
[github.com/Nox-HQ/nox](https://github.com/Nox-HQ/nox). Open an issue, file a
PR, or just star the repo — every signal helps us prioritise.
