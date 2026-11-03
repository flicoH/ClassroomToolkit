<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, formatTime } from '../lib/api'

type Settings = {
  baseUrl: string
  model: string
  apiKeyMasked: string
  configured: boolean
  source: 'database' | 'env' | 'none'
  updatedAt: string | null
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

function apply(row: Settings) {
  settings.value = row
  baseUrl.value = row.baseUrl
  model.value = row.model
  apiKey.value = ''
}
async function load() {
  apply(await api<Settings>('report-ai-settings'))
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
onMounted(() => void load().catch((e) => (error.value = (e as Error).message)))
</script>

<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">
        AI SERVICE
      </p>
      <h1>AI 报告配置</h1>
      <p class="muted">
        配置报告生成服务并查询账户 Token 余额。
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
</template>

<style scoped>
.ai-settings {
  display: grid;
  gap: 16px;
  max-width: 820px;
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
