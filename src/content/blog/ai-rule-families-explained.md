---
title: "Inside Nox: the four AI rule families that matter for LLM apps"
description: "AI-PI, AI-EMB, AI-AGENT, MCP-* — what they catch, why every other scanner misses them, and how the AIBOM ties it all together."
publishedAt: 2026-05-05
author: nox-hq
tags: [ai-security, mcp, llm, deep-dive]
---

Most security scanners treat LLM API calls like any other HTTP request:
"line 47 calls `requests.post`, here's a generic dependency CVE for the
http library." That's not enough when the application is an AI app.

Nox ships four dedicated rule families specifically because the threat
model for AI apps is structurally different. This post walks each
family, with code examples, the rule semantics, and the reason no
generic SAST catches them.

## AI-PI: prompt injection at the call site

**What it catches.** A call to a chat completion API where caller-controlled
content interpolates directly into a user message without an explicit
instruction-isolation boundary in the system message.

```python
# Fires AI-PI-001
client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": f"Summarise: {user_input}"}],
)
```

```typescript
// Fires AI-PI-002
await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: `Translate to French: ${userText}` }],
});
```

**Why generic SAST misses it.** Snyk Code, Semgrep, and CodeQL treat
`chat.completions.create` as a black-box function call. They have no
notion of "the user-message field is a prompt." Nox's rule is shaped
around the prompt structure: it knows that a system message is the
isolation boundary, that delimiters reduce LLM01 risk, and that
interpolation directly into `messages[].content` without isolation is
the canonical foot-gun.

**Coverage.** Python (openai, anthropic, mistral SDKs), Go (agent-go,
openai-go), TypeScript (openai, vercel-ai), Java, Ruby. AI-PI-001..010.

## AI-EMB: embedding leakage

**What it catches.** A secret or PII value flows through the same
function (or across files via TAINT-AI) into a vector store ingest call.

```python
# AI-EMB-001 fires
api_key = os.environ["OPENAI_API_KEY"]
embeddings = OpenAIEmbeddings(api_key=api_key)
vectors = embeddings.embed_documents([
    f"User account: {api_key}",   # secret reaches the embedding
    *user_documents,
])
```

**Why generic secret scanners miss it.** A traditional secret scanner
flags `OPENAI_API_KEY` if it's checked into source. It doesn't flag
`OPENAI_API_KEY` flowing into a vector store, because the scanner has
no model of "this function persists vectors that an LLM agent later
retrieves." The leak surface is the embedding, not the source file.

**Coverage.** OpenAI Embeddings, Cohere Embed, HuggingFace, Voyage AI,
sentence-transformers, Pinecone / Weaviate / Qdrant / Chroma /
LanceDB ingest paths. AI-EMB-001..006.

## AI-AGENT: tool-context over-privilege

**What it catches.** Two or more "exfiltration-shaped" tools registered
under the same agent context. Classic combinations:

- `file_read` + `http_request` — exfiltrate local files via outbound HTTP
- `shell_exec` + `clipboard_read` — pivot through user clipboard
- `database_query` + `email_send` — DB → email exfil

```python
# AI-AGENT-001 fires
agent = Agent(tools=[
    file_read_tool,
    http_request_tool,   # <- second tool that lets the LLM exfil what file_read returned
    code_interpreter,
])
```

**Why generic SAST misses it.** No SAST has a model of "tool surface."
This is OWASP LLM07 — the agent lattice is a graph problem, not a
data-flow problem. Nox's AI-AGENT rules pattern-match on tool
registration constructs across LangChain, CrewAI, agent-go, OpenAI
Assistants, and the MCP SDK.

**Coverage.** AI-AGENT-001..008. Severity scales with the
combination's exploitability — file+http is high, internal-only
function pairings are medium, single-tool agents don't fire at all.

## MCP-*: MCP server hardening

**What it catches.** Misconfigurations in MCP server implementations:
missing workspace allowlists, unbounded output sizes, tool schemas
that accept caller-supplied `tools` arrays, long-running tools without
cancellation, etc.

```python
# MCP-001 fires — no workspace allowlist
@mcp.tool()
def read_any_file(path: str) -> str:
    return Path(path).read_text()   # ← reads anywhere on disk

# MCP-005 fires — accepts caller-defined tools
async def handle_request(request):
    tools = request.get("tools", [])
    for tool in tools:
        register_runtime_tool(tool)   # ← caller can inject tools
```

**Why this matters.** MCP is becoming the standard wire protocol for
AI agents to call tools. Every MCP server is effectively a privilege-
elevation surface. The 8 MCP-* rules in core (bundled, not a plugin
add-on) are the only cohesive coverage of this surface in any scanner
today.

## AIBOM: tying it together

The four rule families above produce findings. Findings tell you
*where* an issue is. AIBOM tells you *what AI surface area exists* in
the codebase at all.

```bash
nox scan . --format ai-bom --output ai.inventory.json
```

The output is one JSON document covering every detected:

- **Model invocation** (which model, which call site, which file)
- **Auth env var** (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
- **Endpoint** (https://api.openai.com vs a self-hosted vLLM)
- **Tool registration** (which tools are exposed to which agents)
- **Vector store** (which embedding models feed which stores)
- **MCP server / client** (which servers are imported, which tools they expose)

For a polyglot codebase — Python ingest pipeline, Go service layer,
TypeScript frontend — the AIBOM is one source of truth for "what is
this app's AI surface?". Audit teams have asked for this for years;
no traditional SBOM gets close.

## Try the families on your repo

```bash
brew install felixgeelhaar/tap/nox
nox scan . --severity-threshold high
```

If you're shipping LLM features and your existing scanner is silent on
AI-PI / AI-EMB / AI-AGENT / MCP-*, you have a real coverage gap. The
families above are the wedge — pair them with `nox bench --autocorpus`
on your own repos, see what fires, and triage from there.

Open an issue with a code pattern we should detect but don't yet.
Every rule in Nox started with someone showing us code that should
have caught fire and didn't.
