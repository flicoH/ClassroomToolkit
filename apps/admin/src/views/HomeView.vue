<script setup lang="ts">
/** 首页读取后端聚合结果，不在浏览器拉取全量师生记录进行计数。 */
import { computed, onMounted, ref } from 'vue'
import { api, daysAgo, formatTime, today, type Meta, type Trend } from '../lib/api'
import { trendChart } from '../lib/charts'
import BaseChart from '../components/BaseChart.vue'
const trend = ref<Trend>()
const trendError = ref('')
const trendLoading = ref(false)
const chart = computed(() =>
  trendChart(trend.value?.series ?? [], [
    { key: 'teachers', name: '登录教师' },
    { key: 'activeTeachers', name: '活跃教师' },
  ]),
)
const data = ref<(Meta & Record<string, number | string | null>) | null>(null),
  error = ref(''),
  loading = ref(false)
const cards = [
  { key: 'teachers', tone: 'indigo', label: '教师总数', suffix: '位' },
  { key: 'students', tone: 'teal', label: '学生档案', suffix: '份' },
  { key: 'classrooms', tone: 'blue', label: '班级总数', suffix: '个' },
  { key: 'registrationsToday', tone: 'daily', label: '今日注册教师', suffix: '位' },
  { key: 'loginTeachersToday', tone: 'daily', label: '今日登录教师', suffix: '位' },
  { key: 'activeTeachersToday', tone: 'daily', label: '今日活跃教师', suffix: '位' },
]
async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api('dashboard/overview')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
// 首页趋势复用登录分析口径，独立请求让概览指标在趋势出错时仍可使用。
async function loadTrend() {
  trendError.value = ''
  trendLoading.value = true
  try {
    trend.value = await api<Trend>('analytics/logins', { start: daysAgo(13), end: today() })
  } catch (e) {
    trend.value = undefined
    trendError.value = (e as Error).message
  } finally {
    trendLoading.value = false
  }
}
function refresh() {
  void load()
  void loadTrend()
}
onMounted(refresh)
</script>
<template>
  <div class="page-heading">
    <div>
      <h1>数据概览</h1>
      <p class="muted">
        掌握平台规模与今日使用情况。
      </p>
    </div>
    <button
      class="primary"
      :disabled="loading || trendLoading"
      @click="refresh"
    >
      {{ loading || trendLoading ? '更新中…' : '刷新数据' }}
    </button>
  </div>
  <p
    v-if="error"
    class="error"
    role="alert"
  >
    {{ error }}
  </p>
  <div class="metric-grid overview-metrics">
    <article
      v-for="card in cards"
      :key="card.key"
      class="metric"
      :class="card.tone"
    >
      <span>{{ card.label }}</span><strong>{{ data ? Number(data[card.key]).toLocaleString() : '—'
      }}<small>{{ card.suffix }}</small></strong>
    </article>
  </div>
  <div class="two-columns dashboard-content">
    <section class="panel">
      <header class="section-heading">
        <h2>近 14 天登录与活跃</h2>
        <span class="muted footnote">北京时间</span>
      </header>
      <p
        v-if="trendError"
        class="error"
        role="alert"
      >
        {{ trendError }} <button
          :disabled="loading"
          @click="loadTrend"
        >
          重试趋势
        </button>
      </p>
      <p
        v-else-if="trendLoading"
        class="empty"
        role="status"
      >
        正在加载趋势…
      </p>
      <p
        v-else-if="trend?.hasCoverage === false || !trend?.series.length"
        class="empty"
      >
        该时段暂无采集数据。
      </p>
      <BaseChart
        v-else
        :option="chart"
        label="近 14 天登录教师与活跃教师趋势"
      />
    </section>
    <section class="panel">
      <h2>分析入口</h2>
      <div class="analysis-links">
        <RouterLink
          class="action-row"
          to="/registrations"
        >
          <span><strong>教师注册趋势</strong><small>查看新增与累计注册、注册明细</small></span><span>↗</span>
        </RouterLink><RouterLink
          class="action-row"
          to="/logins"
        >
          <span><strong>教师登录分析</strong><small>登录人数、次数与最近登录记录</small></span><span>↗</span>
        </RouterLink><RouterLink
          class="action-row"
          to="/features"
        >
          <span><strong>热门功能排行</strong><small>了解教师常用功能及使用变化</small></span><span>↗</span>
        </RouterLink>
      </div>
    </section>
    <section class="panel notes">
      <h2>统计说明</h2>
      <p>学生数量为教师录入的档案数，同一学生可能出现在多位教师的班级中。</p>
      <p>今日登录教师按主动登录账号去重；活跃教师按有效功能使用去重。</p>
      <p>统计时区：北京时间</p>
      <p v-if="data">
        登录与功能数据采集自 {{ formatTime(data.startedAt) }}。开始采集当天可能不完整。
      </p>
    </section>
  </div>
  <p
    v-if="data"
    class="muted footnote"
  >
    更新于 {{ formatTime(data.updatedAt) }}
  </p>
</template>
