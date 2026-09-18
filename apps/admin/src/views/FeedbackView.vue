<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { api, formatTime, type Page } from '../lib/api'
import PaginationBar from '../components/PaginationBar.vue'

interface FeedbackRow {
  id: string
  teacherId: string
  teacherName: string | null
  teacherUsername: string | null
  content: string
  createdAt: string
}

const data = ref<Page<FeedbackRow>>()
const search = ref('')
const page = ref(1)
const loading = ref(false)
const error = ref('')
const selected = ref<FeedbackRow | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await api<Page<FeedbackRow>>('feedback', {
      page: page.value,
      search: search.value,
    })
    if (id === requestId) data.value = result
  } catch (e) {
    if (id === requestId) {
      error.value = (e as Error).message
      data.value = undefined
    }
  } finally {
    if (id === requestId) loading.value = false
  }
}

function searchRecords() {
  page.value = 1
  void load()
}

function changePage(value: number) {
  page.value = value
  void load()
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') selected.value = null
}

onMounted(() => {
  void load()
  document.addEventListener('keydown', closeOnEscape)
})
onUnmounted(() => document.removeEventListener('keydown', closeOnEscape))
</script>

<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">FEEDBACK</p>
      <h1>意见反馈</h1>
      <p class="muted">查看教师提交的功能建议和使用问题。</p>
    </div>
  </div>

  <form class="toolbar" @submit.prevent="searchRecords">
    <input
      v-model="search"
      type="search"
      placeholder="搜索教师姓名、账号或意见内容"
      aria-label="搜索意见"
      maxlength="100"
    />
    <button class="primary" :disabled="loading">查询</button>
  </form>

  <p v-if="error" class="error" role="alert">{{ error }} <button @click="load">重试</button></p>
  <p v-if="loading" role="status" class="muted">正在加载…</p>
  <section class="panel">
    <div class="table-scroll">
      <table class="feedback-table">
        <thead>
          <tr>
            <th>提交教师</th>
            <th>意见摘要</th>
            <th>提交时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data?.items" :key="row.id">
            <td>
              <RouterLink v-if="row.teacherId" :to="`/teachers/${row.teacherId}`">
                <strong>{{ row.teacherName || '已删除教师' }}</strong>
                <small>{{ row.teacherUsername || row.teacherId }}</small>
              </RouterLink>
            </td>
            <td>
              <span class="feedback-summary">{{ row.content }}</span>
            </td>
            <td>{{ formatTime(row.createdAt) }}</td>
            <td>
              <button type="button" class="link-button" @click="selected = row">查看详情</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!data?.items.length && !loading" class="empty">暂无教师意见</p>
    </div>
    <PaginationBar
      v-if="data"
      :page="page"
      :total="data.total"
      :page-size="data.pageSize"
      :loading="loading"
      @change="changePage"
    />
  </section>

  <div v-if="selected" class="dialog-backdrop" @click.self="selected = null">
    <section
      class="feedback-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-dialog-title"
    >
      <div class="dialog-heading">
        <div>
          <p class="eyebrow">FEEDBACK DETAIL</p>
          <h2 id="feedback-dialog-title">意见详情</h2>
        </div>
        <button type="button" aria-label="关闭意见详情" @click="selected = null">关闭</button>
      </div>
      <dl class="feedback-meta">
        <div>
          <dt>提交教师</dt>
          <dd>
            <RouterLink :to="`/teachers/${selected.teacherId}`">
              {{ selected.teacherName || '已删除教师' }}
            </RouterLink>
          </dd>
        </div>
        <div>
          <dt>教师账号</dt>
          <dd>{{ selected.teacherUsername || '—' }}</dd>
        </div>
        <div>
          <dt>提交时间</dt>
          <dd>{{ formatTime(selected.createdAt) }}</dd>
        </div>
      </dl>
      <div class="feedback-detail">
        <span>意见内容</span>
        <p>{{ selected.content }}</p>
      </div>
    </section>
  </div>
</template>
