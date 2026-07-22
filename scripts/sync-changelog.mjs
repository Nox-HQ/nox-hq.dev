/**
 * Sync nox's CHANGELOG.md into the site's `changelog` content collection.
 *
 * The site is a separate repository from the scanner, so release notes have to
 * be copied rather than imported. Copying by hand is what let the rest of this
 * site drift seven minor versions behind, so this does it mechanically:
 * CHANGELOG.md is split on its `## [version] - date` headings and each release
 * is written as one content file.
 *
 * The generated files are committed. The build never runs this — a page that
 * silently renders stale notes when a fetch fails is the failure mode we are
 * trying to remove, and deterministic offline builds are the same property nox
 * itself promises. Run it when a release ships:
 *
 *   npm run sync:changelog                       # sibling ../nox checkout
 *   NOX_CHANGELOG=/path/to/CHANGELOG.md npm run sync:changelog
 *   NOX_CHANGELOG=remote npm run sync:changelog  # fetch from GitHub main
 *
 * Only 1.x and later are published. The 0.x line predates the stable finding
 * schema and the signed marketplace, so its notes describe a tool that no
 * longer exists; the page links to GitHub Releases for that history.
 */

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../src/content/changelog');

const REMOTE =
  'https://raw.githubusercontent.com/nox-hq/nox/main/CHANGELOG.md';

/** Release heading: `## [1.13.6] - 2026-07-21`. */
const HEADING = /^## \[(\d+\.\d+\.\d+)\]\s*-\s*(\d{4}-\d{2}-\d{2})\s*$/;

/** Section heading inside a release: `### Fixed`. */
const SECTION = /^### +(.+?)\s*$/;

async function loadChangelog() {
  const source = process.env.NOX_CHANGELOG ?? resolve(here, '../../nox/CHANGELOG.md');

  if (source === 'remote') {
    const res = await fetch(REMOTE);
    if (!res.ok) throw new Error(`GET ${REMOTE} → ${res.status}`);
    return { text: await res.text(), from: REMOTE };
  }

  return { text: await readFile(source, 'utf8'), from: source };
}

/**
 * Split the changelog into releases. Everything above the first release
 * heading (the Keep a Changelog preamble and `## [Unreleased]`) is dropped.
 */
function parseReleases(text) {
  const lines = text.split('\n');
  const releases = [];
  let current = null;

  for (const line of lines) {
    const heading = line.match(HEADING);
    if (heading) {
      current = { version: heading[1], date: heading[2], body: [] };
      releases.push(current);
      continue;
    }
    // A non-release `## ` heading (`## [Unreleased]`) ends the current release.
    if (line.startsWith('## ')) {
      current = null;
      continue;
    }
    if (current) current.body.push(line);
  }

  return releases.map((r) => ({ ...r, body: r.body.join('\n').trim() }));
}

/**
 * The section headings a release carries (`Added`, `Fixed`, `Security`, …),
 * rendered as badges on the page. Order of first appearance is preserved so a
 * release that leads with Security reads that way on the page too.
 */
function sectionsOf(body) {
  const seen = [];
  let inFence = false;

  for (const line of body.split('\n')) {
    if (line.trimStart().startsWith('```')) inFence = !inFence;
    if (inFence) continue;
    const m = line.match(SECTION);
    if (m && !seen.includes(m[1])) seen.push(m[1]);
  }

  return seen;
}

/**
 * The prose a release opens with, before its first `###` section — nox writes
 * one for the releases that need framing. Used as the card summary; releases
 * without one fall back to their section badges alone.
 */
function summaryOf(body) {
  const upToFirstSection = body.split('\n').reduce((acc, line) => {
    if (acc.done || SECTION.test(line)) return { ...acc, done: true };
    return { ...acc, lines: [...acc.lines, line] };
  }, { lines: [], done: false }).lines;

  return upToFirstSection
    .join('\n')
    .replace(/^>.*$/gm, '')       // block quotes are warnings, not summaries
    .replace(/\s+/g, ' ')
    .trim();
}

const compareVersions = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i];
  }
  return 0;
};

const yaml = (value) => JSON.stringify(value);

async function main() {
  const { text, from } = await loadChangelog();
  const releases = parseReleases(text)
    .filter((r) => Number(r.version.split('.')[0]) >= 1)
    .sort((a, b) => compareVersions(a.version, b.version));

  if (releases.length === 0) {
    throw new Error(`no 1.x releases parsed from ${from} — heading format changed?`);
  }

  await mkdir(outDir, { recursive: true });

  // Drop previously-generated files so a retracted release cannot linger.
  for (const name of await readdir(outDir).catch(() => [])) {
    if (name.endsWith('.md')) await rm(join(outDir, name));
  }

  for (const release of releases) {
    const [major, minor] = release.version.split('.');
    const frontmatter = [
      '---',
      `version: ${yaml(release.version)}`,
      `date: ${release.date}`,
      `series: ${yaml(`${major}.${minor}`)}`,
      `sections: ${JSON.stringify(sectionsOf(release.body))}`,
      `summary: ${yaml(summaryOf(release.body))}`,
      '---',
      '',
    ].join('\n');

    await writeFile(join(outDir, `${release.version}.md`), frontmatter + release.body + '\n');
  }

  const newest = releases[0];
  console.log(
    `changelog: wrote ${releases.length} releases (${newest.version} … ${releases[releases.length - 1].version}) from ${from}`,
  );
}

await main();
