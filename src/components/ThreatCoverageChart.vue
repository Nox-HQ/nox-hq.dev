<template>
  <figure class="chart-shell">
    <figcaption>Built-in Rule Distribution</figcaption>
    <svg ref="svgRef" role="img" aria-label="Nox rule categories" />
  </figure>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { select, scaleBand, scaleLinear, axisLeft, axisBottom, max } from 'd3';

const svgRef = ref(null);
const chartData = [
  { label: 'Secrets', value: 86, color: '#00a7ff' },
  { label: 'AI', value: 18, color: '#5fcfff' },
  { label: 'IaC', value: 50, color: '#7a55ff' },
  { label: 'Deps', value: 1, color: '#ff5ca8' },
];

let resizeObserver;

function renderChart() {
  const svgEl = svgRef.value;
  if (!svgEl) {
    return;
  }

  const containerWidth = svgEl.parentElement?.clientWidth ?? 640;
  const width = Math.max(320, containerWidth);
  const height = 290;
  const margin = { top: 16, right: 16, bottom: 44, left: 42 };

  const svg = select(svgEl);
  svg.selectAll('*').remove();
  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('preserveAspectRatio', 'xMidYMid meet');

  const x = scaleBand()
    .domain(chartData.map((d) => d.label))
    .range([margin.left, width - margin.right])
    .padding(0.24);

  const y = scaleLinear()
    .domain([0, (max(chartData, (d) => d.value) ?? 90) + 10])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const gridValues = y.ticks(4);

  svg
    .append('g')
    .attr('stroke', 'rgba(197, 228, 255, 0.16)')
    .selectAll('line')
    .data(gridValues)
    .join('line')
    .attr('x1', margin.left)
    .attr('x2', width - margin.right)
    .attr('y1', (d) => y(d))
    .attr('y2', (d) => y(d));

  svg
    .append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(axisBottom(x).tickSize(0))
    .call((g) => g.select('.domain').remove())
    .call((g) =>
      g
        .selectAll('text')
        .attr('fill', '#c5e4ff')
        .attr('font-size', '12')
        .attr('font-family', 'Sora, sans-serif')
    );

  svg
    .append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(axisLeft(y).ticks(4).tickSize(0))
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
    .data(chartData)
    .join('rect')
    .attr('x', (d) => x(d.label) ?? 0)
    .attr('y', (d) => y(d.value))
    .attr('width', x.bandwidth())
    .attr('height', (d) => y(0) - y(d.value))
    .attr('rx', 10)
    .attr('fill', (d) => d.color);

  svg
    .append('g')
    .selectAll('text')
    .data(chartData)
    .join('text')
    .attr('x', (d) => (x(d.label) ?? 0) + x.bandwidth() / 2)
    .attr('y', (d) => y(d.value) - 8)
    .attr('text-anchor', 'middle')
    .attr('fill', '#f8fbff')
    .attr('font-size', '11')
    .attr('font-family', 'Space Grotesk, sans-serif')
    .attr('font-weight', '700')
    .text((d) => d.value);
}

onMounted(() => {
  renderChart();
  resizeObserver = new ResizeObserver(() => renderChart());
  if (svgRef.value?.parentElement) {
    resizeObserver.observe(svgRef.value.parentElement);
  }
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
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
