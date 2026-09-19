#!/usr/bin/env node
// Keeps src/data/plugins.ts in step with the official registry index.
//
// The catalogue is hand-written — summaries and groupings are editorial — but
// its facts are not: every version and every deprecation comes from
// nox-hq/registry. Mirroring those by hand is how the page reached 2026-09 with
// 18 of 21 entries wrong, including four archived plugins, each with a README
// saying "Do not install this plugin", presented as current.
//
// Versions are mechanical, so this rewrites them. Anything that needs words —
// a plugin missing from the page, a page entry the registry no longer lists,
// or a registry-deprecated plugin the page still calls current — is reported
// and exits 1, because a summary or a "use this instead" is a human's to write.
//
//   node scripts/sync-plugins.mjs           update versions, report the rest
//   node scripts/sync-plugins.mjs --check   change nothing; exit 1 on any drift
import { readFileSync, writeFileSync } from 'node:fs';

const INDEX = process.env.NOX_REGISTRY_INDEX ||
  'https://raw.githubusercontent.com/nox-hq/registry/main/index.json';
const FILE = new URL('../src/data/plugins.ts', import.meta.url);
const check = process.argv.includes('--check');

const cmp = (a, b) => {
  const pa = a.split(/[.-]/).map(Number), pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

const index = await (await fetch(INDEX)).json();
const registry = new Map(index.plugins.map((p) => [p.name, {
  version: (p.versions || []).map((v) => v.version).sort(cmp).at(-1),
  deprecated: !!p.deprecated,
}]));

let src = readFileSync(FILE, 'utf8');
const onPage = new Map();
const entry = /name: '(nox\/[^']+)',([\s\S]*?)\n\s{6}\}/g;
for (const m of src.matchAll(entry)) {
  onPage.set(m[1], {
    version: /version: '([^']+)'/.exec(m[2])?.[1],
    status: /status: '([^']+)'/.exec(m[2])?.[1] || 'current',
  });
}

const problems = [];
let updated = 0;
for (const [name, r] of registry) {
  const p = onPage.get(name);
  if (!p) { problems.push(`${name} is in the registry but not on the page`); continue; }
  if (r.deprecated && p.status === 'current') {
    problems.push(`${name} is deprecated in the registry but the page calls it current`);
  }
  if (r.version && p.version !== r.version) {
    if (check) { problems.push(`${name}: page says ${p.version ?? 'no version'}, registry has ${r.version}`); continue; }
    src = src.replace(new RegExp(`(name: '${name.replace('/', '\\/')}',\\s*\\n\\s*version: ')[^']+(')`), `$1${r.version}$2`);
    updated++;
  }
}
for (const name of onPage.keys()) {
  if (!registry.has(name)) problems.push(`${name} is on the page but not in the registry`);
}

if (!check && updated) {
  writeFileSync(FILE, src);
  console.log(`updated ${updated} version(s) from the registry`);
}
if (problems.length) {
  for (const p of problems) console.log(`::warning title=Plugin catalogue drift::${p}`);
  process.exit(1);
}
console.log('plugin catalogue matches the registry');
