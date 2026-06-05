// Generate per-post themed OG images (1200x630 PNG) for the blog.
//
// Each image is a branded, deterministic generative composition: a dark
// gradient, a security-graph motif (nodes + edges) seeded by the post slug, an
// accent colour chosen from the post's first tag, the wrapped title, and the
// NOX wordmark. No external services — fits the offline/deterministic ethos.
//
// Run: npm run og   (also wired into prebuild)

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const blogDir = join(root, 'src/content/blog');
const outDir = join(root, 'public/og');
mkdirSync(outDir, { recursive: true });

const fontFiles = [join(here, 'og/SpaceGrotesk-Bold.otf'), join(here, 'og/SpaceGrotesk-Medium.otf')];

const W = 1200;
const H = 630;
const BG0 = '#090f23';
const TAG_ACCENT = {
  mcp: '#39c8f4', // cyan
  'ai-security': '#7a6bff', // violet
  'false-positives': '#f05aa7', // magenta
  precision: '#3c82ff', // blue
  'owasp-mcp-top-10': '#39c8f4',
};
const DEFAULT_ACCENT = '#39c8f4';

// --- tiny seeded PRNG (mulberry32) ---
function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Minimal frontmatter reader: title, tags, draft.
function parseFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = m[1];
  const title = (fm.match(/^title:\s*"?(.*?)"?\s*$/m) || [])[1] || '';
  const draft = /^draft:\s*true\s*$/m.test(fm);
  const tagsLine = (fm.match(/^tags:\s*\[(.*?)\]/m) || [])[1] || '';
  const tags = tagsLine
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  return { title: title.replace(/\\"/g, '"'), tags, draft };
}

// Greedy word-wrap to a max chars-per-line; cap lines with an ellipsis.
function wrapTitle(title, perLine = 24, maxLines = 4) {
  const words = title.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > perLine) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1}$/, '…');
  }
  return lines;
}

function buildSVG({ title, tags }) {
  const accent = TAG_ACCENT[tags[0]] || DEFAULT_ACCENT;
  const rnd = mulberry32(hashStr(title));

  // Security-graph motif: nodes on the right two-thirds, edges to near nodes.
  const nodes = Array.from({ length: 16 }, () => ({
    x: 360 + rnd() * (W - 420),
    y: 60 + rnd() * (H - 120),
    r: 3 + rnd() * 6,
  }));
  let edges = '';
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      if (Math.hypot(dx, dy) < 220) {
        edges += `<line x1="${nodes[i].x.toFixed(1)}" y1="${nodes[i].y.toFixed(1)}" x2="${nodes[j].x.toFixed(1)}" y2="${nodes[j].y.toFixed(1)}" stroke="${accent}" stroke-width="1" stroke-opacity="0.18"/>`;
      }
    }
  }
  const dots = nodes
    .map(
      (n) =>
        `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}" fill="${accent}" fill-opacity="0.55"/>`
    )
    .join('');

  const lines = wrapTitle(title);
  const titleSvg = lines
    .map(
      (ln, i) =>
        `<text x="80" y="${250 + i * 70}" font-family="Space Grotesk" font-weight="700" font-size="58" fill="#eaf1ff">${esc(ln)}</text>`
    )
    .join('');

  // Chip row: accent-coloured pills with tag text.
  let chipX = 80;
  let chipsSvg = '';
  for (const t of tags.slice(0, 5)) {
    const w = 28 + t.length * 13;
    chipsSvg += `<rect x="${chipX}" y="540" rx="16" ry="16" width="${w}" height="34" fill="${accent}" fill-opacity="0.14" stroke="${accent}" stroke-opacity="0.5"/><text x="${chipX + 16}" y="563" font-family="Space Grotesk" font-weight="500" font-size="20" fill="${accent}">${esc(t)}</text>`;
    chipX += w + 14;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG0}"/>
      <stop offset="1" stop-color="#050a18"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.78" cy="0.3" r="0.6">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${edges}${dots}
  <rect x="0" y="0" width="10" height="${H}" fill="${accent}"/>
  ${titleSvg}
  ${chipsSvg}
  <text x="80" y="110" font-family="Space Grotesk" font-weight="700" font-size="34" fill="#ffffff" letter-spacing="3">NOX</text>
  <text x="80" y="138" font-family="Space Grotesk" font-weight="500" font-size="20" fill="${accent}">nox-hq.dev · security scanner</text>
</svg>`;
}

const files = readdirSync(blogDir).filter((f) => f.endsWith('.md'));
let made = 0;
for (const f of files) {
  const src = readFileSync(join(blogDir, f), 'utf8');
  const fm = parseFrontmatter(src);
  if (!fm || fm.draft) continue;
  const slug = f.replace(/\.md$/, '');
  const svg = buildSVG(fm);
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Space Grotesk' },
  })
    .render()
    .asPng();
  writeFileSync(join(outDir, `${slug}.png`), png);
  made++;
  console.log(`og: ${slug}.png`);
}
console.log(`Generated ${made} OG image(s).`);
