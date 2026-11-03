<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, formatTime } from '../lib/api'

type Settings = {
  baseUrl: string
  model: string
  apiKeyMasked: string
  configured: boolean
  source: 'database' | 'env' | 'none'
  updatedAt: string | null
}

type AuthorizedTeacher = {
  teacherId: string
  teacherName: string
  teacherUsername: string
  createdAt: string | null
}

type TeacherCandidate = {
  id: string
  name: string
  username: string
  status: string
}

type PermissionsResponse = {
  authorizedTeachers: AuthorizedTeacher[]
  allTeachers: TeacherCandidate[]
}

const settings = ref<Settings | null>(null)
const baseUrl = ref('')
const model = ref('')
const apiKey = ref('')
const balance = ref<unknown>(null)
const loading = ref(false)
const message = ref('')
const error = ref('')
const deleteArmed = ref(false)

const authorizedTeachers = ref<AuthorizedTeacher[]>([])
const allTeachers = ref<TeacherCandidate[]>([])
const selectedTeacherToAdd = ref('')
const permissionLoading = ref(false)
const permissionMessage = ref('')
const permissionError = ref('')

const unauthorizedTeachers = computed(() => {
  const authorizedSet = new Set(authorizedTeachers.value.map((t) => t.teacherId))
  return allTeachers.value.filter((t) => !authorizedSet.has(t.id))
})

function apply(row: Settings) {
  settings.value = row
  baseUrl.value = row.baseUrl
  model.value = row.model
  apiKey.value = ''
}
async function load() {
  apply(await api<Settings>('report-ai-settings'))
}
async function loadPermissions() {
  permissionLoading.value = true
  permissionError.value = ''
  try {
    const res = await api<PermissionsResponse>('report-ai-permissions')
    authorizedTeachers.value = res.authorizedTeachers || []
    allTeachers.value = res.allTeachers || []
  } catch (e) {
    permissionError.value = (e as Error).message
  } finally {
    permissionLoading.value = false
  }
}
async function addPermission() {
  if (!selectedTeacherToAdd.value || permissionLoading.value) return
  permissionLoading.value = true
  permissionError.value = ''
  permissionMessage.value = ''
  try {
    await api('report-ai-permissions', {}, { teacherId: selectedTeacherToAdd.value, enabled: true })
    permissionMessage.value = '已成功为该教师开启 AI 汇总报告使用权限'
    selectedTeacherToAdd.value = ''
    await loadPermissions()
  } catch (e) {
    permissionError.value = (e as Error).message
  } finally {
    permissionLoading.value = false
  }
}
async function removePermission(teacherId: string) {
  if (permissionLoading.value) return
  permissionLoading.value = true
  permissionError.value = ''
  permissionMessage.value = ''
  try {
    await api('report-ai-permissions', {}, { teacherId, enabled: false })
    permissionMessage.value = '已成功撤销该教师的 AI 汇总报告使用权限'
    await loadPermissions()
  } catch (e) {
    permissionError.value = (e as Error).message
  } finally {
    permissionLoading.value = false
  }
}
async function save() {
  loading.value = true
  error.value = ''
  message.value = ''
  try {
    apply(
      await api<Settings>(
        'report-ai-settings',
        {},
        { baseUrl: baseUrl.value, model: model.value, apiKey: apiKey.value },
      ),
    )
    message.value = 'AI 配置已保存并立即生效'
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
async function remove() {
  if (!deleteArmed.value) {
    deleteArmed.value = true
    message.value = '请再次点击确认删除；删除后将自动回退 .env 配置'
    return
  }
  loading.value = true
  try {
    apply(await api<Settings>('report-ai-settings/remove', {}, {}))
    deleteArmed.value = false
    message.value = '数据库配置已删除，当前已回退到 .env 配置'
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
async function queryBalance() {
  loading.value = true
  error.value = ''
  try {
    balance.value = await api('report-ai-settings/balance')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  void load().catch((e) => (error.value = (e as Error).message))
  void loadPermissions().catch((e) => (permissionError.value = (e as Error).message))
})
</script>

<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">
        AI SERVICE
      </p>
      <h1>AI 报告配置</h1>
      <p class="muted">
        配置报告生成服务、授权教师账号并查询账户 Token 余额。
      </p>
    </div>
  </div>
  <section class="panel ai-settings">
    <p
      v-if="message"
      role="status"
      class="success"
    >
      {{ message }}
    </p>
    <p
      v-if="error"
      role="alert"
      class="error"
    >
      {{ error }}
    </p>
    <div class="status-row">
      <strong>{{ settings?.configured ? '已配置' : '未配置' }}</strong>
      <span>来源：{{
        settings?.source === 'database'
          ? 'Admin 数据库配置'
          : settings?.source === 'env'
            ? '.env 环境变量'
            : '无'
      }}</span>
      <span v-if="settings?.updatedAt">更新：{{ formatTime(settings.updatedAt) }}</span>
    </div>
    <label>REPORT_AI_BASE_URL<input
      v-model="baseUrl"
      type="url"
      autocomplete="off"
      placeholder="https://api.moonshot.cn/v1"
    ></label>
    <label>REPORT_AI_MODEL<input
      v-model="model"
      autocomplete="off"
      placeholder="kimi-k2.6"
    ></label>
    <label>REPORT_AI_API_KEY<input
      v-model="apiKey"
      type="password"
      autocomplete="new-password"
      :placeholder="settings?.apiKeyMasked || '输入 API Key'"
    ><small>留空表示保留当前密钥；服务端不会返回明文。</small></label>
    <div class="actions">
      <button
        :disabled="loading"
        @click="save"
      >
        保存并启用
      </button>
      <button
        class="secondary"
        :disabled="loading || !settings || settings.source !== 'database'"
        @click="remove"
      >
        {{ deleteArmed ? '确认删除数据库配置' : '删除数据库配置' }}
      </button>
      <button
        class="secondary"
        :disabled="loading || !settings?.configured"
        @click="queryBalance"
      >
        查询 Token 余额
      </button>
    </div>
    <pre
      v-if="balance"
      class="balance"
    >{{ JSON.stringify(balance, null, 2) }}</pre>
  </section>

  <section class="panel ai-permissions-section">
    <div class="section-header">
      <div>
        <h2>AI 汇总报告使用权限</h2>
        <p class="muted">
          权限限制机制：仅在此处配置授权的教师账号方可使用 AI
          阶段汇总报告功能；未授权教师将受到系统权限限制并提示联系管理员。
        </p>
      </div>
    </div>

    <p
      v-if="permissionMessage"
      role="status"
      class="success"
    >
      {{ permissionMessage }}
    </p>
    <p
      v-if="permissionError"
      role="alert"
      class="error"
    >
      {{ permissionError }}
    </p>

    <div class="add-permission-row">
      <select
        v-model="selectedTeacherToAdd"
        :disabled="permissionLoading"
        class="teacher-select"
      >
        <option
          value=""
          disabled
        >
          选择待授权的教师账号…
        </option>
        <option
          v-for="t in unauthorizedTeachers"
          :key="t.id"
          :value="t.id"
        >
          {{ t.name }}（{{ t.username }}）{{ t.status === 'locked' ? ' [已锁定]' : '' }}
        </option>
      </select>
      <button
        type="button"
        class="primary small"
        :disabled="!selectedTeacherToAdd || permissionLoading"
        @click="addPermission"
      >
        {{ permissionLoading ? '正在授权…' : '添加授权' }}
      </button>
    </div>

    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>教师姓名</th>
            <th>登录账号</th>
            <th>授权时间</th>
            <th>权限操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in authorizedTeachers"
            :key="row.teacherId"
          >
            <td>
              <strong>{{ row.teacherName }}</strong>
            </td>
            <td>
              <code>{{ row.teacherUsername }}</code>
            </td>
            <td>{{ formatTime(row.createdAt) }}</td>
            <td>
              <button
                type="button"
                class="secondary small remove-btn"
                :disabled="permissionLoading"
                @click="removePermission(row.teacherId)"
              >
                移除授权
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-if="!authorizedTeachers.length && !permissionLoading"
        class="empty"
      >
        暂无授权教师。当前没有任何教师被授权使用 AI 阶段汇总报告。
      </p>
    </div>
  </section>
</template>

<style scoped>
.ai-settings {
  display: grid;
  gap: 16px;
  max-width: 820px;
}
.ai-permissions-section {
  display: grid;
  gap: 16px;
  max-width: 820px;
  margin-top: 24px;
}
.section-header h2 {
  margin: 0 0 4px;
}
.add-permission-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.teacher-select {
  min-height: 38px;
  min-width: 280px;
  padding: 0 12px;
  border: 1px solid #d7dce5;
  border-radius: 8px;
  background: white;
}
.remove-btn {
  color: #b91c1c;
}
.remove-btn:hover:not(:disabled) {
  background: #fee2e2;
}
.status-row,
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.status-row {
  padding: 12px;
  border-radius: 10px;
  background: var(--surface-soft, #f4f6fb);
}
label {
  display: grid;
  gap: 7px;
  font-weight: 700;
}
input {
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid #d7dce5;
  border-radius: 9px;
  background: transparent;
  color: inherit;
}
small {
  font-weight: 400;
  color: #718096;
}
.actions button {
  padding: 10px 16px;
  border: 0;
  border-radius: 9px;
  background: #4f46e5;
  color: white;
  font-weight: 700;
  cursor: pointer;
}
.actions .secondary {
  background: #e8eaf2;
  color: #293047;
}
.actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.balance {
  overflow: auto;
  padding: 14px;
  border-radius: 10px;
  background: #111827;
  color: #d1fae5;
}
.success {
  color: #047857;
}
</style>
