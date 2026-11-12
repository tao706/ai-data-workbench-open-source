<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { categoryPalette, themeColor } from '../palette';
import type { ChartConfig } from '../types';

 
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

const props = defineProps<{ config: ChartConfig; data: any }>();

 
const empty = computed(
  () => !(props.config.chartType === 'scatter' ? props.data?.points?.length : props.data?.categories?.length),
);

const el = ref<HTMLElement>();  
let chart: echarts.ECharts | undefined;  
let observer: ResizeObserver | undefined;  

function render() {
  if (!chart || !props.data) return;
  const c = { ...props.config, color: themeColor(props.config.color) };
  const categories = props.data.categories || [];
  const values = props.data.series || [];
   
  const axis = {
    axisLabel: { color: '#71829a' },
    axisLine: { lineStyle: { color: '#eadfe2' } },
    splitLine: { lineStyle: { color: '#fcf6f3' } },
  };
  let option: echarts.EChartsCoreOption;

   
  if (c.chartType === 'pie')
    option = {
      tooltip: { trigger: 'item' },
      legend: c.showLegend ? { bottom: 0 } : undefined,
      series: [
        {
          type: 'pie',
          radius: ['40%', '68%'],
          center: ['50%', '46%'],
          data: categories.map((name: string, i: number) => ({ name, value: values[i] })),
          label: { show: c.showLabels },
        },
      ],
    };
   
  else if (c.chartType === 'scatter')
    option = {
      tooltip: { trigger: 'item' },
      xAxis: { type: 'value', name: c.dimension, ...axis },
      yAxis: { type: 'value', name: c.metric, ...axis },
      series: [
        {
          type: 'scatter',
          symbolSize: 10,
          data: props.data.points || [],
          itemStyle: { color: c.color },
        },
      ],
    };
   
  else
    option = {
      color: [c.color],
      grid: { left: 46, right: 24, top: 28, bottom: 55 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: categories, ...axis },
      yAxis: { type: 'value', ...axis },
      series: [
        {
          name: c.metric || '数量',
          type: c.chartType === 'bar' ? 'bar' : 'line',
          areaStyle: c.chartType === 'area' ? { opacity: 0.18 } : undefined,
          smooth: c.chartType !== 'bar',
          barMaxWidth: 42,
          data: values,
          label: { show: c.showLabels, position: 'top' },
        },
      ],
    };

   
  const formatValue = (value: unknown) =>
    typeof value === 'number' ? value.toLocaleString('zh-CN', { maximumFractionDigits: 4 }) : String(value);

   
  const signedTick = (value: number) =>
    value === 0 ? '0' : `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('zh-CN', { maximumFractionDigits: 4 })}`;

  if (c.chartType !== 'pie') {
    option.grid = { left: 24, right: 35, top: 35, bottom: 70, containLabel: true };
    option.yAxis = {
      ...(option.yAxis as object),
      axisLabel: { color: '#71829a', formatter: signedTick, margin: 12 },
      inverse: false,
    };
  }

  if (c.chartType !== 'pie' && c.chartType !== 'scatter') {
     
    const numericCategories = categories.map((value: unknown) =>
      String(value).trim() === '' ? NaN : Number(value),
    );
    const allNumeric = numericCategories.every((value: number) => Number.isFinite(value));
    let digits = 2;
     
    if (allNumeric) {
      const distinct = new Set(numericCategories).size;
      while (
        digits < 6 &&
        new Set(numericCategories.map((value: number) => value.toFixed(digits))).size < distinct
      )
        digits++;
    }
    const dense = categories.length > 8;  
    const labelBudget = Math.max(2, Math.min(10, Math.floor((chart.getWidth() - 130) / 95)));  
    const stride = Math.max(1, Math.ceil(categories.length / labelBudget));  
    const sampledTick = (index: number) => index % stride === 0 || index === categories.length - 1;
    option.grid = { left: 24, right: 30, top: 35, bottom: 100, containLabel: true };
    option.xAxis = {
      ...(option.xAxis as object),
      name: c.dimension,
      nameLocation: 'middle',
      nameGap: dense ? 76 : 48,
      nameTextStyle: { color: '#456398', fontSize: 12, fontWeight: 600 },
      axisLine: { onZero: false, lineStyle: { color: '#8CB3D9', width: 1.3 } },
      axisTick: { alignWithLabel: true, interval: sampledTick, lineStyle: { color: '#8CB3D9' } },
      axisLabel: {
        color: '#455d80',
        fontSize: 12,
        fontWeight: 500,
        margin: 14,
        rotate: dense ? 30 : 0,
        hideOverlap: true,
        interval: sampledTick,
        showMinLabel: true,
        showMaxLabel: true,
        width: dense ? 95 : 130,
        overflow: 'truncate',
        formatter: (value: string) =>
          allNumeric
            ? Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits })
            : value,
      },
    };
  }

  if (c.chartType === 'scatter') {
    option.xAxis = {
      ...(option.xAxis as object),
      axisLabel: {
        color: '#455d80',
        fontSize: 12,
        fontWeight: 500,
        margin: 12,
        formatter: (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }),
      },
    };
  }

  option.tooltip = { ...(option.tooltip as object), valueFormatter: formatValue };

  if (c.chartType === 'pie') {
    const palette = categoryPalette(categories.length, c.color);
     
    const base = c.color.match(/[0-9a-f]{2}/gi)?.map((x) => parseInt(x, 16)) || [239, 142, 151];
    option.color =
      c.colorMode === 'single'
        ? Array.from({ length: 8 }, (_, i) =>
            `rgb(${base.map((v) => Math.round(v + ((255 - v) * i) / 10)).join(',')})`,
          )
        : palette;
    option.legend = c.showLegend
      ? {
          type: 'scroll',
          bottom: 0,
          formatter: (name: string) => (/^-?\d+(\.\d+)?$/.test(name) ? formatValue(Number(name)) : name),
        }
      : { show: false };
    const series = (option.series as any[])[0];
    series.radius = ['35%', '60%'];
    series.center = ['50%', '44%'];
    series.itemStyle = { borderColor: '#fff', borderWidth: 2, borderRadius: 2 };
    series.label = { show: c.showLabels, formatter: '{b}: {d}%' };
  } else {
    option.legend = { show: c.showLegend, type: 'scroll', bottom: 0 };
    const series = (option.series as any[])[0];
    series.name =
      c.chartType === 'scatter'
        ? `${c.dimension} / ${c.metric}`
        : c.aggregate === 'count'
          ? '行数'
          : c.metric;
    series.label = {
      show: c.showLabels,
      position: 'top',
      formatter: (p: any) =>
        Array.isArray(p.value) ? p.value.map(formatValue).join(', ') : formatValue(p.value),
    };
    series.smooth = false;
    const multi = c.colorMode !== 'single';  
    const categoryColors = categoryPalette(categories.length, c.color);
    option.color = [c.color];
    if (c.chartType === 'bar') {
      series.itemStyle = {
        color: multi ? (params: any) => categoryColors[params.dataIndex] : c.color,
        borderRadius: [3, 3, 3, 3],
      };
    } else if (c.chartType === 'line' || c.chartType === 'area') {
      series.lineStyle = { color: c.color, width: 2.5 };
      series.symbol = 'circle';
      series.symbolSize = 7;
      series.itemStyle = {
        color: multi ? '#e1829d' : c.color,
        borderColor: '#fff',
        borderWidth: 1.5,
      };
      if (c.chartType === 'area')
        series.areaStyle = {
          opacity: 1,
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: multi ? '#8cb3d988' : c.color + '66' },
            { offset: 1, color: multi ? '#fadadd33' : c.color + '10' },
          ]),
        };
    } else if (c.chartType === 'scatter') {
      series.symbolSize = 9;
      series.itemStyle = {
        color: c.color,
        opacity: 0.8,
        borderColor: multi ? '#f4a7b9' : '#fff',
        borderWidth: 1,
      };
      series.emphasis = {
        itemStyle: { color: '#b86885', opacity: 1, borderColor: '#fff', borderWidth: 2 },
      };
    }
  }

   
  chart.setOption(option, true);
}

 
watch(
  el,
  (element) => {
    observer?.disconnect();
    chart?.dispose();
    chart = undefined;
    if (element) {
      chart = echarts.init(element);
      observer = new ResizeObserver(() => {
        chart?.resize();
        render();
      });
      observer.observe(element);
      render();
    }
  },
  { flush: 'post' },
);

 
watch(() => [props.config, props.data], render, { deep: true, flush: 'post' });

onBeforeUnmount(() => {
  observer?.disconnect();
  chart?.dispose();
  chart = undefined;
});
</script>

<template>
  <div v-if="empty" class="empty">当前字段或筛选条件下没有可绘制的数据，请调整后重试。</div>
  <div v-else-if="config.chartType === 'table'" class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th>{{ config.dimension }}</th>
          <th>{{ config.metric || '数量' }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(category, i) in data?.categories || []" :key="i">
          <td>{{ category }}</td>
          <td>{{ data?.series?.[i] }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-else ref="el" class="chart-area"></div>
</template>
