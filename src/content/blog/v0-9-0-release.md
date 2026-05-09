---
title: "Nox v0.9.0 — K8s drift detection, triage history, and a remediation action"
description: "v0.9.0 ships cluster-vs-IaC drift detection, JSON-backed triage history for AI-assisted review, a strict PR gate for high/critical findings, and a marketplace action that opens dependency-remediation PRs."
publishedAt: 2026-05-09
author: nox-hq
tags: [release, kubernetes, ai-security, ci]
---

`v0.9.0` is mostly a delivery release: things we promised on the roadmap landed.
Four pieces are worth calling out — they change what Nox covers, how teams
review its output, and how easy it is to wire into CI.

## Cluster-vs-IaC drift detection

The K8s runtime plugin gained a second tool, `drift`, that compares live
workloads against the Pod / Deployment / StatefulSet / DaemonSet manifests
declared on disk. Four new rules:

- `KDRIFT-001` — running image differs from declared
- `KDRIFT-002` — resource limits drift (or removed)
- `KDRIFT-003` — `securityContext` is **less restrictive** than declared
- `KDRIFT-004` — running workload not declared in IaC (unmanaged)

The `securityContext` check is intentionally one-sided: tightening (e.g.
adding `runAsNonRoot: true`) is not flagged. Only privilege escalation,
re-introduced root, dropped non-root enforcement, and newly-added
dangerous capabilities count as drift. We'd rather not be the tool that
fires on improvements.

```sh
nox plugin invoke nox/k8s-runtime drift \
  --input iac_path=k8s/manifests \
  --input namespace=production
```

## Triage history for AI-assisted review

When you (or an LLM) confirms a triage decision, that decision now persists
to `.nox/triage-history.json`. On the next run, similar findings can pull
prior verdicts in as few-shot examples — so the AI triage step learns from
the team's actual judgment instead of re-arguing with itself every PR.

The store is keyed by `(fingerprint, context_hash)`, atomic on save, and
ships with `Export` / `Import` for sharing across team members:

```sh
nox triage history export > shared-triage.json   # commit to your repo
nox triage history import < shared-triage.json   # merge teammates' decisions
```

## PR gate that actually blocks

The CI workflow now ships with a dedicated `pr-gate` job:

```yaml
- uses: nox-hq/nox@v0.9.0
  with:
    severity-threshold: high
    changed-since: origin/${{ github.base_ref }}
```

Scoped to changed files only via `--changed-since`, so it's fast even on
big monorepos, and **fails the build** on any new high or critical
finding. Set it as a required check and you have a real merge gate
without a SaaS.

## A marketplace action for dependency remediation

[`nox-hq/nox-remediate-action@v1`](https://github.com/Nox-HQ/nox-remediate-action)
is a composite action that wraps `nox scan` + `nox fix` and opens a
remediation PR. Drop it into your repo and you get Dependabot-style
automation — repository-local, no SaaS:

```yaml
- uses: nox-hq/nox-remediate-action@v1
  with:
    path: .
    verify-cmd: 'go test ./...'
```

It runs the project's verify command before opening the PR so reviewers
never see untested upgrades.

## What else landed

- `assist/` providers expanded: Anthropic, Ollama, OpenAI, plus
  `NOX_AI_*` env-driven resolution so plugins don't hard-code
  provider config.
- Terraform graph analyzer now models data sources, child modules, and
  `depends_on` edges — feeding the cross-resource rules
  `IAC-366..369`.
- Roady tasks 39, 40, 41, 42, 44, 45, 46, 47, 48, 50, 51, 52, 53,
  54, 55, 56 closed.

## Get it

```sh
brew upgrade nox-hq/tap/nox            # macOS / Linux
go install github.com/nox-hq/nox/cli@latest
docker pull ghcr.io/nox-hq/nox:v0.9.0
```

The full changelog lives on the
[release page](https://github.com/Nox-HQ/nox/releases/tag/v0.9.0).
