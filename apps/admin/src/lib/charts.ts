import type { EChartsCoreOption } from 'echarts/core'
import type { SeriesRow, Feature } from './api'
/** 复用趋势图外观并保留 null 断点，避免将缺失历史画成零使用量。 */
export function trendChart(
  rows: SeriesRow[],
  metrics: { key: string; name: string; type?: string }[],
): EChartsCoreOption {
  return {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 48, right: 24, top: 25, bottom: 65 },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.date.slice(5)),
      axisLine: { lineStyle: { color: '#dce3ee' } },
      axisLabel: { color: '#687b96' },
    },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#eff2f7' } } },
    series: metrics.map((m) => ({
      name: m.name,
      type: m.type || 'line',
      data: rows.map((r) => r[m.key]),
      showSymbol: false,
      connectNulls: false,
      barMaxWidth: 22,
      lineStyle: { width: 3 },
    })),
  }
}
/** 沿用接口返回的排序，切换教师覆盖人数或操作次数时同时切换数值口径。 */
export function rankingChart(items: Feature[], sort: string): EChartsCoreOption {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 85, right: 35, top: 10, bottom: 28 },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: {
      type: 'category',
      inverse: true,
      data: items.map((x) => x.name),
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: sort === 'uses' ? '使用次数' : '使用教师数',
        type: 'bar',
        data: items.map((x) => (sort === 'uses' ? x.uses : x.teachers)),
        barMaxWidth: 18,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  }
}
