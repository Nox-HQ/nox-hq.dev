---
title: "We scanned the 56 most-used MCP servers. Zero vulnerabilities. Here's what we actually learned."
description: "We ran Nox's offline MCP security scanner against the 56 most-used public MCP servers. Zero vulnerabilities, zero disclosures — and a hard lesson in scanner precision."
publishedAt: 2026-06-05
author: nox-hq
tags: [mcp, ai-security, false-positives, precision, owasp-mcp-top-10]
draft: false
---

Nox just shipped MCP threat detection: rules for tool poisoning, rug-pull
(definition drift), authorization and SSRF, and shadow / cross-server tool
shadowing — all mapped to the [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/).

Before asking anyone to trust it, we pointed it at the ecosystem: **56 of the
most-used public MCP servers** — the official `modelcontextprotocol/servers`
monorepo plus official servers from AWS, GitHub, Microsoft, Stripe, Sentry,
Cloudflare, MongoDB, Snowflake, Notion, Supabase, Grafana, Atlassian, and dozens
more — plus 17 of our own.

The headline isn't a vulnerability count. It's the opposite.

## Finding 1: the ecosystem is clean

> **Across all 56 servers: zero genuine MCP vulnerabilities. Zero findings
> requiring disclosure.** 35 of the 56 came back completely clean.

No tool poisoning, no rug-pulls, no token passthrough, no shadowed tools — in
any of them. We opened every critical- and high-severity hit against source and
explained each one. Worth saying plainly: the most-installed MCP servers are
well-built. This isn't a hit list. We have nothing to disclose, and that's the
point.

## Finding 2: the hard problem is precision, not detection

A scanner that cries wolf is worse than no scanner. Our early passes were
noisy — and every false positive taught us something. Some of the bugs we found
*in our own scanner*, fixed in the open:

- **A rule that matched the word `false`.** Our "content filtering disabled"
  check was missing a regex group, so it matched bare `null` / `false` /
  `disabled` anywhere. On one server it fired **6,327 times** — almost all on a
  single auto-generated TypeScript type-definition file. A real bug, with a real
  fix and a regression test.
- **A rule that matched `"35"`.** The "deprecated GPT-3.5" check was loose
  enough to match the digits `35` in version strings and hashes. It now requires
  a `gpt-` prefix.
- **Flagging a maintainer's own defenses.** Our SSRF rule fired on a server's
  *blocklist* of cloud-metadata IPs — code doing exactly the right thing. We
  taught the rule to recognize a deny-list context.
- **A 1.4 MB minified bundle hiding in a `.ts` file.** One server ships a build
  artifact as a string export. Filename filters missed it, so we added
  content-based detection of generated and minified blobs (an `AUTO-GENERATED`
  banner or a minified line) regardless of extension.

False positives collapsed round over round. The biggest single example:

> One server's MCP/AI findings went from **6,327 → 0** purely from fixing the
> `false`-matching bug and excluding generated type definitions — with no loss
> of real signal.

Where it landed across all 56 servers, after the precision work:

| | Count |
|---|---|
| Servers scanned | 56 |
| Servers completely clean | 35 |
| MCP-/AI-specific findings | 130 |
| — critical | 0 |
| — high | 14 |
| — medium | 85 |
| — informational (advisories) | 31 |
| **True positives** | **0** |
| **Findings needing disclosure** | **0** |

We opened all 14 high-severity hits against source. Every one is an explained
false positive — a security test carrying a deliberate attack string, a log
line that prints a config key's *name* (never its value), an `Mcp-Session-Id`
in a CORS allow-list, a "confirm before you write" UX guardrail, a language-
server binary download mistaken for a model load. The 31 informational findings
are advisories on remote-server config, by design. Every fix is locked behind a
regression test, so the noise can't come back.

## The near-miss that says it all

Our tool-poisoning rule flagged a line in GitHub's MCP server:

> *"Do NOT tell the user the issue was created… the user MUST click Submit."*

The rule keys on "do not tell the user" — a classic concealment phrase. But the
code is doing the *responsible* thing: telling the model not to claim success
before the user confirms. **The scanner surfaced it; a human cleared it in
seconds.** Machine breadth, human judgment. We'd rather show you a handful of
explainable maybes than hide behind a green check.

## Why this matters: it never left our machines

Every scan ran `--offline`. No API, no token, no telemetry — the scan path makes
zero outbound connections, and that's enforced by a test, not a promise. We
scanned other people's servers without their code ever leaving the runner, and
we have nothing to disclose because there was nothing to find.

That's the whole pitch. Point Nox at your MCP server:

```sh
nox scan . --offline
```

Findings map to the OWASP MCP Top 10 (`properties.owasp-mcp` in the SARIF) and
upload straight to GitHub Code Scanning. It never phones home. We tuned it
against the most popular MCP servers in the world before asking you to run it.

Nox is open source (Apache-2.0): <https://github.com/nox-hq/nox>.
