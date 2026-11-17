/**
 * Sync the NOX Intelligence terms from nox into `src/data/terms/`.
 *
 * nox writes each set of terms once, as a Go constant (`core/intel/terms.go`,
 * `attackconsent.go`, `outcome.go`), and `nox intel consent … accept` records
 * the version a user agreed to. Every text names its page here,
 * `/terms/<version>`, so the words a user accepted can be read again without
 * the binary that showed them. Copying them by hand is how a page drifts from
 * what people agreed to, so this copies them mechanically.
 *
 * A published version never changes. If a version already has a file and the
 * text nox now carries under that version differs, this fails rather than
 * overwrite it: that would be nox changing words people already accepted. Old
 * versions are never removed, so an earlier version keeps its address.
 *
 *   npm run sync:terms                        # sibling ../nox checkout, working tree
 *   NOX_REF=v1.57.0 npm run sync:terms        # the terms as of a nox tag or commit
 *   NOX_DIR=/path/to/nox npm run sync:terms
 *
 * The generated files are committed; the build never runs this.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../src/data/terms');
const noxDir = process.env.NOX_DIR ?? resolve(here, '../../nox');
const ref = process.env.NOX_REF ?? '';

/** Each set of terms: where nox writes it, and its two constant names. */
const SETS = [
  { kind: 'contribution', file: 'core/intel/terms.go', version: 'TermsVersion', text: 'Terms' },
  { kind: 'attack', file: 'core/intel/attackconsent.go', version: 'AttackTermsVersion', text: 'AttackTerms' },
  { kind: 'outcomes', file: 'core/intel/outcome.go', version: 'OutcomeTermsVersion', text: 'OutcomeTerms' },
];

/** A file at NOX_REF, or in the working tree; null when it does not exist there. */
async function source(file) {
  if (!ref) {
    try {
      return await readFile(join(noxDir, file), 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }
  try {
    return execFileSync('git', ['-C', noxDir, 'show', `${ref}:${file}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (/does not exist|exists on disk, but not in/.test(String(err.stderr))) return null;
    throw err;
  }
}

/** `const Name = "value"`, the version string. */
function stringConst(go, name) {
  const m = go.match(new RegExp(`^const ${name} = "([^"]+)"$`, 'm'));
  return m ? m[1] : null;
}

/**
 * `const Name = \`...\``, a Go raw string. Raw strings have no escapes; Go drops
 * carriage returns from them, so this does too, and the hash is then the one
 * nox's own test pins.
 */
function rawConst(go, name) {
  const m = go.match(new RegExp(`^const ${name} = \`([^\`]*)\``, 'm'));
  return m ? m[1].replace(/\r/g, '') : null;
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function existing(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const from = ref ? `${noxDir} at ${ref}` : noxDir;
  let written = 0;

  for (const set of SETS) {
    const go = await source(set.file);
    if (go === null) {
      console.log(`${set.kind}: ${set.file} does not exist in ${from}; skipped`);
      continue;
    }
    const version = stringConst(go, set.version);
    const text = rawConst(go, set.text);
    if (!version || text === null) {
      throw new Error(`${set.file}: could not read ${set.version} and ${set.text}`);
    }
    if (!text.includes(`version ${version}\n`)) {
      throw new Error(`${set.file}: the ${set.text} text does not name its own version ${version}`);
    }

    const entry = { kind: set.kind, version, sha256: sha256(text), text };
    const path = join(outDir, `${version}.json`);
    const prior = await existing(path);
    if (prior) {
      if (prior.sha256 !== entry.sha256 || prior.kind !== entry.kind) {
        throw new Error(
          `${version} is already published with sha256 ${prior.sha256}, but ${from} carries ` +
            `sha256 ${entry.sha256} under the same version. A published version never changes: ` +
            `nox must bump ${set.version}.`,
        );
      }
      console.log(`${set.kind}: ${version} unchanged`);
      continue;
    }
    await writeFile(path, JSON.stringify(entry, null, 2) + '\n');
    console.log(`${set.kind}: ${version} written (sha256 ${entry.sha256})`);
    written++;
  }
  console.log(`${written} new version(s) from ${from}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
