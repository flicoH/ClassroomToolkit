<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref } from 'vue'
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, AriaComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
/** 按需注册图表类型与组件，避免引入不使用的 ECharts 功能。 */
use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  CanvasRenderer,
])
const props = defineProps<{ option: EChartsCoreOption; label: string }>()
const host = ref<HTMLDivElement>()
let chart: ECharts | undefined, observer: ResizeObserver | undefined
function render() {
  chart?.setOption(
    {
      color: ['#3168e5', '#17a894', '#f0a643', '#9a74dc'],
      textStyle: { fontFamily: 'inherit' },
      aria: { enabled: true },
      animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ...props.option,
    },
    true,
  )
}
/** 图表依赖真实容器尺寸；观察容器变化以适应侧栏、窗口和响应式布局。 */
onMounted(() => {
  if (!host.value) return
  chart = init(host.value)
  render()
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(host.value)
})
watch(() => props.option, render, { deep: true })
/** 离开页面时释放观察器与图表实例，防止多次导航累积监听和画布资源。 */
onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
})
</script>
<template><div ref="host" class="chart" role="img" :aria-label="label"></div></template>
