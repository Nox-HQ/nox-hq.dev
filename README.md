# NOX Website

Marketing and landing site for [NOX](https://github.com/Nox-HQ/nox), built with Astro + Vue and D3 visualizations.

## Stack

- Astro 5
- Vue 3 (`@astrojs/vue`)
- D3 (chart rendering in Vue components)
- Sora + Space Grotesk typography

## Routes

- `/` - Landing page
- `/features` - Feature matrix and core command surface
- `/plugins` - Plugin catalog (8 tracks), mirroring the official registry
- `/changelog` - Release notes, generated from nox's own `CHANGELOG.md`
- `/get-started` - Install and quick-start flow
- `/enterprise`, `/security`, `/compare/*`, `/blog`

## Keeping content true

Most of this site states numbers about the scanner — rule counts, plugin
versions, MCP tool counts, CLI flags. None are derived at build time, so they
go stale silently: the site sat on nox 1.6 facts until 1.13.6 shipped. When a
release lands:

1. `npm run sync:changelog` — regenerates `src/content/changelog/` from
   `../nox/CHANGELOG.md` (or `NOX_CHANGELOG=remote` to fetch from GitHub).
   Commit the result.
2. Re-check the hard numbers against the tool, not against memory:
   - rules — the `rules` MCP tool against a `nox serve` process
   - plugins — `curl https://raw.githubusercontent.com/nox-hq/registry/main/index.json`
   - CLI surface — `nox --help`, `nox scan --help`, `nox fix --help`
   - Action inputs — `action.yml` in the nox repo
3. Update `src/data/plugins.ts` and any page copy quoting a count.

Install commands must stay tap-qualified (`brew install felixgeelhaar/tap/nox`);
a bare `brew install nox` resolves to an unrelated homebrew-core package.

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

## Project Structure

```text
src/
  components/
    ThreatCoverageChart.vue
    PluginTrackChart.vue
  data/
    plugins.ts
    site.ts
  layouts/
    BaseLayout.astro
  pages/
    index.astro
    features.astro
    plugins.astro
    get-started.astro
  styles/
    global.css
public/
  nox-logo.png
```
