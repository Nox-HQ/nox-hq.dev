/**
 * The official plugin catalog, mirroring
 * https://raw.githubusercontent.com/nox-hq/registry/main/index.json
 *
 * The registry moved out of the nox repository in 1.10.0 and into
 * Nox-HQ/registry; nox only consumes the published index over HTTP. Summaries
 * and tracks here are taken from that index so the site and the tool agree.
 * Versions and deprecations are kept in step by scripts/sync-plugins.mjs,
 * which a daily workflow runs; summaries remain hand-written.
 */

export type PluginStatus = 'current' | 'deprecated' | 'retired';

export type PluginEntry = {
  name: string;
  summary: string;
  /** Latest version published to the official registry. */
  version?: string;
  /**
   * Whether the plugin is published in the official registry with a Cosign
   * keyless signature. Surfaced as a "✓ Verified" badge and used to filter
   * the featured row.
   */
  verified?: boolean;
  /**
   * `deprecated` is the registry's own flag — still installable, no longer
   * recommended. `retired` means the capability moved into core and the
   * plugin should not be adopted.
   */
  status?: PluginStatus;
  /** Shown alongside a deprecated/retired badge to say what to use instead. */
  replacedBy?: string;
};

export type PluginTrack = {
  id: string;
  number: number;
  title: string;
  riskClass: 'passive' | 'active';
  ciSafe: 'yes' | 'no';
  offline: 'yes' | 'no';
  readOnly: 'yes' | 'no';
  characteristics: string;
  description: string;
  plugins: PluginEntry[];
};

export const pluginTracks: PluginTrack[] = [
  {
    id: 'core-analysis',
    number: 1,
    title: 'Core Analysis',
    riskClass: 'passive',
    ciSafe: 'yes',
    offline: 'yes',
    readOnly: 'yes',
    characteristics: 'Deterministic, artifact-based, CI-safe',
    description:
      'Static analysis plugins for source and config files. Fast, deterministic, and safe in local and CI workflows.',
    plugins: [
      {
        name: 'nox/reachability',
        version: '0.9.0',
        summary:
          'Multi-language reachability analysis. Annotates VULN findings as unreachable, reachable or undetermined across Go, PyPI, npm, Cargo, Maven, RubyGems and NuGet.',
        verified: true,
        status: 'current',
      },
      {
        name: 'nox/taint-analysis',
        version: '0.7.3',
        summary:
          'Retired and archived. Core\'s taint engine has overtaken it: since nox 1.33.0 the plugin adds no finding core does not already report. Remove it with nox plugin remove nox/taint-analysis; core needs no configuration to replace it.',
        status: 'retired',
        replacedBy: 'core taint engine (TAINT-*)',
      },
      {
        name: 'nox/container',
        version: '0.2.4',
        summary: 'Dockerfile linting, image vulnerability scanning and container SBOM (22 rules).',
        verified: true,
        status: 'current',
      },
      {
        name: 'nox/sast',
        version: '0.2.1',
        summary:
          'Retired in nox 1.10.0. Seven of its nine rules duplicated vulnerability classes the core taint engine already detects, reporting each finding twice under a second rule-ID namespace. Its two additive rules moved into core: weak crypto as CRYPTO-001 and open redirect as TAINT-007.',
        status: 'retired',
        replacedBy: 'core taint engine (TAINT-*, CRYPTO-001)',
      },
    ],
  },
  {
    id: 'dynamic-runtime',
    number: 2,
    title: 'Dynamic & Runtime Security',
    riskClass: 'active',
    ciSafe: 'no',
    offline: 'no',
    readOnly: 'no',
    characteristics: 'Environment-aware, scope-bounded, requires confirmation',
    description:
      'Runtime-facing plugins for active testing of deployed services and environments with explicit opt-in. Per-tool safety declarations (1.9.0) let a read-only tool in one of these plugins run under a passive policy while its active siblings stay gated.',
    plugins: [
      {
        name: 'nox/dast',
        version: '0.3.3',
        summary:
          'DAST web/API probes for HTTP misconfiguration — headers, CORS, TLS, cookies, rate limiting, open redirect — plus opt-in AI-DAST: prompt injection, system-prompt leak, tool smuggling, cost amplification.',
        verified: true,
        status: 'current',
      },
      {
        name: 'nox/k8s-runtime',
        version: '0.7.2',
        summary: 'Inspects running Kubernetes workloads for security misconfigurations and drift.',
        verified: true,
        status: 'current',
      },
      {
        name: 'nox/red-team',
        version: '0.7.2',
        summary:
          'Retired and archived. Exploit hypotheses and evidence-backed validation live in core as nox attack; this plugin duplicated that job and its implementation was empty.',
        status: 'retired',
        replacedBy: 'nox attack (core)',
      },
      {
        name: 'nox/ai-eval',
        version: '0.2.2',
        summary:
          'Adversarial prompt corpus runner. Fires a bundled jailbreak / prompt-leak / role-confusion corpus at a configured chat endpoint and reports which attacks succeeded.',
        verified: true,
        status: 'current',
      },
      {
        name: 'nox/llm-triage',
        version: '0.2.1',
        summary:
          'Optional LLM second opinion. Sends each finding plus a code snippet to a configured chat endpoint and attaches a true/false-positive verdict as an enrichment. Never gates the scan — the deterministic core is unaffected.',
        verified: true,
        status: 'current',
      },
      {
        name: 'nox/api-abuse',
        version: '0.2.3',
        summary: 'API authorization testing for BOLA, BFLA, rate-limit and abuse patterns in server code (5 rules).',
        verified: true,
        status: 'current',
      },
      {
        name: 'nox/attack-surface',
        version: '0.3.0',
        summary:
          'Static endpoint extraction and exposure mapping across Go (net/http, Gin, Echo, Chi), Python (Flask, Django, FastAPI) and JavaScript/TypeScript (Express, Koa, Fastify).',
        verified: true,
        status: 'current',
      },
    ],
  },
  {
    id: 'supply-chain',
    number: 3,
    title: 'Supply Chain & Provenance',
    riskClass: 'passive',
    ciSafe: 'yes',
    offline: 'no',
    readOnly: 'yes',
    characteristics: 'Artifact-centric, high audit value',
    description: 'Integrity and provenance checks for build outputs, dependencies and release artifacts.',
    plugins: [
      {
        name: 'nox/depconfusion',
        version: '0.2.4',
        summary: 'Dependency confusion detection across npm, PyPI, RubyGems and Maven (3 rules).',
        verified: true,
        status: 'current',
      },
    ],
  },
  {
    id: 'policy-governance',
    number: 4,
    title: 'Policy, Risk & Governance',
    riskClass: 'passive',
    ciSafe: 'yes',
    offline: 'yes',
    readOnly: 'yes',
    characteristics: 'Org-specific, non-scanning, consumes findings',
    description:
      'Plugins that turn findings into enforceable policy and compliance decisions. Policy gating and baseline management moved into core, so the two plugins that provided them are deprecated.',
    plugins: [
      {
        name: 'nox/grc',
        version: '0.7.4',
        summary:
          'Governance, Risk & Compliance assessment across 13 frameworks with gap analysis and evidence collection.',
        verified: true,
        status: 'current',
      },
      {
        name: 'nox/policy-gate',
        version: '0.2.0',
        summary: 'Policy evaluation and CI gate — severity thresholds, rule allowlists, finding budgets (5 rules).',
        verified: true,
        status: 'deprecated',
        replacedBy: 'core policy thresholds in .nox.yaml',
      },
      {
        name: 'nox/baseline-mgmt',
        version: '0.2.0',
        summary: 'Finding baseline snapshots, diff and triage — the brownfield migration enabler (4 rules).',
        verified: true,
        status: 'deprecated',
        replacedBy: 'nox baseline',
      },
    ],
  },
  {
    id: 'threat-modeling',
    number: 5,
    title: 'Threat Modeling & Design',
    riskClass: 'passive',
    ciSafe: 'yes',
    offline: 'yes',
    readOnly: 'yes',
    characteristics: 'Review-focused, early design phase',
    description: 'Design-time security analysis plugins for architecture and threat model quality.',
    plugins: [
      {
        name: 'nox/threat-model',
        version: '0.2.2',
        summary:
          'STRIDE-based threat pattern detection in source code, with opt-in AI threat modeling via ai_model: true (5 rules + LLM).',
        verified: true,
        status: 'current',
      },
      {
        name: 'nox/threat-explain',
        version: '0.2.2',
        summary:
          'Retired and archived. Core emits CWE metadata and references, and nox/threat-enrich writes the CWE → OWASP → ATT&CK explanations. Its scan tool returned {} for every input.',
        status: 'retired',
        replacedBy: 'core + nox/threat-enrich',
      },
    ],
  },
  {
    id: 'intelligence',
    number: 6,
    title: 'Intelligence & Early Warning',
    riskClass: 'passive',
    ciSafe: 'yes',
    offline: 'no',
    readOnly: 'yes',
    characteristics: 'Signals not exploits, defensive only',
    description: 'Threat intelligence plugins that provide context, correlation and early signal amplification.',
    plugins: [
      {
        name: 'nox/risk-score',
        version: '0.2.3',
        summary:
          'Retired and archived. EPSS and KEV prioritisation comes from NOX Intelligence, the default advisory source since nox 1.33.0. The plugin never had a working data path, and its stub answered in the dangerous direction.',
        status: 'retired',
        replacedBy: 'NOX Intelligence (core)',
      },
      {
        name: 'nox/threat-enrich',
        version: '0.3.0',
        summary: 'CVE enrichment, CWE mapping and MITRE ATT&CK correlation (13 rules).',
        verified: true,
        status: 'current',
      },
    ],
  },
  {
    id: 'agent-assistance',
    number: 7,
    title: 'Agent & Assistance',
    riskClass: 'passive',
    ciSafe: 'yes',
    offline: 'no',
    readOnly: 'yes',
    characteristics: 'Read-only, never changes results',
    description: 'AI-assisted explanation and prioritization plugins for human and agent users.',
    plugins: [
      {
        name: 'nox/triage-agent',
        version: '0.3.0',
        summary:
          'LLM-powered finding prioritization and false-positive reduction (4 rules + 7 providers: openai, anthropic, gemini, ollama, cohere, bedrock, copilot).',
        verified: true,
        status: 'current',
      },
    ],
  },
  {
    id: 'remediation',
    number: 8,
    title: 'Remediation',
    riskClass: 'active',
    ciSafe: 'yes',
    offline: 'yes',
    readOnly: 'no',
    characteristics: 'Writes to the workspace, opt-in only',
    description:
      'Deterministic remediation planning and application. Since 1.12.0 every post-scan plugin tool is subject to policy, so the tools here that rewrite source stay blocked until an operator sets plugin_policy.max_risk_class: active.',
    plugins: [
      {
        name: 'nox/remediate',
        version: '0.1.2',
        summary:
          'Deterministic remediation planning and application for code findings. Its apply_code and verify_code tools are declared non-read-only and are blocked under the default passive policy until explicitly opted in.',
        verified: true,
        status: 'current',
      },
    ],
  },
];

const allPlugins = pluginTracks.flatMap((track) => track.plugins);

/** Everything the official registry serves, including deprecated and retired entries. */
export const pluginTotalCount = allPlugins.length;

/** Plugins that should be adopted today — excludes deprecated and retired. */
export const currentPlugins: PluginEntry[] = allPlugins.filter(
  (p) => (p.status ?? 'current') === 'current',
);

export const currentPluginCount = currentPlugins.length;

/**
 * Cosign-keyless-signed plugins surfaced as the featured "Verified
 * marketplace" row on the homepage and at the top of /plugins. Deprecated
 * and retired plugins are signed too, but featuring them would recommend
 * something the project no longer recommends.
 */
export const verifiedPlugins: PluginEntry[] = currentPlugins.filter((p) => p.verified);
