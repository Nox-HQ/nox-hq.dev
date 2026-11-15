/**
 * nox's CHANGELOG writes an em dash as ` -- `. Astro 7's Markdown engine
 * (satteri) follows CommonMark smart punctuation, where `--` is an en dash and
 * only `---` is an em dash, and it has no option to change that; Astro 5's
 * smartypants turned `--` into an em dash. Writing the dash itself keeps the
 * release notes reading as they always have.
 *
 * Only prose is touched: fenced code blocks and inline code keep their `--`,
 * since `nox scan -- .` is a command, not punctuation.
 */
export function emDashes(markdown) {
  let fenced = false;
  // Inline code can open on one line and close on the next, so whether a
  // segment is code is carried across the lines of a paragraph.
  let inCode = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        inCode = false;
        return line;
      }
      if (fenced) return line;
      if (line.trim() === '') {
        inCode = false;
        return line;
      }
      return line
        .split('`')
        .map((part, i) => {
          if (i > 0) inCode = !inCode;
          return inCode ? part : part.replace(/(^|\s)--(?=\s|$)/g, '$1—');
        })
        .join('`');
    })
    .join('\n');
}
