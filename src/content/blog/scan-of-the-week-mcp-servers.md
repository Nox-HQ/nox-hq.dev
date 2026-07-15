---
title: "Scan of the week: modelcontextprotocol/servers — 41 findings, 2 critical, both ours"
description: "Nox scanned the official MCP reference servers: 41 findings total. The only 'critical' hits were our own IAC-351 misfiring on a standard GitHub OIDC permission line."
publishedAt: 2026-07-15
author: nox-hq
tags: [scan-of-the-week, ai-security, false-positives, precision]
---

Every two weeks we point Nox at one open-source AI project and report what we
find — honestly, including our own false positives. This week:
[`modelcontextprotocol/servers`](https://github.com/modelcontextprotocol/servers),
Anthropic's canonical reference implementations for MCP (filesystem, git, memory,
fetch, time, sequential-thinking, and more), at commit `d31124c`.

> **`nox scan .` → 41 findings.**

That is the smallest headline number this series has produced. Here is what it means.

## The full breakdown

| Severity | Count | After triage |
|---|---|---|
| Critical | 2 | 0 real (2 FP) |
| High | 5 | 3 real, 2 FP |
| Medium | 27 | 14 real, 13 FP |
| Low | 5 | 3 real, 2 advisory |
| Info | 2 | 2 advisory |
| **Total** | **41** | **17 genuine signal** |

This is a clean project. But two of the three "easy dismissals" turned out to be
our bugs, not theirs.

## The two critical findings: a false positive we just fixed

IAC-351 — "CI variable with hardcoded secret" — fired as **critical** on two lines:

```yaml
# .github/workflows/claude.yml, line 25
permissions:
  id-token: write

# .github/workflows/release.yml, line 116
permissions:
  id-token: write   # Required for trusted publishing
```

These are standard GitHub Actions OIDC token permission declarations. There is no
secret here. The value `write` is a permission level, not a credential.

The root cause: our IAC-351 pattern was `(?i)(?:PASSWORD|SECRET_KEY|TOKEN)\s*:\s*['"]?[A-Za-z0-9]`.
The word `TOKEN` matches as a suffix inside `id-token` because the regex had no line
anchor. The value `write` satisfies `[A-Za-z0-9]`. Critical severity fires. Completely
wrong.

**The fix:** anchor the pattern to line start and require that TOKEN is preceded only
by alphanumerics or underscores (env-var style), not a hyphen:

```
old: (?i)(?:PASSWORD|SECRET_KEY|TOKEN)\s*:\s*['"]?[A-Za-z0-9]
new: (?im)^\s*(?:PASSWORD|SECRET_KEY|(?:[A-Z0-9_]*_)?TOKEN)\s*:\s*['"]?[A-Za-z0-9]
```

The multiline anchor `(?im)^\s*` means the match must begin at the start of a YAML
key. `id-token` starts with `id-` which is not a match for any of the alternatives;
`MY_TOKEN` or bare `TOKEN` still matches. The fix ships with a regression test that
checks both the positive case (a genuine hardcoded `DEPLOY_TOKEN` value) and the
negative case (`id-token: write` must not trigger).

## The real high-severity findings

The three genuine high-severity findings are all **IAC-013: GitHub Action pinned to
mutable tag**.

| File | Action | Tag |
|---|---|---|
| `.github/workflows/claude.yml` | `anthropics/claude-code-action` | `@v1` |
| `.github/workflows/python.yml` | `astral-sh/setup-uv` | `@v3` |
| `.github/workflows/release.yml` | `astral-sh/setup-uv` | `@v5` |

Mutable tags mean a supply-chain actor who compromises the action repository could
push a new commit under the same tag. Pinning to a full commit SHA (`@abc1234...`)
makes the dependency immutable. All three are confirmed true positives; none
requires coordinated disclosure since this is the project's own CI configuration
and the risk is to the project's own pipeline, not users.

One other IAC-013 note: `claude-code-action@v1` also triggers **IAC-157
("deprecated major version")** — double-flagging the same action. Whether `@v1`
is "deprecated" is debatable for an actively maintained action; this finding is
advisory at best.

## The two other high-severity false positives

**SEC-356 high — PostgreSQL connection string in README.md:128.**
The flagged content:

```json
"args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
```

A documentation example with `localhost` and `mydb` as obvious placeholders. Not
a real credential. This is a known FP pattern for SEC-356 that we track but have
not yet fixed; the placeholder-detection heuristic needs work.

**SEC-803 high — "Detected Anthropic API key" in `.github/workflows/claude.yml:37`.**
The flagged line:

```yaml
anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

The rule pattern `anthropic[_-]?api[_-]?key` matches the YAML _key name_, not the
value — and the value `${{ secrets.ANTHROPIC_API_KEY }}` is a proper GitHub Actions
secret reference, not a hardcoded credential. This is a structural gap: SEC-803
needs to require a value that looks like an actual key, not merely that a field
named `anthropic_api_key` exists. Tracked; not fixed in this scan because the fix
needs a more careful value-shape filter than we are confident enough to ship today.

## The MCP-022 findings

Two **info-severity** findings landed on `.mcp.json`:

```json
{
  "mcpServers": {
    "mcp-docs": {
      "type": "http",
      "url": "https://modelcontextprotocol.io/mcp"
    }
  }
}
```

MCP-022 ("MCP config trusts a remote server with no protocol-level identity")
fired **twice** — once for line 4 (`"type": "http"`) and once for line 5
(`"url": ...`). Both findings describe the same server. This is a double-count
in our MCP rule; a single advisory per configured server is the right behaviour.
The underlying observation is accurate — the development config pulls from a
remote HTTP endpoint without SHA pinning — but for a project-internal tooling
file the advisory severity (info) is appropriate, and the double-count inflates
the issue list without adding information.

There is a particular meta-quality here: the canonical MCP reference implementation
trusting a remote MCP server in its own contributor `.mcp.json` is exactly the
pattern MCP-022 is meant to surface. The advisory is technically correct. We flag
it anyway, then immediately note it is a developer tooling choice made by the
project authors, not a user-facing risk.

## The medium-severity signal

Of the 27 medium findings:

- **CONT-001 ×14** — fourteen Docker base images are tagged but not digest-pinned
  (`node:22.12-alpine`, `python:3.12-slim-bookworm`, etc.). Genuine supply-chain
  hygiene findings across six Dockerfiles. Each is a two-word fix.
- **IAC-306 ×2** — two workflows request `id-token: write` (OIDC). Expected for
  trusted publishing and the claude-code-action workflow; noted, not alarming.
- **IAC-314** — release workflow has `contents: write`. Expected for a release
  pipeline that cuts tags.
- **TAINT-004** — `src/filesystem/lib.ts:271` flagged for "untrusted input reaching
  a path traversal sink". The sink is `fs.writeFile(tempPath, ...)` where `tempPath`
  is a randomly-named temporary file. The actual user-supplied path was validated
  by `validatePath()` at `index.ts:403` before `applyFileEdits` was called. Our
  taint-flow analysis does not track interprocedural path validation, so it reports
  the write without seeing the upstream check. **False positive; the path is safe.**
- **VULN-002 ×2** — `lie@3.3.0` flagged as a possible typosquat of `lit`, and
  `safer-buffer@2.1.2` flagged as a possible typosquat of `safe-buffer`. Both are
  well-established npm packages with hundreds of millions of downloads; neither is a
  typosquat. Our typosquatting heuristic has a low-confidence problem with short
  package names.
- **DATA-001 ×5** — email addresses in `pyproject.toml` author fields and workflow
  config. Attribution, not exposure.

## Nothing to disclose

The three IAC-013 (mutable GitHub Actions) findings apply to the project's own CI,
not to downstream users. The fourteen unpinned Docker images are a reproducibility
and supply-chain hygiene note for the maintainers. Nothing in this scan constitutes
an exploitable vulnerability in the MCP servers themselves — the server
implementations are read-only from Nox's perspective and no secrets were found.

**Nothing to disclose.**

## `.nox.yaml` exclude tip

This is a compact repo and 41 findings is already low noise. If you want to filter
the Docker-image and OIDC-permission advisory findings for a project structured
similarly:

```yaml
scan:
  exclude:
    - "**/Dockerfile*"    # CONT-001: handle in your container build pipeline
    - "README.md"         # SEC-356: docs placeholder strings
```

Leave everything else. 41 findings is a number worth reading.

## The honest takeaway

The official MCP reference servers are clean. The two "critical" findings were
entirely our own rule misfiring on a standard OIDC permission line. Three GitHub
Actions are using mutable version tags in CI — a real but low-risk hygiene item.
Fourteen Docker images are undigested. That is the complete finding list for one
of the most scrutinised AI infrastructure projects in the ecosystem.

We found the IAC-351 critical false positive on a canonical project and fixed it.
Starting with the next scan, `id-token: write` will not fire as a critical secret.

```sh
nox scan . --offline
```

Nox is open source (Apache-2.0): <https://github.com/nox-hq/nox>.
