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
- `/plugins` - Complete plugin catalog (10 tracks, 37 plugins)
- `/get-started` - Install and quick-start flow

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
