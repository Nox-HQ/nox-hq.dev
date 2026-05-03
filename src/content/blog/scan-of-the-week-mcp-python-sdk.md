---
title: "Scan of the week: the MCP Python SDK"
description: "We pointed Nox at modelcontextprotocol/python-sdk and 6 other popular LLM/agent repos. 427 findings on the MCP SDK in 2.2 seconds. Here's what fired and why it matters."
publishedAt: 2026-05-04
author: nox-hq
tags: [scan-of-the-week, mcp, ai-security, bench]
---

We're starting a weekly series: pick a popular open-source repo from the
LLM / agent / MCP ecosystem, run Nox against it, publish what fired. The
goal is not to call out maintainers — every active codebase has findings
— but to demonstrate what AI-aware scanning catches that other tools miss.

This week: [`modelcontextprotocol/python-sdk`](https://github.com/modelcontextprotocol/python-sdk),
the reference SDK for the Model Context Protocol. We chose it first
because (1) MCP is the protocol Nox itself speaks for agent integration,
(2) it's small enough to read, and (3) the rule families that matter for
MCP servers are exactly the families we built Nox for.

## The numbers

```
$ nox bench --autocorpus
[...]
| modelcontextprotocol/python-sdk | 427 findings | 2.208s |
```

7 LLM / agent SDKs scanned in total, runtimes from 1.2s (anthropic-python)
to 6m (llama_index — 5.7M findings, mostly noise we're working to tighten).
Numbers below focus on what's signal.

## What fired and why it matters

Across the 7 repos, the rules that fired in **every single project** are
worth calling out individually:

- **AI-006**: hard-coded model identifier. Every SDK ships pinned model
  names in fixtures. False-positive-prone in test code; we're scoping
  this rule to non-test paths in the next release.
- **AI-026**: insecure logging of prompt content. Hits whenever a debug
  log writes a full request body. Real signal in production code; in
  SDKs the test fixtures generate noise.
- **AI-050**: missing rate-limit context on AI client construction. SDKs
  deliberately don't enforce client-side rate limits, so this fires
  universally. Useful when applied to *application* code that uses the
  SDK; less useful at the SDK layer itself.
- **DATA-001**: PII pattern in source. Test fixtures with synthetic data
  trip this. Lowering severity for fixture paths is on the roadmap.
- **SEC-161/163**: tokens in test files. Same fixture story.
- **IAC-308**: insecure GitHub Actions workflow.

The honest read: when you scan a published SDK, a meaningful chunk of
findings is "the SDK ships test fixtures that look like secrets to a
pattern matcher." That's a known calibration problem. The findings worth
acting on are in **application** code that imports the SDK, not the SDK
itself.

## The findings that actually matter on MCP server code

We're more interested in a different question: *if you're building an
MCP server, what does Nox catch that other scanners miss?* These are
the rules to watch:

- **MCP-001 through MCP-008** — 8 rules covering MCP server hardening:
  workspace allowlisting, output size limits, tool permission scoping,
  resource access bounds, rate limit on tool calls, etc.
- **AI-AGENT-*** — agent over-privilege detection (`file_read` +
  `http_request` exposed in the same tool context, classic LLM07).
- **TAINT-AI-001/002** — cross-file taint where an MCP tool argument
  flows into a chat completion or shell exec without sanitization.

On the reference Python SDK these largely don't fire because the
reference implementation models good practice. They fire on
**MCP servers built on top of the SDK** — your code, the gateways
shipping in production, the third-party MCP plugins your agent
connects to.

If you operate an MCP server in production, run:

```bash
nox plugin install nox/mcp-scan  # bundled by default
nox scan ./your-mcp-server --severity-threshold high
```

## What's coming

- **Better fixture-path heuristics**: rules that fire on canonical
  test paths (`tests/`, `fixtures/`, `*_test.py`) get severity
  downgrades by default in v0.8.
- **Per-rule reachability**: pair every secret/PII finding with the
  reachability plugin so unreachable test-fixture matches don't pollute
  the dashboard.
- **More scan-of-the-week posts**: next week we point Nox at a popular
  agent framework and walk through what fires on real production-shaped
  code (where the test-fixture noise problem doesn't apply).

If there's an open-source LLM / agent repo you want us to scan, open
an issue with the URL and we'll feature it next.
