<script setup lang="ts">
/** 教师详情中的登录记录、趋势和常用功能都限定到当前教师。 */
import { computed, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  api,
  daysAgo,
  today,
  formatTime,
  type Person,
  type Trend,
  type Ranking,
  type Page,
} from '../lib/api'
import { trendChart, rankingChart } from '../lib/charts'
import BaseChart from '../components/BaseChart.vue'
import DateRange from '../components/DateRange.vue'
import PaginationBar from '../components/PaginationBar.vue'
const route = useRoute(),
  data = ref<Person & { logins: Trend; features: Ranking }>(),
  records = ref<Page<Person>>(),
  page = ref(1),
  range = ref({ start: daysAgo(29), end: today() }),
  error = ref(''),
  loading = ref(false)
/** 递增请求序号，只接纳最新筛选请求的结果，避免较慢旧响应覆盖新页面数据。 */
let requestId = 0
const chart = computed(() =>
  trendChart(data.value?.logins.series || [], [
    { key: 'logins', name: '主动登录次数' },
    { key: 'autoLogins', name: '注册后自动登录' },
  ]),
)
const ranking = computed(() => rankingChart(data.value?.features.items || [], 'uses'))
async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const [a, b] = await Promise.all([
      api<Person & { logins: Trend; features: Ranking }>(
        `teachers/${encodeURIComponent(String(route.params.id))}`,
        range.value,
      ),
      api<Page<Person>>('analytics/login-records', {
        ...range.value,
        teacherId: String(route.params.id),
        page: page.value,
      }),
    ])
    if (id === requestId) {
      data.value = a
      records.value = b
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
</script>
<template>
  <RouterLink to="/teachers" class="back-link">← 返回教师列表</RouterLink>
  <div class="page-heading">
    <div>
      <p class="eyebrow">TEACHER PROFILE</p>
      <h1>{{ data?.name || '教师详情' }}</h1>
    </div>
  </div>
  <p v-if="error" class="error" role="alert">{{ error }} <button @click="load">重试</button></p>
  <p v-if="loading" role="status" class="muted">正在更新数据…</p>
  <section v-if="data" class="panel">
    <div class="detail-info">
      <span>账号：{{ data.username }}</span
      ><span>邮箱：{{ data.email }}</span
      ><span>注册：{{ formatTime(data.createdAt) }}</span
      ><span>最近登录：{{ formatTime(data.lastLoginAt) }}</span
      ><RouterLink class="link" :to="{ path: '/classrooms', query: { teacherId: data.id } }"
        >班级 {{ data.classrooms }} 个 →</RouterLink
      ><RouterLink class="link" :to="{ path: '/students', query: { teacherId: data.id } }"
        >学生档案 {{ data.students }} 份 →</RouterLink
      >
    </div>
  </section>
  <DateRange @change="changeRange" />
  <div v-if="data" class="two-columns">
    <section class="panel">
      <h2>登录趋势</h2>
      <BaseChart :option="chart" label="教师登录趋势" />
    </section>
    <section class="panel">
      <h2>常用功能 · 按使用次数</h2>
      <BaseChart :option="ranking" label="教师常用功能使用次数" />
    </section>
  </div>
  <section v-if="records" class="panel">
    <h2>登录记录</h2>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>类型</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in records.items" :key="row.id">
            <td>{{ formatTime(row.createdAt) }}</td>
            <td>
              {{
                row.kind === 'login'
                  ? '登录成功'
                  : row.kind === 'auto_login'
                    ? '注册后自动登录'
                    : '登录失败'
              }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!records.items.length" class="empty">当前时间范围无登录记录</p>
    </div>
    <PaginationBar :page="page" :total="records.total" :loading="loading" @change="changePage" />
  </section>
  <p v-if="data" class="muted footnote">
    登录与功能数据采集自 {{ formatTime(data.logins.startedAt) }}，采集前为空白。更新于
    {{ formatTime(data.logins.updatedAt) }}。
  </p>
</template>
