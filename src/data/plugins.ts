export type PluginEntry = {
  name: string;
  summary: string;
  /** Whether the plugin is published in the official registry with a
   * Cosign keyless signature. Surfaced as a "✓ Verified" badge on the
   * marketplace page and used to filter the featured row. */
  verified?: boolean;
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
      { name: 'nox-plugin-container', summary: 'Dockerfile linting, image vulnerability scanning, container SBOM (22 rules)' },
      { name: 'nox-plugin-sast', summary: 'Language-specific vulnerability detection (SQL injection, XSS, path traversal) — 10 rules' },
      { name: 'nox-plugin-reachability', summary: 'Multi-language reachability for VULN findings (Go, PyPI, npm, Cargo, Maven, RubyGems, NuGet)', verified: true },
      { name: 'nox-plugin-taint-analysis', summary: 'Cross-file & interprocedural taint flow including AI source-to-sink (TAINT-001..007 + TAINT-AI-001/002)', verified: true },
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
      'Runtime-facing plugins for active testing of deployed services and environments with explicit opt-in.',
    plugins: [
      { name: 'nox-plugin-api-abuse', summary: 'API authorization testing (BOLA, BFLA, rate-limit) — 5 rules' },
      { name: 'nox-plugin-attack-surface', summary: 'Static endpoint extraction and exposure mapping (Go, Python, JS/TS frameworks)' },
      { name: 'nox-plugin-dast', summary: 'DAST web/API probes — HTTP misconfig (DAST-001..006) plus opt-in AI-DAST: prompt injection, system prompt leak, tool smuggling, cost amplification (DAST-007..010)', verified: true },
      { name: 'nox-plugin-k8s-runtime', summary: 'Live Kubernetes cluster security scanning (KRUNT-001..008)', verified: true },
      { name: 'nox-plugin-red-team', summary: 'Attack chain analysis and HTTP validation (REDTEAM-001..010)', verified: true },
      { name: 'nox-plugin-ai-eval', summary: 'Adversarial prompt corpus runner — jailbreak / system-leak / role-confusion / tool-misuse against a chat endpoint (AI-EVAL-001..004)', verified: true },
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
    description: 'Integrity and provenance checks for build outputs, dependencies, and release artifacts.',
    plugins: [
      { name: 'nox-plugin-depconfusion', summary: 'Dependency confusion detection and prevention across npm, PyPI, RubyGems, Maven' },
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
    description: 'Plugins that turn findings into enforceable policy and compliance decisions.',
    plugins: [
      { name: 'nox-plugin-baseline-mgmt', summary: 'Finding baseline snapshots, diff, and triage — brownfield migration enabler' },
      { name: 'nox-plugin-policy-gate', summary: 'Policy evaluation and CI gate (pass/fail) — 5 rules' },
      { name: 'nox-plugin-grc', summary: 'GRC compliance assessment across 12 frameworks (SOC2, ISO 27001, GDPR, FedRAMP L/M/H, HIPAA, PCI-DSS, NIST 800-53, NIST CSF, CIS v8, CMMC)', verified: true },
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
      { name: 'nox-plugin-threat-explain', summary: 'LLM-enhanced finding explanations and impact analysis (8 rules + LLM)' },
      { name: 'nox-plugin-threat-model', summary: 'STRIDE-based auto-modeling with optional AI threat generation (5 rules + LLM)' },
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
    description: 'Threat intelligence plugins that provide context, correlation, and early signal amplification.',
    plugins: [
      { name: 'nox-plugin-risk-score', summary: 'EPSS / KEV vulnerability prioritization and severity scoring' },
      { name: 'nox-plugin-threat-enrich', summary: 'CVE enrichment, CWE mapping, and MITRE ATT&CK correlation (13 rules)' },
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
    description: 'AI-assisted explanation and remediation planning plugins for human and agent users.',
    plugins: [
      { name: 'nox-plugin-triage-agent', summary: 'LLM-powered finding prioritization and false-positive reduction (4 rules + LLM)' },
    ],
  },
];

export const pluginTotalCount = pluginTracks.reduce((total, track) => total + track.plugins.length, 0);

/** Cosign-keyless-signed plugins surfaced as the featured "Verified
 * marketplace" row on the homepage and at the top of /plugins. The
 * order is curated for marketing impact (security depth first, then
 * AI-specific differentiators). */
export const verifiedPlugins: PluginEntry[] = pluginTracks
  .flatMap((t) => t.plugins.map((p) => ({ ...p, _track: t.id })))
  .filter((p) => p.verified)
  .map(({ _track, ...rest }) => rest);
