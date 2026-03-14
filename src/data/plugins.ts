export type PluginEntry = {
  name: string;
  summary: string;
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
      { name: 'nox-plugin-arch-lint', summary: 'Architecture dependency rules and security pattern detection' },
      { name: 'nox-plugin-container', summary: 'Dockerfile linting, image vulnerability scanning, container SBOM' },
      { name: 'nox-plugin-sast', summary: 'Language-specific vulnerability detection (SQL injection, XSS, path traversal)' },
      { name: 'nox-plugin-logic-scan', summary: 'Business logic vulnerability detection with optional AI analysis' },
      { name: 'nox-plugin-mcp-scan', summary: 'MCP server configuration security analysis (8 rules)' },
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
      { name: 'nox-plugin-api-abuse', summary: 'API authorization testing (BOLA, BFLA, rate-limit)' },
      { name: 'nox-plugin-attack-surface', summary: 'Static endpoint extraction and exposure mapping' },
      { name: 'nox-plugin-dast', summary: 'DAST web/API scanning (passive and active modes)' },
      { name: 'nox-plugin-k8s-runtime', summary: 'Live Kubernetes cluster security scanning (8 rules)' },
      { name: 'nox-plugin-red-team', summary: 'Attack chain analysis and HTTP validation (10 rules)' },
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
      { name: 'nox-plugin-artifact-integrity', summary: 'Release verification and build comparison' },
      { name: 'nox-plugin-depconfusion', summary: 'Dependency confusion detection and prevention' },
      { name: 'nox-plugin-provenance', summary: 'SLSA attestation generation and verification' },
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
      { name: 'nox-plugin-baseline-mgmt', summary: 'Finding baseline snapshots, diff, and triage' },
      { name: 'nox-plugin-policy-gate', summary: 'Policy evaluation and CI gate (pass/fail)' },
      { name: 'nox-plugin-risk-register', summary: 'Risk register generation and trend tracking' },
      { name: 'nox-plugin-grc', summary: 'GRC compliance assessment across 12 frameworks including FedRAMP' },
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
      { name: 'nox-plugin-threat-explain', summary: 'LLM-enhanced finding explanations and impact analysis' },
      { name: 'nox-plugin-threat-model', summary: 'STRIDE-based auto-modeling with optional AI threat generation' },
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
      { name: 'nox-plugin-risk-score', summary: 'Utility risk scoring and severity calculation' },
      { name: 'nox-plugin-threat-enrich', summary: 'CVE enrichment and ATT&CK mapping' },
      { name: 'nox-plugin-risk-context', summary: 'Contextual risk scoring based on environment factors' },
    ],
  },
  {
    id: 'incident-readiness',
    number: 7,
    title: 'Incident Readiness & Response',
    riskClass: 'passive',
    ciSafe: 'yes',
    offline: 'yes',
    readOnly: 'yes',
    characteristics: 'Process-focused, zero exploit logic',
    description: 'Readiness and response quality plugins focused on operational resilience.',
    plugins: [
      { name: 'nox-plugin-detect-ready', summary: 'Logging audit and alert coverage analysis' },
      { name: 'nox-plugin-playbook', summary: 'Incident playbook readiness assessment' },
    ],
  },
  {
    id: 'developer-experience',
    number: 8,
    title: 'Developer Experience & Workflow',
    riskClass: 'passive',
    ciSafe: 'yes',
    offline: 'yes',
    readOnly: 'yes',
    characteristics: 'Adapters and helpers, not detection',
    description: 'Workflow plugins that fit NOX outputs into day-to-day engineering practice.',
    plugins: [
      { name: 'nox-plugin-lsp', summary: 'Language server protocol integration for editor diagnostics' },
      { name: 'nox-plugin-orchestrator', summary: 'Scan orchestration, execution planning, and profiles' },
      { name: 'nox-plugin-report-composer', summary: 'Rich reports (Markdown, HTML, JSON) and dashboards' },
    ],
  },
  {
    id: 'agent-assistance',
    number: 9,
    title: 'Agent & Assistance',
    riskClass: 'passive',
    ciSafe: 'yes',
    offline: 'no',
    readOnly: 'yes',
    characteristics: 'Read-only, never changes results',
    description: 'AI-assisted explanation and remediation planning plugins for human and agent users.',
    plugins: [
      { name: 'nox-plugin-case-bundle', summary: 'Finding grouping and severity aggregation' },
      { name: 'nox-plugin-triage-agent', summary: 'LLM-powered finding prioritization and classification' },
      { name: 'nox-plugin-validator', summary: 'Finding validation with optional AI verification' },
    ],
  },
];

export const pluginTotalCount = pluginTracks.reduce((total, track) => total + track.plugins.length, 0);
