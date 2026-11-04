/**
 * The NOX Intelligence terms, as published versions. The JSON files in
 * `src/data/terms/` are written by `npm run sync:terms` from nox's own Go
 * constants and never edited by hand: each one is the exact text a user saw
 * and accepted, and its sha256 is the value nox's tests pin.
 */

export type TermsKind = 'contribution' | 'outcomes' | 'attack';

export interface TermsVersion {
  kind: TermsKind;
  version: string;
  sha256: string;
  text: string;
}

export const kinds: Record<TermsKind, { title: string; accept: string; summary: string }> = {
  contribution: {
    title: 'Contribution terms',
    accept: 'nox intel consent accept',
    summary: 'Anonymous observations of vulnerable dependencies, sent by scans with scan.intelligence.contribute on.',
  },
  outcomes: {
    title: 'Outcome terms',
    accept: 'nox intel consent outcomes accept',
    summary: 'One report per scan of dependency findings and their verdicts, under a project pseudonym, with scan.intelligence.outcomes on.',
  },
  attack: {
    title: 'Attack-evidence terms',
    accept: 'nox intel consent attack accept',
    summary: 'Attributed nox attack run results, sent with --contribute and an organisation token.',
  },
};

const files = import.meta.glob<TermsVersion>('./terms/*.json', { eager: true, import: 'default' });

/**
 * Versions are `<kind>-YYYY-MM` (contribution has no prefix), so within one
 * kind they sort by date as strings.
 */
export const versions: TermsVersion[] = Object.values(files).sort((a, b) =>
  a.kind === b.kind ? b.version.localeCompare(a.version) : a.kind.localeCompare(b.kind),
);

/** Newest first, per kind. */
export function byKind(kind: TermsKind): TermsVersion[] {
  return versions.filter((v) => v.kind === kind);
}

/** The newer version of the same kind, when this one has been replaced. */
export function supersededBy(t: TermsVersion): TermsVersion | undefined {
  const same = byKind(t.kind);
  const i = same.findIndex((v) => v.version === t.version);
  return i > 0 ? same[0] : undefined;
}
