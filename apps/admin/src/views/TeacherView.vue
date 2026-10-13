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
const showReset = ref(false),
  newPassword = ref(''),
  confirmPassword = ref('')
const resetting = ref(false),
  resetError = ref(''),
  resetMessage = ref('')
/** 打开重置表单并清除上次成功提示。 */
function openReset() {
  showReset.value = true
  resetMessage.value = ''
}
/** 关闭表单时清空密码，避免凭据保留在页面状态中。 */
function closeReset() {
  showReset.value = false
  newPassword.value = ''
  confirmPassword.value = ''
  resetError.value = ''
}
/** 校验两次输入，仅向当前教师的管理接口提交新密码。 */
async function resetPassword() {
  if (resetting.value || !data.value) return
  resetError.value = ''
  resetMessage.value = ''
  if (newPassword.value.length < 6 || newPassword.value.length > 256) {
    resetError.value = '密码长度须为 6–256 位'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    resetError.value = '两次输入的密码不一致'
    return
  }
  resetting.value = true
  try {
    await api(
      `teachers/${encodeURIComponent(data.value.id)}/reset-password`,
      {},
      { password: newPassword.value },
    )
    closeReset()
    resetMessage.value = '密码已重置，教师需使用新密码重新登录。请将新密码告知该教师。'
  } catch (e) {
    resetError.value = (e as Error).message
  } finally {
    resetting.value = false
  }
}
onMounted(load)

function changePage(value: number) {
  page.value = value
  void load()
}
</script>
<template>
  <RouterLink
    to="/teachers"
    class="back-link"
  >
    ← 返回教师列表
  </RouterLink>
  <div class="page-heading">
    <div>
      <p class="eyebrow">
        TEACHER PROFILE
      </p>
      <h1>{{ data?.name || '教师详情' }}</h1>
    </div>
  </div>
  <p
    v-if="error"
    class="error"
    role="alert"
  >
    {{ error }} <button @click="load">
      重试
    </button>
  </p>
  <p
    v-if="loading"
    role="status"
    class="muted"
  >
    正在更新数据…
  </p>
  <section
    v-if="data"
    class="panel"
  >
    <div class="detail-info">
      <span>{{ data.accountType === 'sub' ? '子账号' : '主账号' }} ·
        {{
          data.status === 'locked' ? '已锁定' : data.status === 'deleted' ? '已删除' : '正常'
        }}</span>
      <RouterLink
        v-if="data.parentAccountId"
        class="link"
        :to="`/teachers/${data.parentAccountId}`"
      >
        所属主账号 →
      </RouterLink>
      <span>账号：{{ data.username }}</span><span>邮箱：{{ data.email }}</span><span>注册：{{ formatTime(data.createdAt) }}</span><span>最近登录：{{ formatTime(data.lastLoginAt) }}</span><RouterLink
        class="link"
        :to="{ path: '/classrooms', query: { teacherId: data.ownerAccountId || data.id } }"
      >
        {{
          data.accountType === 'sub' ? '共享主账号班级 →' : `班级 ${data.classrooms} 个 →`
        }}
      </RouterLink><RouterLink
        class="link"
        :to="{ path: '/students', query: { teacherId: data.ownerAccountId || data.id } }"
      >
        {{ data.accountType === 'sub' ? '共享主账号学生 →' : `学生档案 ${data.students} 份 →` }}
      </RouterLink>
    </div>
  </section>
  <section
    v-if="data?.subaccounts?.length"
    class="panel"
  >
    <h2>子账号（{{ data.subaccounts.length }} 个，含历史已删除账号）</h2>
    <ul>
      <li
        v-for="child in data.subaccounts"
        :key="child.id"
      >
        <RouterLink :to="`/teachers/${child.id}`">
          {{ child.name }}（{{ child.username }}）·
          {{
            child.status === 'deleted' ? '已删除' : child.status === 'locked' ? '已锁定' : '正常'
          }}
          → 使用详情
        </RouterLink>
      </li>
    </ul>
  </section>
  <section
    v-if="data?.teamUsage"
    class="panel"
  >
    <h2>主账号与全部子账号汇总</h2>
    <p>
      主动登录 {{ data.teamUsage.totals.logins }} 次 · 活跃
      {{ data.teamUsage.totals.activeDays }} 天 · 成功使用 {{ data.teamUsage.totals.uses }} 次
    </p>
  </section>
  <section
    v-if="data?.usage"
    class="panel"
  >
    <h2>使用习惯（当前日期范围，北京时间）</h2>
    <p>
      主动登录 {{ data.usage.totals.logins }} 次 · 活跃 {{ data.usage.totals.activeDays }} 天 ·
      成功使用 {{ data.usage.totals.uses }} 次
    </p>
    <h3>常用时段</h3>
    <p>{{ data.usage.hours.map((h) => `${h.hour}时：${h.uses}次`).join('；') || '暂无记录' }}</p>
    <h3>功能与报告版本</h3>
    <ul>
      <li
        v-for="(feature, i) in data.usage.features"
        :key="i"
      >
        {{ feature.name }} {{ feature.reportVersion || '' }}：使用 {{ feature.uses }} 次 / 打开
        {{ feature.opens }} 次
      </li>
    </ul>
    <h3>每日使用</h3>
    <p>{{ data.usage.days.map((d) => `${d.date}：${d.uses}次`).join('；') || '暂无记录' }}</p>
  </section>
  <section
    v-if="data"
    class="panel"
  >
    <h2>账号安全</h2>
    <p
      v-if="resetMessage"
      role="status"
    >
      {{ resetMessage }}
    </p>
    <button
      v-if="!showReset && data.status !== 'deleted'"
      @click="openReset"
    >
      重置密码
    </button>
    <form
      v-else
      class="reset-form"
      @submit.prevent="resetPassword"
    >
      <p>为 {{ data.name }}（{{ data.username }}）设置新密码，提交后该教师已有登录会话将失效。</p>
      <label>新密码<input
        v-model="newPassword"
        type="password"
        autocomplete="new-password"
        required
        minlength="6"
        maxlength="256"
        :disabled="resetting"
      ></label>
      <label>确认新密码<input
        v-model="confirmPassword"
        type="password"
        autocomplete="new-password"
        required
        minlength="6"
        maxlength="256"
        :disabled="resetting"
      ></label>
      <p
        v-if="resetError"
        class="error"
        role="alert"
      >
        {{ resetError }}
      </p>
      <div class="reset-actions">
        <button
          class="primary"
          :disabled="resetting"
        >
          {{ resetting ? '正在重置…' : '确认重置密码' }}
        </button>
        <button
          type="button"
          :disabled="resetting"
          @click="closeReset"
        >
          取消
        </button>
      </div>
    </form>
  </section>
  <DateRange @change="changeRange" />
  <div
    v-if="data"
    class="two-columns"
  >
    <section class="panel">
      <h2>登录趋势</h2>
      <BaseChart
        :option="chart"
        label="教师登录趋势"
      />
    </section>
    <section class="panel">
      <h2>常用功能 · 按使用次数</h2>
      <BaseChart
        :option="ranking"
        label="教师常用功能使用次数"
      />
    </section>
  </div>
  <section
    v-if="records"
    class="panel"
  >
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
          <tr
            v-for="row in records.items"
            :key="row.id"
          >
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
      <p
        v-if="!records.items.length"
        class="empty"
      >
        当前时间范围无登录记录
      </p>
    </div>
    <PaginationBar
      :page="page"
      :total="records.total"
      :loading="loading"
      @change="changePage"
    />
  </section>
  <p
    v-if="data"
    class="muted footnote"
  >
    登录与功能数据采集自 {{ formatTime(data.logins.startedAt) }}，采集前为空白。更新于
    {{ formatTime(data.logins.updatedAt) }}。
  </p>
</template>

<style scoped>
.reset-form {
  display: grid;
  gap: 16px;
  max-width: 560px;
}
.reset-form label {
  display: grid;
  gap: 8px;
}
.reset-actions {
  display: flex;
  gap: 12px;
}
</style>
