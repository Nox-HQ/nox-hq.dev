<template>
  <figure class="chart-shell">
    <figcaption>Plugins Per Track</figcaption>
    <svg ref="svgRef" role="img" aria-label="NOX plugin counts by track" />
  </figure>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { select, scaleBand, scaleLinear, axisLeft, axisBottom, max } from 'd3';

type TrackPoint = {
  short: string;
  value: number;
  color: string;
};

const svgRef = ref<SVGSVGElement | null>(null);
const points: TrackPoint[] = [
  { short: 'Core', value: 4, color: '#00a7ff' },
  { short: 'Runtime', value: 4, color: '#3fcfff' },
  { short: 'AI', value: 4, color: '#5f8eff' },
  { short: 'Model', value: 3, color: '#7a55ff' },
  { short: 'Supply', value: 4, color: '#9150ff' },
  { short: 'Intel', value: 4, color: '#b946ff' },
  { short: 'Policy', value: 4, color: '#ff2c96' },
  { short: 'IR', value: 3, color: '#ff4f8c' },
  { short: 'DX', value: 4, color: '#ff5f7b' },
  { short: 'Agent', value: 3, color: '#ff755a' },
];

let resizeObserver: ResizeObserver | undefined;

function render() {
  const node = svgRef.value;
  if (!node) {
    return;
  }

  const parentWidth = node.parentElement?.clientWidth ?? 760;
  const width = Math.max(360, parentWidth);
  const height = 310;
  const margin = { top: 12, right: 12, bottom: 52, left: 30 };

  const svg = select(node);
  svg.selectAll('*').remove();
  svg.attr('viewBox', `0 0 ${width} ${height}`);

  const x = scaleBand()
    .domain(points.map((d) => d.short))
    .range([margin.left, width - margin.right])
    .padding(0.2);

  const y = scaleLinear()
    .domain([0, (max(points, (d) => d.value) ?? 4) + 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  svg
    .append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(axisBottom(x).tickSize(0))
    .call((g) => g.select('.domain').remove())
    .call((g) =>
      g
        .selectAll('text')
        .attr('fill', '#c5e4ff')
        .attr('font-size', '11')
        .attr('font-family', 'Sora, sans-serif')
    );

  svg
    .append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(axisLeft(y).ticks(5).tickSize(0))
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('line').remove())
    .call((g) =>
      g
        .selectAll('text')
        .attr('fill', '#8ac0ff')
        .attr('font-size', '11')
        .attr('font-family', 'Sora, sans-serif')
    );

  svg
    .append('g')
    .selectAll('rect')
    .data(points)
    .join('rect')
    .attr('x', (d) => x(d.short) ?? 0)
    .attr('y', (d) => y(d.value))
    .attr('width', x.bandwidth())
    .attr('height', (d) => y(0) - y(d.value))
    .attr('rx', 8)
    .attr('fill', (d) => d.color);

  svg
    .append('g')
    .selectAll('text.value')
    .data(points)
    .join('text')
    .attr('class', 'value')
    .attr('x', (d) => (x(d.short) ?? 0) + x.bandwidth() / 2)
    .attr('y', (d) => y(d.value) - 8)
    .attr('text-anchor', 'middle')
    .attr('fill', '#f8fbff')
    .attr('font-size', '11')
    .attr('font-family', 'Space Grotesk, sans-serif')
    .attr('font-weight', '700')
    .text((d) => d.value);
}

onMounted(() => {
  render();
  resizeObserver = new ResizeObserver(render);
  if (svgRef.value?.parentElement) {
    resizeObserver.observe(svgRef.value.parentElement);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>

<style scoped>
.chart-shell {
  margin: 0;
  border-radius: 20px;
  border: 1px solid rgba(95, 207, 255, 0.22);
  background: linear-gradient(180deg, rgba(8, 24, 77, 0.85) 0%, rgba(8, 14, 55, 0.92) 100%);
  padding: 1rem;
}

.chart-shell figcaption {
  margin-bottom: 0.4rem;
  color: #f8fbff;
  font-size: 0.84rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

svg {
  display: block;
  width: 100%;
  height: auto;
}
</style>
