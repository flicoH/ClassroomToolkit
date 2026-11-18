<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, daysAgo, formatTime, today } from '../lib/api'
import PaginationBar from '../components/PaginationBar.vue'

const operations = {
  pdf_upload: 'PDF 上传',
  pdf_content: 'PDF 文本提取',
  pdf_delete: 'PDF 云端清理',
  balance: '余额查询',
}

type Tokens = {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

type Usage = {
  page: number
  pageSize: number
  summary: Tokens & { totalCalls: number; unknownCalls: number }
  items: (Tokens & {
    id: string
    calledAt: string
    operation: keyof typeof operations
    documentId: string | null
    teacherId: string | null
    pageNumber: number | null
    status: 'responded' | 'failed'
    httpStatus: number | null
  })[]
}

const start = ref(daysAgo(29))
const end = ref(today())
const kind = ref('')
const status = ref('')
const data = ref<Usage | null>(null)
const loading = ref(false)
const error = ref('')
let requestId = 0

function token(value: number | null) {
  return value === null ? '未知' : value.toLocaleString('zh-CN')
}

async function load(page = 1) {
  const current = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await api<Usage>('other-ai-usage', {
      start: start.value,
      end: end.value,
      kind: kind.value || undefined,
      status: status.value || undefined,
      page,
    })
    if (current === requestId) data.value = result
  } catch (e) {
    if (current === requestId) {
      error.value = (e as Error).message
      data.value = null
    }
  } finally {
    if (current === requestId) loading.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <section aria-label="其他服务调用">
    <form
      class="toolbar filter-surface"
      @submit.prevent="load()"
    >
      <label>开始日期 <input
        v-model="start"
        type="date"
        required
      ></label>
      <label>结束日期 <input
        v-model="end"
        type="date"
        required
      ></label>
      <label>
        调用类型
        <select v-model="kind">
          <option value="">全部</option>
          <option
            v-for="(label, key) in operations"
            :key="key"
            :value="key"
          >
            {{ label }}
          </option>
        </select>
      </label>
      <label>
        调用状态
        <select v-model="status">
          <option value="">全部</option>
          <option value="responded">成功</option>
          <option value="failed">失败</option>
        </select>
      </label>
      <button
        type="submit"
        :disabled="loading"
      >
        查询
      </button>
    </form>
    <p
      v-if="loading"
      role="status"
    >
      正在加载其他服务调用…
    </p>
    <p
      v-else-if="error"
      role="alert"
      class="error"
    >
      {{ error }}
      <button
        type="button"
        @click="load()"
      >
        重试
      </button>
    </p>
    <template v-else-if="data">
      <p>调用 {{ data.summary.totalCalls }} 次 · 总用量未知 {{ data.summary.unknownCalls }} 次</p>
      <p v-if="data.summary.totalCalls">
        已记录 Token · 输入 {{ token(data.summary.promptTokens) }} · 输出
        {{ token(data.summary.completionTokens) }} · 总计 {{ token(data.summary.totalTokens) }}
      </p>
      <p
        v-if="!data.items.length"
        class="muted"
      >
        暂无符合条件的其他服务调用
      </p>
      <div
        v-else
        class="call-table"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">
                调用时间
              </th>
              <th scope="col">
                类型
              </th>
              <th scope="col">
                课件 / 页码
              </th>
              <th scope="col">
                教师 ID
              </th>
              <th scope="col">
                状态
              </th>
              <th scope="col">
                输入 Token
              </th>
              <th scope="col">
                输出 Token
              </th>
              <th scope="col">
                总 Token
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in data.items"
              :key="item.id"
            >
              <td>{{ formatTime(item.calledAt) }}</td>
              <td>{{ operations[item.operation] }}</td>
              <td>
                {{ item.documentId ?? '—' }}
                <span v-if="item.pageNumber">第 {{ item.pageNumber }} 页</span>
              </td>
              <td>{{ item.teacherId ?? '—' }}</td>
              <td>
                {{ item.status === 'responded' ? '成功' : '失败' }}
                <span v-if="item.httpStatus"> · HTTP {{ item.httpStatus }}</span>
              </td>
              <td>{{ token(item.promptTokens) }}</td>
              <td>{{ token(item.completionTokens) }}</td>
              <td>{{ token(item.totalTokens) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <PaginationBar
        v-if="data.summary.totalCalls > data.pageSize"
        :page="data.page"
        :page-size="data.pageSize"
        :total="data.summary.totalCalls"
        @change="load"
      />
    </template>
  </section>
</template>

<style scoped>
.call-table {
  overflow-x: auto;
}
td,
th {
  white-space: nowrap;
}
</style>
