<script setup lang="ts">
/** 教师详情中的登录记录、趋势和常用功能都限定到当前教师。 */
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
  router = useRouter(),
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
  confirmPassword = ref(''),
  showPasswordTip = ref(false),
  showNewPassword = ref(false),
  showConfirmPassword = ref(false),
  lastResetPassword = ref(''),
  copied = ref(false)
const resetting = ref(false),
  resetError = ref(''),
  resetMessage = ref('')

const showLockModal = ref(false),
  showDeleteModal = ref(false),
  lockActionLoading = ref(false),
  deleteActionLoading = ref(false),
  lockError = ref(''),
  deleteError = ref(''),
  actionMessage = ref(''),
  aiPermissionLoading = ref(false),
  aiPermissionError = ref('')

async function toggleAiPermission() {
  if (!data.value || aiPermissionLoading.value) return
  aiPermissionLoading.value = true
  aiPermissionError.value = ''
  const willEnable = !data.value.hasAiReportPermission
  try {
    const res = await api<{ id: string; hasAiReportPermission: boolean }>(
      `teachers/${encodeURIComponent(data.value.id)}/toggle-ai-permission`,
      {},
      { enabled: willEnable },
    )
    data.value.hasAiReportPermission = res.hasAiReportPermission
    actionMessage.value = res.hasAiReportPermission
      ? '已成功为该教师开启 AI 汇总报告使用权限'
      : '已成功撤销该教师的 AI 汇总报告使用权限'
  } catch (e) {
    aiPermissionError.value = (e as Error).message
  } finally {
    aiPermissionLoading.value = false
  }
}

function openLockModal() {
  showLockModal.value = true
  lockError.value = ''
}
function closeLockModal() {
  if (lockActionLoading.value) return
  showLockModal.value = false
  lockError.value = ''
}
function forceCloseLockModal() {
  showLockModal.value = false
  lockError.value = ''
}
async function confirmToggleLock() {
  if (!data.value || lockActionLoading.value) return
  lockActionLoading.value = true
  lockError.value = ''
  const willLock = data.value.status !== 'locked'
  try {
    const res = await api<{ id: string; locked: boolean; status: 'active' | 'locked' }>(
      `teachers/${encodeURIComponent(data.value.id)}/toggle-lock`,
      {},
      { locked: willLock },
    )
    data.value.status = res.status
    data.value.lockedAt = willLock ? new Date().toISOString() : null
    actionMessage.value = willLock
      ? '教师账号已成功锁定，其所有会话已失效'
      : '教师账号已成功解锁，恢复登录能力'
    forceCloseLockModal()
  } catch (e) {
    lockError.value = (e as Error).message
  } finally {
    lockActionLoading.value = false
  }
}

function openDeleteModal() {
  showDeleteModal.value = true
  deleteError.value = ''
}
function closeDeleteModal() {
  if (deleteActionLoading.value) return
  showDeleteModal.value = false
  deleteError.value = ''
}
function forceCloseDeleteModal() {
  showDeleteModal.value = false
  deleteError.value = ''
}
async function confirmDeleteTeacher() {
  if (!data.value || deleteActionLoading.value) return
  deleteActionLoading.value = true
  deleteError.value = ''
  try {
    await api(`teachers/${encodeURIComponent(data.value.id)}/delete`, {}, {})
    forceCloseDeleteModal()
    await router.push('/teachers')
  } catch (e) {
    deleteError.value = (e as Error).message
  } finally {
    deleteActionLoading.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeLockModal()
    closeDeleteModal()
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
/** 打开重置表单并清除上次成功提示。 */
function openReset() {
  showReset.value = true
  resetMessage.value = ''
  lastResetPassword.value = ''
}
/** 关闭表单时清空密码，避免凭据保留在页面状态中。 */
function closeReset() {
  showReset.value = false
  newPassword.value = ''
  confirmPassword.value = ''
  showNewPassword.value = false
  showConfirmPassword.value = false
  resetError.value = ''
}
async function copyPassword() {
  if (!lastResetPassword.value) return
  try {
    await navigator.clipboard.writeText(lastResetPassword.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    // 兼容剪贴板异常
  }
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
    const pwd = newPassword.value
    await api(`teachers/${encodeURIComponent(data.value.id)}/reset-password`, {}, { password: pwd })
    lastResetPassword.value = pwd
    closeReset()
    resetMessage.value = `密码已重置为：${pwd}。请将新密码告知该教师。`
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
      <span>账号：{{ data.username }}</span><span>邮箱：{{ data.email }}</span><span>注册：{{ formatTime(data.createdAt) }}</span><span>最近登录：{{ formatTime(data.lastLoginAt) }}</span><RouterLink
        class="link"
        :to="{ path: '/classrooms', query: { teacherId: data.id } }"
      >
        班级 {{ data.classrooms }} 个 →
      </RouterLink><RouterLink
        class="link"
        :to="{ path: '/students', query: { teacherId: data.id } }"
      >
        学生档案 {{ data.students }} 份 →
      </RouterLink>
    </div>
  </section>
  <section
    v-if="data"
    class="panel"
  >
    <h2>账号安全</h2>
    <div class="security-card">
      <div class="security-row">
        <div class="password-meta">
          <span class="label">账号状态：</span>
          <span
            :class="['status-badge', data.status === 'locked' ? 'status-locked' : 'status-active']"
          >
            {{ data.status === 'locked' ? '已锁定' : '正常' }}
          </span>
          <small
            v-if="data.lockedAt"
            class="muted lock-time"
          >（于 {{ formatTime(data.lockedAt) }} 锁定）</small>
        </div>
        <div class="security-actions">
          <button
            type="button"
            :class="['small', data.status === 'locked' ? 'primary' : 'warning-btn']"
            @click="openLockModal"
          >
            {{ data.status === 'locked' ? '解锁账号' : '锁定账号' }}
          </button>
          <button
            type="button"
            class="small danger-btn"
            @click="openDeleteModal"
          >
            删除账号
          </button>
        </div>
      </div>
      <div class="security-row">
        <div class="password-meta">
          <span class="label">AI 汇总报告权限：</span>
          <span
            :class="[
              'status-badge',
              data.hasAiReportPermission ? 'status-active' : 'status-inactive',
            ]"
          >
            {{ data.hasAiReportPermission ? '已授权' : '未授权' }}
          </span>
          <small class="muted lock-time">
            {{
              data.hasAiReportPermission
                ? '（该教师可正常使用 AI 阶段汇总分析报告）'
                : '（该教师暂无法发起或生成 AI 阶段汇总分析）'
            }}
          </small>
        </div>
        <div class="security-actions">
          <button
            type="button"
            :class="['small', data.hasAiReportPermission ? 'warning-btn' : 'primary']"
            :disabled="aiPermissionLoading"
            @click="toggleAiPermission"
          >
            {{
              aiPermissionLoading ? '处理中…' : data.hasAiReportPermission ? '撤销授权' : '开启授权'
            }}
          </button>
        </div>
      </div>
      <p
        v-if="aiPermissionError"
        class="error"
        role="alert"
      >
        {{ aiPermissionError }}
      </p>
      <div class="security-row">
        <div class="password-meta">
          <span class="label">登录密码：</span>
          <span class="mask">••••••••</span>
        </div>
        <div class="security-actions">
          <button
            type="button"
            class="secondary small"
            @click="showPasswordTip = !showPasswordTip"
          >
            {{ showPasswordTip ? '收起密码说明' : '查看密码' }}
          </button>
          <button
            v-if="!showReset"
            type="button"
            class="small"
            @click="openReset"
          >
            重置密码
          </button>
        </div>
      </div>
      <div
        v-if="showPasswordTip"
        class="security-tip"
        role="status"
      >
        <p class="tip-title">
          🔐 密码安全存储机制
        </p>
        <p>
          为保障教师账号隐私与平台安全，系统密码采用行业标准
          <strong>PBKDF2-SHA512</strong> 深度单向加盐哈希（120,000
          次迭代）存储，数据库不保存任何明文，无法直接反查原始密码。
        </p>
        <p>如教师遗忘密码，请点击<strong>【重置密码】</strong>为其设置新密码。</p>
      </div>
    </div>
    <div
      v-if="actionMessage"
      class="success-banner"
      role="status"
    >
      <span>{{ actionMessage }}</span>
      <button
        type="button"
        class="secondary small copy-btn"
        @click="actionMessage = ''"
      >
        ✕
      </button>
    </div>
    <div
      v-if="resetMessage"
      class="success-banner"
      role="status"
    >
      <span>{{ resetMessage }}</span>
      <button
        v-if="lastResetPassword"
        type="button"
        class="secondary small copy-btn"
        @click="copyPassword"
      >
        {{ copied ? '已复制！' : '复制新密码' }}
      </button>
    </div>
    <form
      v-if="showReset"
      class="reset-form"
      @submit.prevent="resetPassword"
    >
      <p>为 {{ data.name }}（{{ data.username }}）设置新密码，提交后该教师已有登录会话将失效。</p>
      <label>
        新密码
        <div class="password-input-wrap">
          <input
            v-model="newPassword"
            :type="showNewPassword ? 'text' : 'password'"
            autocomplete="new-password"
            required
            minlength="6"
            maxlength="256"
            :disabled="resetting"
          >
          <button
            type="button"
            class="toggle-eye"
            :disabled="resetting"
            @click="showNewPassword = !showNewPassword"
          >
            {{ showNewPassword ? '隐藏' : '查看密码' }}
          </button>
        </div>
      </label>
      <label>
        确认新密码
        <div class="password-input-wrap">
          <input
            v-model="confirmPassword"
            :type="showConfirmPassword ? 'text' : 'password'"
            autocomplete="new-password"
            required
            minlength="6"
            maxlength="256"
            :disabled="resetting"
          >
          <button
            type="button"
            class="toggle-eye"
            :disabled="resetting"
            @click="showConfirmPassword = !showConfirmPassword"
          >
            {{ showConfirmPassword ? '隐藏' : '查看密码' }}
          </button>
        </div>
      </label>
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

  <!-- 锁定/解锁二次确认弹窗 -->
  <div
    v-if="showLockModal"
    class="dialog-backdrop"
    @click.self="closeLockModal"
  >
    <div
      class="confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-dialog-title"
    >
      <div class="dialog-heading">
        <div>
          <p class="eyebrow">
            ACCOUNT STATUS
          </p>
          <h2 id="lock-dialog-title">
            {{ data?.status === 'locked' ? '解除教师账号锁定' : '锁定教师账号' }}
          </h2>
        </div>
        <button
          type="button"
          aria-label="关闭弹窗"
          @click="closeLockModal"
        >
          ✕
        </button>
      </div>
      <div class="dialog-body">
        <p v-if="data?.status === 'locked'">
          确定要解锁教师 <strong>{{ data?.name }}（{{ data?.username }}）</strong> 的账号吗？
          <br>解锁后该教师将恢复正常登录平台。
        </p>
        <p v-else>
          确定要锁定教师 <strong>{{ data?.name }}（{{ data?.username }}）</strong> 的账号吗？
          <br><strong class="warning-text">锁定后该教师现有的所有登录会话将立即失效被强制下线，且无法再次登录</strong>，直到管理员重新解锁。
        </p>
        <p
          v-if="lockError"
          class="error"
          role="alert"
        >
          {{ lockError }}
        </p>
      </div>
      <div class="dialog-footer">
        <button
          type="button"
          class="secondary"
          :disabled="lockActionLoading"
          @click="closeLockModal"
        >
          取消
        </button>
        <button
          type="button"
          :class="[data?.status === 'locked' ? 'primary' : 'warning-btn']"
          :disabled="lockActionLoading"
          @click="confirmToggleLock"
        >
          {{ lockActionLoading ? '处理中…' : data?.status === 'locked' ? '确认解锁' : '确认锁定' }}
        </button>
      </div>
    </div>
  </div>

  <!-- 删除教师二次确认弹窗 -->
  <div
    v-if="showDeleteModal"
    class="dialog-backdrop"
    @click.self="closeDeleteModal"
  >
    <div
      class="confirm-dialog danger"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div class="dialog-heading">
        <div>
          <p class="eyebrow danger-eyebrow">
            DANGER ZONE
          </p>
          <h2 id="delete-dialog-title">
            删除教师账号
          </h2>
        </div>
        <button
          type="button"
          aria-label="关闭弹窗"
          @click="closeDeleteModal"
        >
          ✕
        </button>
      </div>
      <div class="dialog-body">
        <p>
          确定要彻底删除教师 <strong>{{ data?.name }}（{{ data?.username }}）</strong> 吗？
        </p>
        <div class="danger-callout">
          <p><strong>⚠️ 此操作不可撤销！</strong></p>
          <p>系统将永久清理该教师名下的：</p>
          <ul>
            <li>全部班级与分组数据</li>
            <li>全部学生档案数据</li>
            <li>任务统计、座位表、随机点名、便签、宠物积分与扭蛋记录</li>
            <li>期末学期报告及课件解析记录</li>
            <li>所有登录会话与意见反馈记录</li>
          </ul>
        </div>
        <p
          v-if="deleteError"
          class="error"
          role="alert"
        >
          {{ deleteError }}
        </p>
      </div>
      <div class="dialog-footer">
        <button
          type="button"
          class="secondary"
          :disabled="deleteActionLoading"
          @click="closeDeleteModal"
        >
          取消
        </button>
        <button
          type="button"
          class="danger-btn"
          :disabled="deleteActionLoading"
          @click="confirmDeleteTeacher"
        >
          {{ deleteActionLoading ? '正在删除…' : '确认彻底删除' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.status-active {
  background: #dcfce7;
  color: #166534;
}
.status-inactive {
  background: #f1f5f9;
  color: #64748b;
}
.status-locked {
  background: #fee2e2;
  color: #991b1b;
}
.lock-time {
  font-size: 12px;
}
.warning-btn {
  background: #f59e0b;
  color: #ffffff;
  border: 1px solid #d97706;
}
.warning-btn:hover:not(:disabled) {
  background: #d97706;
}
.danger-btn {
  background: #ef4444;
  color: #ffffff;
  border: 1px solid #dc2626;
}
.danger-btn:hover:not(:disabled) {
  background: #dc2626;
}
.danger-eyebrow {
  color: #dc2626;
}
.warning-text {
  color: #b45309;
}
.confirm-dialog {
  width: min(540px, 100%);
  border-radius: 14px;
  background: white;
  padding: 24px;
  box-shadow: 0 24px 70px rgba(9, 28, 58, 0.28);
}
.dialog-body {
  margin: 18px 0;
  font-size: 14px;
  line-height: 1.6;
}
.danger-callout {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 12px;
  color: #991b1b;
  font-size: 13px;
}
.danger-callout ul {
  margin: 8px 0 0;
  padding-left: 20px;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.security-card {
  display: grid;
  gap: 12px;
  max-width: 600px;
  margin-bottom: 16px;
}
.security-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 14px;
  background: var(--surface-soft, #f4f6fb);
  border-radius: 8px;
}
.password-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.password-meta .mask {
  letter-spacing: 2px;
  font-family: monospace;
  font-size: 16px;
  color: var(--text-muted, #64748b);
}
.security-actions {
  display: flex;
  gap: 8px;
}
.security-actions button.small {
  padding: 6px 12px;
  font-size: 13px;
}
.security-tip {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.6;
  color: #166534;
}
.security-tip .tip-title {
  font-weight: 700;
  margin-bottom: 4px;
}
.success-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 16px;
  max-width: 600px;
  font-size: 14px;
}
.copy-btn {
  white-space: nowrap;
  padding: 4px 10px;
  font-size: 12px;
}
.password-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.password-input-wrap input {
  width: 100%;
  padding-right: 80px;
}
.toggle-eye {
  position: absolute;
  right: 6px;
  padding: 4px 8px;
  font-size: 12px;
  background: transparent;
  color: #4f46e5;
  border: none;
  cursor: pointer;
}
.toggle-eye:hover {
  text-decoration: underline;
}
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
