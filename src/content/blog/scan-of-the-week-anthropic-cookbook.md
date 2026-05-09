---
title: "Scan of the week: anthropic-cookbook (or, what 1.95M findings teach you about precision)"
description: "We pointed Nox at anthropic-cookbook. It returned 1,950,121 findings. Almost all of them are wrong. Here is what that taught us about RAG-corpus false positives, the literal_eval / eval distinction, and how a real CLAUDE-uses-MCP fixture trips the AI-004 rule."
publishedAt: 2026-05-09
author: nox-hq
tags: [scan-of-the-week, ai-security, false-positives, precision]
---

We rotate Nox through one open-source AI repo every two weeks. This week's
target: [`anthropics/anthropic-cookbook`](https://github.com/anthropics/anthropic-cookbook),
the canonical examples-and-recipes repo for the Claude API. 360MB on disk,
480-odd files, a mix of Python source, Jupyter notebooks, JSON fixtures,
RAG corpus snapshots, and CSV evaluation outputs.

Headline number first, because if we hide it the rest of this post sounds
like spin:

> **`nox scan .` → 1,950,121 findings.**

That is not a useful number. So we spent the rest of the morning on what
it actually means.

## The 99.9% you can ignore

Filtering to AI-specific rules (`AI-*`, `MCP-*`, `TAINT-*`, `DATA-*`, `VULN-*`)
collapses the count from **1,950,121** to **2,408**. The other ~1.95M
findings are secret-detector hits inside data files — JSON RAG corpora,
CSV evaluation snapshots, generated notebook outputs. Pattern entropy
caught long base64 strings inside scraped documentation chunks and decided
they might be tokens. They aren't.

```sh
# Scan with the cookbook's data lanes ignored:
cat <<EOF > .nox.yaml
exclude:
  - "**/data/**"
  - "**/*.ipynb"
  - "**/results.csv"
  - "scripts/**"
EOF
nox scan .
```

This is the right answer for cookbook-style repos: data and notebook
output is generated, not source. The `.nox.yaml` above takes total
findings from `1,950,121` to **a few hundred**. We're going to land a
preset for "AI cookbook layout" so future readers don't have to discover
this themselves.

## What the AI rules actually flagged

After excluding data files but before triage, the AI-rule histogram:

| Rule | Severity | Count | What it claims |
|------|----------|-------|----------------|
| `AI-026` | medium | 849 | LLM prompt or response logged without redaction |
| `AI-007` | high | 376 | LLM API key or token logged or printed |
| `AI-006` | medium | 231 | Prompt or LLM response logged without redaction |
| `AI-028` | medium | 215 | LLM seed not set, causing non-deterministic output |
| `AI-009` | critical | 11 | LLM output passed to code execution function |
| `AI-018` | high | 7 | LLM output used to construct file system path |
| `AI-012` | high | 8 | LLM-generated text used directly in database query |
| `AI-004` | critical | 4 | MCP server exposes file system write tool without restrictions |

We sampled the loudest critical and high findings against the source.
Here's what came back.

### AI-009: `ast.literal_eval` ≠ `eval`

```python
# capabilities/retrieval_augmented_generation/evaluation/eval_retrieval.py:14
def evaluate_retrieval(retrieved_links, correct_links):
    correct_links = ast.literal_eval(correct_links)
    ...
```

`AI-009` exists to catch `eval(llm_output)` and friends. `ast.literal_eval`
is the safe form — it parses Python literals (strings, numbers, lists,
dicts, booleans, None) and refuses to execute anything else. **False
positive.** We'll tighten the rule to skip `ast.literal_eval` and `json.loads`
on the next core release.

A second `AI-009` hit fires on `nltk.download("punkt", quiet=True)` because
`download` is on the keyword list. Same fix: scope the keyword to function
names that actually execute code.

### AI-007: placeholder strings in error messages

```python
# claude_agent_sdk/site_reliability_agent/examples/sre_bot_slack.py:88
print("       ANTHROPIC_API_KEY=your-anthropic-key")
```

The bot prints a setup hint when env vars are missing. The string
`ANTHROPIC_API_KEY=your-anthropic-key` is the placeholder, not a real
token. `AI-007` flags it because the line contains both the secret name
and an `=`. We need a "looks like an instruction, not a value" check —
detecting `your-`, `<...>`, `${...}`, and `xxx`-style placeholders.

This pattern repeats across the 376 AI-007 findings. After excluding data
files and adding a placeholder check we expect this rule's volume on the
cookbook to drop into single digits.

### AI-018: function-arg paths aren't LLM output

```python
# skills/file_utils.py:138
output_dir = os.path.dirname(output_path)
```

`AI-018` flags any path construction near a known LLM call site. Here
`output_path` is a *function argument* — the caller chose the path; the
LLM didn't. We need taint-style data-flow tracking before claiming this
came from an LLM. Until then this rule will keep over-firing in any
codebase that defines path-handling helpers.

### AI-004: real concern, wrong file

```
claude_agent_sdk/chief_of_staff_agent/audit/report_history.json:9
"MCP server exposes file system write tool without restrictions"
```

`report_history.json` is an *audit log* of past agent actions, not an MCP
server config. The rule's pattern-matched on JSON keys that look like
tool definitions. The cookbook's actual MCP server configs do declare
`Write` and `Edit` tools — that's part of the demo — but our rule needs
to read the manifest, not the audit history.

This one is the most interesting because the worry is real. A Claude
agent in a cookbook example *does* get unrestricted file-write tools.
That is correct for a teaching repo. But "this kind of config in a
production codebase" is exactly the thing we want to surface. The rule
needs to know it's looking at config, not at history.

## What the post is not

We are not posting this to embarrass anthropic-cookbook. The cookbook is
exactly what it claims to be: a teaching repo full of working examples.
Most of the findings above are signal that **Nox** needs precision work,
not that the cookbook needs hardening.

Specifically, what we'll change in the engine after this scan:

1. **Path-aware exclusions**: ship a `.nox.yaml` preset for cookbook /
   notebook / RAG-corpus repos so the secret-detector noise goes away
   without per-user config.
2. **AI-009 scope tightening**: exclude `ast.literal_eval`, `json.loads`,
   `nltk.download`, and similar from the "executes LLM output" set.
3. **AI-007 placeholder detection**: refuse to flag values that match
   placeholder patterns (`your-...`, `<...>`, `${...}`, `xxx-token`).
4. **AI-018 taint integration**: only fire when the path argument is
   demonstrably tainted from an LLM source — wire up the existing
   taint-analysis plugin instead of regexing call sites.
5. **AI-004 manifest-vs-audit detection**: require the JSON to declare
   an MCP `tools` array with handler bindings before flagging it as an
   exposed tool.

The cookbook stays a great pile of examples to learn from. Nox stays a
work in progress on precision. Both can be true.

## Reproduce

```sh
git clone --depth 1 https://github.com/anthropics/anthropic-cookbook
cd anthropic-cookbook
nox scan . --format json --output nox-out

# Headline (over-firing) number:
jq '.findings | length' nox-out/findings.json

# AI-only:
jq '[.findings[] | select(.RuleID | test("^AI-"))] | length' nox-out/findings.json

# AI by rule:
jq '[.findings[] | select(.RuleID | test("^AI-"))]
    | group_by(.RuleID)
    | map({rule:.[0].RuleID, count:length, sev:.[0].Severity})
    | sort_by(-.count)' nox-out/findings.json
```

Findings JSON, fingerprints, and per-file breakdowns are deterministic —
your numbers should match ours on Nox `v0.9.4` against
`anthropics/anthropic-cookbook@3f8bf35`.

## Next up

Two weeks: `deepset-ai/haystack`. Curious about that one because Haystack
is one of the few RAG frameworks with explicit guardrails for ingestion;
we want to see whether our `DATA-*` rules over- or under-fire on a repo
that's actively trying to handle PII at ingest.

Want a specific repo scanned? Open an issue with the
[`scan-of-the-week`](https://github.com/Nox-HQ/nox/issues?q=label%3Ascan-of-the-week)
label or PR your suggestion to
[`docs/scan-of-the-week-queue.txt`](https://github.com/Nox-HQ/nox/blob/main/docs/scan-of-the-week-queue.txt).
