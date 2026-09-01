---
title: "Scan of the week: SWE-agent — git SHAs, test data, and one rule we fixed"
description: "Nox scanned princeton-nlp/SWE-agent and returned 153 findings. The genuine signal is 5 mutable GitHub Action tags. SEC-457 matched git SHAs as Iterable API keys — our bug, now fixed."
publishedAt: 2026-09-01
author: nox-hq
tags: [scan-of-the-week, ai-security, false-positives, precision]
---

Every two weeks we point Nox at one open-source AI project and report what we
find — honestly, including our own false positives. This week:
[`princeton-nlp/SWE-agent`](https://github.com/princeton-nlp/SWE-agent), the
autonomous software-engineering agent from Princeton NLP, at commit `3ea751c`.

Headline number first:

> **`nox scan .` → 153 findings.**

Here is what that actually means.

## Where the findings live

153 is not a helpful number on its own. Let's break it down by directory:

| Directory | Findings | % of total |
|---|---|---|
| `tests/` | 61 | 40 % |
| `sweagent/ + tools/` | 51 | 33 % |
| `.github/` | 12 | 8 % |
| `trajectories/` | 19 | 12 % |
| `docs/` | 5 | 3 % |
| root (`README`, `pyproject.toml`) | 5 | 3 % |

Sixty-one of those 153 come from `tests/test_data/` — a directory holding
JSON debug fixtures from past runs. Nineteen come from `trajectories/` —
recorded demonstration trajectories that ship with the repo. Five are author
emails in `README.md` and `pyproject.toml`. Subtract directories that are
not production source code and the number drops to ~68, and most of those
are still noise.

## The critical findings: both false positives

Two critical-severity findings — both wrong.

**AI-PI-002 (critical): false positive.** The rule "user-tainted value flows
into system-role message" fired on `sweagent/inspector/server.py:52`:

```python
"messages": [{"role": "system", "content": f"Submission generated - {exit_status}"}],
```

This is not an LLM API call. It is constructing a data structure appended to
a trajectory for the inspector UI — a visualization layer that replays past
runs. The `messages` key is trajectory schema, not an OpenAI/Anthropic request
body. `exit_status` is read from the recorded trajectory file, not from live
user input over a network. The rule needs a reachability check before flagging
a `{role, content}` dict as an injected prompt.

**IAC-254 (critical): false positive.** "Serverless environment variable with
hardcoded secret" in `trajectories/demonstrations/str_replace_anthropic_demo.yaml:410`:

```yaml
api_key:
```

The value is empty. It is a template placeholder in a demonstration file.
No secret is present; the rule matched the key name, not a value.

## The dominant noise source: git SHAs pretending to be API keys

SEC-457 fired 18 times on `tests/test_data/data_sources/debug_20240322.json`
with the message "Detected Iterable API Key". Every match was a 40-character
git SHA like `953f29f700a60fc09b08b2c2270c12c447490c6a`.

This is a bug in our own rule. SEC-457's pattern was `[a-z0-9]{32}` — no
word boundary. The regex engine happily matched the first 32 characters of a
40-character SHA. The keyword guard (`iterable`) was supposed to limit this to
files that reference Iterable's SDK, but the JSON debug fixture contained
`Iterable` from a Python `typing` import in the code being debugged.

Three other rules (SEC-574, SEC-629, SEC-697) fired on the same file for the
same reason: a 32-character path fragment like
`/liams/281ce539915a947a23db17137d91aeb7` in a URL — exactly 32 hex chars at
a word boundary — passed both the `\b` guards those rules already had *and*
matched the keywords "wise", "lob", "split", and "literal" because those
words appear constantly in Python source code.

**The fix (shipped with this scan):** SEC-457 now uses `\b[a-z0-9]{32}\b`
with `secretShape: true` and `minEntropy: 3.5`, consistent with SEC-455
(Segment API key) which already had this right. Word boundaries prevent
matching 32-char substrings of longer hex strings; a 40-char SHA produces
no match because the 33rd character is still alphanumeric.

The fix ships with a regression test:

```go
// 40-char SHA in a JSON file with "iterable" in a key name: must not fire
{"iterable_cursor": null, "commit": "953f29f700a60fc09b08b2c2270c12c447490c6a"}
// real 32-char Iterable key: must still fire
{"iterable_api_key": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"}
```

Both pass. SEC-574/629/659/697 are tracked issues — the generic keywords
("split", "literal", "wise") need narrowing, but the right fix there is more
nuanced than a word boundary and is tracked separately.

## The AI findings: 22 total, none disclosable

SWE-agent returned 22 AI-* findings and 0 MCP-* findings.

**AI-002 (high): false positive.** "Direct string concatenation of user input
into prompt template" at `sweagent/agent/reviewer.py:394`:

```python
user_message = Template(self._config.instance_template).render(
    **ps_format_dict, **submission.to_format_dict(),
    traj=self._traj_formatter.format_trajectory(submission.trajectory),
)
```

This is Jinja2's `Template.render()` — a proper template engine, not
f-string concatenation. The rule pattern is too broad: it fires on any
function call whose result is placed into a prompt context, regardless of
whether the call is a safe template render or raw concatenation.

**AI-022 (high) — temperature too high: false positive (×4).** The benchmark
config at `config/benchmarks/250212_sweagent_heavy_sbl.yaml` sets
`temperature: 1.` for the `o1` model. OpenAI's o1 series requires
`temperature: 1` — it is a required parameter value, not a tuning choice.
The other three hits are in trajectory recordings and a documentation example.

**AI-006 (medium) — prompt logging (×11):** Six hits in actual source files
(`action_sampler.py`, `reviewer.py`, `web_browser_utils.py`) log LLM
completions and formatted prompts to a debug logger. Five hits are in
`trajectories/demonstrations/*.traj` files — recorded outputs, not source.

The source-file hits are technically real: LLM responses are logged
unredacted. For SWE-agent's threat model (coding tasks on GitHub issues, no
PII, debug logs consumed only by the operator running the scan), the risk is
minimal. The trajectory-file hits are false positives — the scanner shouldn't
treat demonstration recordings as production code.

**AI-045 (medium) — self-modification: false positive.** Fired on
`docs/installation/tips.md:23`, which advises running `docker pull
sweagent/swe-agent-run:latest` to fetch updated images. This is documentation
about updating a Docker image, not an AI agent modifying itself.

**AI-PI-002 (critical):** covered above (false positive).

## The genuine signal

Stripping all false positives and documentation noise, the real findings are:

- **IAC-013 × 5 (high):** Mutable GitHub Action tags (`v3`, `v4`) in
  `check-links-periodic.yaml`, `check-links-pr.yaml`, and `pytest.yaml`.
  These should be pinned to commit SHAs. This is a genuine, low-severity
  supply chain hardening opportunity — not an active exploit, but worth fixing.
- **IAC-157 × 4 (medium):** Deprecated v1/v2 Action major versions in
  the same files. Same root cause as the IAC-013 hits.
- **IAC-314 × 1 (medium):** `build-docs.yaml` carries `contents: write`
  permission. Scope reduction to `pages: write` would be cleaner.

Those 10 findings across three workflow files are the entire actionable output
of this scan. The rest is noise.

## The SLOP-001 story (54 findings)

SLOP-001 ("imported package not declared in any dependency manifest") fired 54
times — the largest single rule. Almost all are false positives from
Python's hyphenated-package/import-name mismatch: `swe-rex` in `pyproject.toml`
becomes `swerex` at the import site; `GitPython` becomes `git`. The scanner
resolves package names to import names using prefix normalization, but does
not yet handle the hyphen-to-underscore / strip-suffix cases reliably. This
is a known gap tracked separately.

## Nothing to disclose

No leaked credential, no exploitable code path, no live secret. SWE-agent is
a research tool that never handles user PII, and its security boundary is
operator-controlled. There is nothing here requiring coordinated disclosure.

## Scope it down with `.nox.yaml`

If you run Nox on SWE-agent (or a repo with a similar layout), a two-line
scope file cuts the noise dramatically:

```yaml
scan:
  exclude:
    - "trajectories/**"
    - "tests/test_data/**"
    - "docs/**"
```

Trajectory recordings and test fixtures are not production code. Excluding
them focuses the scanner on what matters.

## The honest takeaway

153 → 10. That is this scan's compression ratio. The productive output is five
mutable GitHub Action tags and a few CI hardening nits — all in `.github/`,
none in application code. SWE-agent's Python source is clean by the metrics
that matter.

What made this scan interesting was what it caught in our own rules: SEC-457
matching git SHAs, AI-PI-002 misidentifying trajectory display data as prompt
injection, and AI-002 conflating Jinja2 template rendering with unsafe string
concatenation. Precision work is never finished.

Run it on your own project:

```sh
nox scan . --offline
```

Nox is open source (Apache-2.0): <https://github.com/nox-hq/nox>.
