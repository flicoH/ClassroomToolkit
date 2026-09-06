<script setup lang="ts">
/** 注册和登录共用页面骨架，由路由选择统计接口及指标，不将两种口径混合。 */
import { computed, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api, daysAgo, today, formatTime, type Trend, type Page, type Person } from '../lib/api'
import { trendChart } from '../lib/charts'
import BaseChart from '../components/BaseChart.vue'
import DateRange from '../components/DateRange.vue'
import PaginationBar from '../components/PaginationBar.vue'
const route = useRoute(),
  registration = route.path === '/registrations'
const range = ref({ start: daysAgo(29), end: today() }),
  data = ref<Trend>(),
  records = ref<Page<Person>>(),
  page = ref(1),
  kind = ref(''),
  error = ref(''),
  loading = ref(false)
/** 递增请求序号，只接纳最新筛选请求的结果，避免较慢旧响应覆盖新页面数据。 */
let requestId = 0
const chart = computed(() =>
  trendChart(
    data.value?.series || [],
    registration
      ? [{ key: 'count', name: '新增教师', type: 'bar' }]
      : [
          { key: 'logins', name: '登录次数' },
          { key: 'teachers', name: '登录教师数' },
          { key: 'activeTeachers', name: '活跃教师数' },
        ],
  ),
)
const cumulative = computed(() =>
  trendChart(data.value?.series || [], [{ key: 'cumulative', name: '累计注册教师' }]),
)
const labels: Record<string, string> = {
  login: '登录成功',
  login_failed: '登录失败',
  auto_login: '注册后自动登录',
}
async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const [trend, list] = await Promise.all([
      api<Trend>(`analytics/${registration ? 'registrations' : 'logins'}`, range.value),
      api<Page<Person>>(registration ? 'teachers' : 'analytics/login-records', {
        ...range.value,
        page: page.value,
        kind: kind.value,
      }),
    ])
    if (id === requestId) {
      data.value = trend
      records.value = list
    }
  } catch (e) {
    if (id === requestId) {
      error.value = (e as Error).message
      data.value = undefined
      records.value = undefined
    }
  } finally {
    if (id === requestId) loading.value = false
  }
}
function changeRange(value: { start: string; end: string }) {
  range.value = value
  page.value = 1
  void load()
}
onMounted(load)

function changePage(value: number) {
  page.value = value
  void load()
}
function searchRecords() {
  page.value = 1
  void load()
}
</script>
<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">{{ registration ? 'GROWTH' : 'ENGAGEMENT' }}</p>
      <h1>{{ registration ? '教师注册分析' : '教师登录分析' }}</h1>
      <p class="muted">
        {{
          registration
            ? '观察教师增长，查看注册账号明细。'
            : '区分主动登录、注册后自动登录与实际活跃。'
        }}
      </p>
    </div>
  </div>
  <DateRange @change="changeRange" />
  <p v-if="error" role="alert" class="error">{{ error }} <button @click="load">重试</button></p>
  <p v-if="loading" role="status" class="muted">正在更新数据…</p>
  <template v-if="data"
    ><p v-if="data.hasCoverage === false" class="empty">所选日期早于数据采集时间，暂无统计数据。</p>
    <section class="panel">
      <div class="summary-strip">
        <div v-if="registration">
          <span>期间新增教师</span><strong>{{ data.total }}</strong>
        </div>
        <template v-else
          ><div
            v-for="(label, key) in {
              logins: '成功登录次数',
              teachers: '登录教师数（期间去重）',
              failures: '失败次数',
              autoLogins: '注册后自动登录',
              activeTeachers: '活跃教师数（期间去重）',
            }"
            :key="key"
          >
            <span>{{ label }}</span
            ><strong>{{ data.hasCoverage === false ? '—' : data.totals?.[key] }}</strong>
          </div></template
        >
      </div>
      <BaseChart
        :option="chart"
        :label="registration ? '每日新增教师趋势' : '登录次数、登录教师数与活跃教师数趋势'"
      />
    </section>
    <section v-if="registration" class="panel">
      <h2>累计注册教师</h2>
      <BaseChart :option="cumulative" label="现存教师账号的累计注册趋势" />
    </section>
    <p class="muted footnote">
      {{
        registration
          ? '注册趋势基于现存教师账号的注册时间。'
          : '登录次数不包含注册后自动登录；活跃教师按有效功能操作去重。'
      }}
      登录与功能数据采集自
      {{ formatTime(data.startedAt) }}，采集前为空白，首日数据可能不完整。更新于
      {{ formatTime(data.updatedAt) }}。
    </p></template
  >
  <section class="panel">
    <div class="toolbar">
      <h2 style="margin: 0">{{ registration ? '注册明细' : '登录记录' }}</h2>
      <label v-if="!registration"
        >记录类型<select v-model="kind" @change="searchRecords">
          <option value="">全部</option>
          <option v-for="(label, value) in labels" :key="value" :value="value">{{ label }}</option>
        </select></label
      >
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>教师</th>
            <th>账号</th>
            <th>{{ registration ? '注册时间' : '登录时间' }}</th>
            <th>{{ registration ? '学生 / 班级' : '结果' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in records?.items" :key="item.id">
            <td>
              <RouterLink
                v-if="registration || item.teacherId"
                :to="`/teachers/${registration ? item.id : item.teacherId}`"
                >{{ item.name || '已删除教师' }}</RouterLink
              ><span v-else>未识别账号</span>
            </td>
            <td>{{ item.username || '—' }}</td>
            <td>{{ formatTime(item.createdAt) }}</td>
            <td>
              {{ registration ? `${item.students} / ${item.classrooms}` : labels[item.kind || ''] }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!records?.items.length && !loading" class="empty">暂无符合条件的记录</p>
    </div>
    <PaginationBar
      v-if="records"
      :page="page"
      :total="records.total"
      :loading="loading"
      @change="changePage"
    />
  </section>
</template>
