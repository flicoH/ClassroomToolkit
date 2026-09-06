<script setup lang="ts">
/** 功能排行与所选功能趋势共用日期范围，切换排序只改变排行指标。 */
import { computed, ref, onMounted } from 'vue'
import { api, daysAgo, today, formatTime, type Ranking, type Trend } from '../lib/api'
import { trendChart, rankingChart } from '../lib/charts'
import DateRange from '../components/DateRange.vue'
import BaseChart from '../components/BaseChart.vue'
const range = ref({ start: daysAgo(29), end: today() }),
  sort = ref('teachers'),
  selected = ref('random-picker'),
  data = ref<Ranking>(),
  trend = ref<Trend>(),
  error = ref(''),
  loading = ref(false)
/** 递增请求序号，只接纳最新筛选请求的结果，避免较慢旧响应覆盖新页面数据。 */
let requestId = 0
const ranking = computed(() => rankingChart(data.value?.items || [], sort.value))
const chart = computed(() =>
  trendChart(trend.value?.series || [], [
    { key: 'teachers', name: '使用教师数' },
    { key: 'uses', name: '使用次数' },
  ]),
)
async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const [a, b] = await Promise.all([
      api<Ranking>('analytics/features/ranking', { ...range.value, sort: sort.value }),
      api<Trend>(`analytics/features/${selected.value}/trend`, range.value),
    ])
    if (id === requestId) {
      data.value = a
      trend.value = b
    }
  } catch (e) {
    if (id === requestId) {
      error.value = (e as Error).message
      data.value = undefined
      trend.value = undefined
    }
  } finally {
    if (id === requestId) loading.value = false
  }
}
function changeRange(value: { start: string; end: string }) {
  range.value = value
  void load()
}
onMounted(load)
function selectFeature(key: string) {
  selected.value = key
  void load()
}
</script>
<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">FEATURE INSIGHTS</p>
      <h1>热门功能分析</h1>
      <p class="muted">从使用覆盖与使用频率，了解教师的课堂习惯。</p>
    </div>
  </div>
  <DateRange @change="changeRange" />
  <p v-if="data?.hasCoverage === false" class="empty">所选日期早于数据采集时间，暂无统计数据。</p>
  <p v-if="error" class="error" role="alert">{{ error }} <button @click="load">重试</button></p>
  <p v-if="loading" class="muted" role="status">正在更新数据…</p>
  <div v-if="data && data.hasCoverage !== false" class="two-columns">
    <section class="panel">
      <div class="toolbar">
        <h2 style="margin: 0">功能排行</h2>
        <label
          >排序<select v-model="sort" @change="load">
            <option value="teachers">使用教师数</option>
            <option value="uses">使用次数</option>
          </select></label
        >
      </div>
      <BaseChart :option="ranking" label="课堂功能使用排行" />
    </section>
    <section class="panel">
      <div class="toolbar">
        <h2 style="margin: 0">使用趋势</h2>
        <label
          >功能<select v-model="selected" @change="load">
            <option v-for="feature in data.items" :key="feature.key" :value="feature.key">
              {{ feature.name }}
            </option>
          </select></label
        >
      </div>
      <BaseChart :option="chart" label="所选功能的每日使用教师数和次数趋势" />
    </section>
  </div>
  <section v-if="data && data.hasCoverage !== false" class="panel">
    <h2>功能使用明细</h2>
    <p class="muted footnote">
      同期活跃教师 {{ data.activeTeachers }} 位。使用率 = 功能使用教师数 ÷
      同期活跃教师数；变化对比上一等长周期的使用教师数。
    </p>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>功能</th>
            <th>打开教师数</th>
            <th>使用教师数</th>
            <th>使用次数</th>
            <th>使用率</th>
            <th>较上期</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="feature in data.items" :key="feature.key">
            <td>
              <button class="text-button link" @click="selectFeature(feature.key)">
                {{ feature.name }}
              </button>
            </td>
            <td>{{ feature.openTeachers }}</td>
            <td>{{ feature.teachers }}</td>
            <td>{{ feature.uses }}</td>
            <td>{{ (feature.usageRate * 100).toFixed(1) }}%</td>
            <td>{{ feature.change }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!data.activeTeachers" class="empty">当前范围尚无有效功能使用记录</p>
  </section>
  <p v-if="data" class="muted footnote">
    数据采集自 {{ formatTime(data.startedAt) }}。采集前的趋势为空白，首日可能不完整。更新于
    {{ formatTime(data.updatedAt) }}。
  </p>
</template>
