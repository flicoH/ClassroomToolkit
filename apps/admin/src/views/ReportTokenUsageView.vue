<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, daysAgo, formatTime, today } from '../lib/api'
import PaginationBar from '../components/PaginationBar.vue'

export type TokenReportItem = {
  reportId: string
  teacherId?: string | null
  teacherName?: string | null
  teacherUsername?: string | null
  studentId: string
  studentNo?: string | null
  studentName: string
  className: string
  reportKind: string
  periodType: string
  periodStart: string
  periodEnd: string
  latestCalledAt: string | null
  callsCount: number
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  unknownCallsCount: number
  trackingStatus: 'tracked' | 'template_no_model' | 'legacy_untracked'
}

export type TokenCallItem = {
  id: string
  calledAt: string | null
  respondedAt: string | null
  durationMs: number | null
  provider: string
  model: string
  status: 'in_progress' | 'responded' | 'failed'
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  responseId: string | null
}

export type TokenSummary = {
  totalReports: number
  totalCalls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  unknownCalls: number
}

export type TokenUsageResponse = {
  total: number
  page: number
  pageSize: number
  range: { start: string; end: string }
  summary: TokenSummary
  items: TokenReportItem[]
}

export type CallsResponse = {
  reportId: string
  studentName: string
  total: number
  page: number
  pageSize: number
  range: { start: string; end: string }
  items: TokenCallItem[]
}

const student = ref('')
const start = ref(daysAgo(29))
const end = ref(today())
const model = ref('')
const status = ref('')
const page = ref(1)
const pageSize = ref(20)

const data = ref<TokenUsageResponse | null>(null)
const loading = ref(false)
const error = ref('')

const expandedReportId = ref<string | null>(null)
const expandedCalls = ref<TokenCallItem[]>([])
const expandedCallsLoading = ref(false)
const expandedCallsError = ref('')
const expandedCallsPage = ref(1)
const expandedCallsTotal = ref(0)
const expandedCallsPageSize = ref(10)

let requestId = 0

async function load() {
  const currentId = ++requestId
  loading.value = true
  error.value = ''
  try {
    const res = await api<TokenUsageResponse>('report-token-usage', {
      student: student.value.trim() || undefined,
      start: start.value,
      end: end.value,
      model: model.value || undefined,
      status: status.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    })
    if (currentId === requestId) {
      data.value = res
      // 如果当前展开的报告不在新列表中，收起明细
      if (
        expandedReportId.value &&
        !res.items.some((item) => item.reportId === expandedReportId.value)
      ) {
        expandedReportId.value = null
        expandedCalls.value = []
      }
    }
  } catch (e) {
    if (currentId === requestId) {
      error.value = (e as Error).message
      data.value = null
    }
  } finally {
    if (currentId === requestId) {
      loading.value = false
    }
  }
}

function handleSearch() {
  page.value = 1
  void load()
}

function handleReset() {
  student.value = ''
  start.value = daysAgo(29)
  end.value = today()
  model.value = ''
  status.value = ''
  page.value = 1
  void load()
}

function setDatePreset(days: number) {
  start.value = daysAgo(days - 1)
  end.value = today()
  handleSearch()
}

function changePage(newPage: number) {
  page.value = newPage
  void load()
}

async function loadCalls(reportId: string, targetPage = 1) {
  expandedCallsLoading.value = true
  expandedCallsError.value = ''
  expandedCallsPage.value = targetPage
  try {
    const res = await api<CallsResponse>(`report-token-usage/${reportId}/calls`, {
      start: start.value,
      end: end.value,
      model: model.value || undefined,
      status: status.value || undefined,
      page: targetPage,
      pageSize: expandedCallsPageSize.value,
    })
    expandedCalls.value = res.items || []
    expandedCallsTotal.value = res.total || 0
  } catch (e) {
    expandedCallsError.value = (e as Error).message
    expandedCalls.value = []
    expandedCallsTotal.value = 0
  } finally {
    expandedCallsLoading.value = false
  }
}

function toggleExpand(item: TokenReportItem) {
  if (expandedReportId.value === item.reportId) {
    expandedReportId.value = null
    expandedCalls.value = []
    return
  }
  expandedReportId.value = item.reportId
  if (item.trackingStatus === 'tracked') {
    void loadCalls(item.reportId, 1)
  } else {
    expandedCalls.value = []
    expandedCallsTotal.value = 0
  }
}

function formatPeriodText(item: TokenReportItem) {
  const kindLabel =
    item.reportKind === 'stage' ? '阶段总结' : item.periodType === 'month' ? '月报' : '周报'
  const startDate = item.periodStart.slice(0, 10)
  const endDate = item.periodEnd.slice(0, 10)
  return `${kindLabel} (${startDate} ~ ${endDate})`
}

function formatDuration(ms: number | null) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function formatStudentMeta(item: TokenReportItem): string {
  const parts: string[] = []

  // 1. 教师名称展示（避免显示内部 teacher-*** ID）
  const teacherText = item.teacherName || item.teacherUsername
  if (teacherText) {
    parts.push(`教师：${teacherText}`)
  } else if (item.teacherId) {
    parts.push('教师：已删除教师')
  }

  // 2. 班级名称展示（避免显示内部 class-*** ID）
  if (item.className) {
    parts.push(`班级：${item.className}`)
  }

  // 3. 学号展示（避免显示 teacher-***:class-***:xxx 复合 ID）
  if (item.studentNo) {
    parts.push(`学号：${item.studentNo}`)
  } else if (item.studentId) {
    if (item.studentId.startsWith('deleted:')) {
      parts.push('已归档')
    } else {
      const segs = item.studentId.split(':')
      const lastSeg = segs[segs.length - 1]
      if (lastSeg && !lastSeg.startsWith('teacher-') && !lastSeg.startsWith('class-')) {
        parts.push(`学号：${lastSeg}`)
      }
    }
  }

  if (parts.length === 0) {
    return item.className || '—'
  }

  return parts.join(' · ')
}

onMounted(load)
</script>

<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">
        TOKEN USAGE TRACKING
      </p>
      <h1>AI 报告 Token 追踪</h1>
      <p class="muted">
        一期实时追踪报告正文 Kimi 模型调用消耗；旧报告与模板生成不产生模型请求。统计以北京时间为准。
      </p>
    </div>
    <div
      v-if="data?.range"
      class="range-indicator"
    >
      <span class="muted footnote">统计范围：北京时间 {{ data.range.start }} 至 {{ data.range.end }}</span>
    </div>
  </div>

  <form
    class="toolbar filter-bar"
    @submit.prevent="handleSearch"
  >
    <label>
      学生
      <input
        v-model="student"
        type="search"
        placeholder="输入学生姓名、学号、教师或班级"
      >
    </label>
    <button
      type="button"
      @click="setDatePreset(7)"
    >
      近 7 天
    </button>
    <button
      type="button"
      @click="setDatePreset(30)"
    >
      近 30 天
    </button>
    <label>
      开始
      <input
        v-model="start"
        type="date"
        :max="end"
        required
      >
    </label>
    <label>
      结束
      <input
        v-model="end"
        type="date"
        :min="start"
        :max="today()"
        required
      >
    </label>
    <label>
      模型
      <select v-model="model">
        <option value="">全部模型</option>
        <option value="moonshot-v1-8k">moonshot-v1-8k</option>
        <option value="moonshot-v1-32k">moonshot-v1-32k</option>
        <option value="moonshot-v1-128k">moonshot-v1-128k</option>
        <option value="kimi-k2.6">kimi-k2.6</option>
      </select>
    </label>
    <label>
      状态
      <select v-model="status">
        <option value="">全部状态</option>
        <option value="responded">收到响应</option>
        <option value="failed">失败</option>
        <option value="in_progress">进行中</option>
      </select>
    </label>
    <button
      type="submit"
      class="primary"
    >
      查询
    </button>
    <button
      type="button"
      @click="handleReset"
    >
      重置
    </button>
  </form>

  <div
    v-if="data?.summary"
    class="metric-grid"
  >
    <div class="metric">
      <span>统计范围内报告数</span>
      <strong>{{ data.summary.totalReports.toLocaleString('zh-CN') }}<small>份</small></strong>
      <span class="metric-line" />
    </div>
    <div class="metric">
      <span>模型调用总次数</span>
      <strong>{{ data.summary.totalCalls.toLocaleString('zh-CN') }}<small>次</small></strong>
      <span class="metric-line" />
    </div>
    <div class="metric accent">
      <span>已知总 Token 消耗</span>
      <strong>{{ data.summary.totalTokens.toLocaleString('zh-CN') }}</strong>
      <span class="footnote">
        输入 {{ data.summary.promptTokens.toLocaleString('zh-CN') }} · 输出
        {{ data.summary.completionTokens.toLocaleString('zh-CN') }}
      </span>
    </div>
    <div class="metric">
      <span>用量未知调用次数</span>
      <strong>{{ data.summary.unknownCalls.toLocaleString('zh-CN') }}<small>次</small></strong>
      <span class="metric-line" />
    </div>
  </div>

  <p
    v-if="error"
    role="alert"
    class="error"
  >
    {{ error }}
    <button
      type="button"
      class="text-button"
      @click="load"
    >
      重试
    </button>
  </p>
  <p
    v-if="loading"
    role="status"
    class="muted"
  >
    正在加载 Token 追踪数据…
  </p>

  <section
    v-if="data"
    class="panel"
  >
    <div class="table-scroll">
      <table class="token-table">
        <thead>
          <tr>
            <th class="col-expand" />
            <th>学生</th>
            <th>报告类型与周期</th>
            <th>最近调用时间</th>
            <th>调用次数</th>
            <th>输入 Token</th>
            <th>输出 Token</th>
            <th>已知总 Token</th>
            <th>用量未知</th>
            <th>状态标识</th>
          </tr>
        </thead>
        <tbody>
          <template
            v-for="item in data.items"
            :key="item.reportId"
          >
            <tr :class="{ 'row-expanded': expandedReportId === item.reportId }">
              <td class="col-expand">
                <button
                  type="button"
                  class="expand-btn"
                  :aria-label="expandedReportId === item.reportId ? '收起明细' : '展开明细'"
                  @click="toggleExpand(item)"
                >
                  {{ expandedReportId === item.reportId ? '▾' : '▸' }}
                </button>
              </td>
              <td>
                <strong>{{ item.studentName }}</strong>
                <small
                  class="muted block"
                  :title="item.studentId"
                >{{
                  formatStudentMeta(item)
                }}</small>
              </td>
              <td>{{ formatPeriodText(item) }}</td>
              <td>{{ formatTime(item.latestCalledAt) }}</td>
              <td>
                <span v-if="item.trackingStatus === 'tracked'">{{ item.callsCount }} 次</span>
                <span
                  v-else
                  class="muted"
                >0 次</span>
              </td>
              <td>
                <span v-if="item.promptTokens != null">{{
                  item.promptTokens.toLocaleString('zh-CN')
                }}</span>
                <span
                  v-else-if="item.trackingStatus === 'tracked'"
                  class="muted"
                >未知</span>
                <span
                  v-else
                  class="muted"
                >—</span>
              </td>
              <td>
                <span v-if="item.completionTokens != null">{{
                  item.completionTokens.toLocaleString('zh-CN')
                }}</span>
                <span
                  v-else-if="item.trackingStatus === 'tracked'"
                  class="muted"
                >未知</span>
                <span
                  v-else
                  class="muted"
                >—</span>
              </td>
              <td>
                <strong v-if="item.totalTokens != null">{{
                  item.totalTokens.toLocaleString('zh-CN')
                }}</strong>
                <span
                  v-else-if="item.trackingStatus === 'tracked'"
                  class="muted"
                >未知</span>
                <span
                  v-else
                  class="muted"
                >—</span>
              </td>
              <td>
                <span
                  v-if="item.unknownCallsCount > 0"
                  class="text-warning"
                >{{ item.unknownCallsCount }} 次</span>
                <span
                  v-else-if="item.trackingStatus === 'tracked'"
                  class="muted"
                >0</span>
                <span
                  v-else
                  class="muted"
                >—</span>
              </td>
              <td>
                <span
                  v-if="item.trackingStatus === 'tracked'"
                  class="badge badge-success"
                >已追踪</span>
                <span
                  v-else-if="item.trackingStatus === 'template_no_model'"
                  class="badge badge-neutral"
                >未调用模型</span>
                <span
                  v-else
                  class="badge badge-muted"
                >上线前未追踪</span>
              </td>
            </tr>

            <!-- 展开的调用明细行 -->
            <tr
              v-if="expandedReportId === item.reportId"
              class="expanded-detail-row"
            >
              <td
                colspan="10"
                class="detail-cell"
              >
                <div class="calls-panel">
                  <div class="detail-header">
                    <h4>「{{ item.studentName }}」报告逐次模型调用明细</h4>
                    <span class="muted footnote">{{ formatStudentMeta(item) }} · 统计范围：{{ data.range.start }} 至
                      {{ data.range.end }}</span>
                  </div>

                  <p
                    v-if="item.trackingStatus === 'template_no_model'"
                    class="muted footnote"
                  >
                    该报告为模板生成模式，未向大模型发送请求。
                  </p>
                  <p
                    v-else-if="item.trackingStatus === 'legacy_untracked'"
                    class="muted footnote"
                  >
                    该报告生成于 Token 追踪功能上线前，未采集历史调用记录。
                  </p>
                  <div v-else>
                    <p
                      v-if="expandedCallsLoading"
                      class="muted"
                    >
                      正在加载调用明细…
                    </p>
                    <p
                      v-if="expandedCallsError"
                      class="error"
                    >
                      {{ expandedCallsError }}
                      <button
                        type="button"
                        class="text-button"
                        @click="loadCalls(item.reportId, expandedCallsPage)"
                      >
                        重试
                      </button>
                    </p>

                    <table
                      v-if="!expandedCallsLoading && expandedCalls.length"
                      class="calls-table"
                    >
                      <thead>
                        <tr>
                          <th>调用时间</th>
                          <th>耗时</th>
                          <th>提供方 / 模型</th>
                          <th>输入 Token</th>
                          <th>输出 Token</th>
                          <th>总 Token</th>
                          <th>供应商响应 ID</th>
                          <th>调用结果</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="call in expandedCalls"
                          :key="call.id"
                        >
                          <td>{{ formatTime(call.calledAt) }}</td>
                          <td>{{ formatDuration(call.durationMs) }}</td>
                          <td>
                            <span>{{ call.provider }} / {{ call.model }}</span>
                          </td>
                          <td>
                            <span v-if="call.promptTokens != null">{{
                              call.promptTokens.toLocaleString('zh-CN')
                            }}</span>
                            <span
                              v-else
                              class="muted"
                            >未知</span>
                          </td>
                          <td>
                            <span v-if="call.completionTokens != null">{{
                              call.completionTokens.toLocaleString('zh-CN')
                            }}</span>
                            <span
                              v-else
                              class="muted"
                            >未知</span>
                          </td>
                          <td>
                            <strong v-if="call.totalTokens != null">{{
                              call.totalTokens.toLocaleString('zh-CN')
                            }}</strong>
                            <span
                              v-else
                              class="muted"
                            >未知</span>
                          </td>
                          <td>
                            <code
                              v-if="call.responseId"
                              class="response-id"
                            >{{
                              call.responseId
                            }}</code>
                            <span
                              v-else
                              class="muted"
                            >—</span>
                          </td>
                          <td>
                            <span
                              v-if="call.status === 'responded'"
                              class="badge badge-success"
                            >收到响应</span>
                            <span
                              v-else-if="call.status === 'failed'"
                              class="badge badge-danger"
                            >失败</span>
                            <span
                              v-else
                              class="badge badge-warning"
                            >进行中</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <p
                      v-if="!expandedCallsLoading && !expandedCalls.length && !expandedCallsError"
                      class="empty"
                    >
                      当前筛选条件下暂无调用流水记录。
                    </p>

                    <div
                      v-if="expandedCallsTotal > expandedCallsPageSize"
                      class="sub-pagination"
                    >
                      <PaginationBar
                        :page="expandedCallsPage"
                        :total="expandedCallsTotal"
                        :page-size="expandedCallsPageSize"
                        :loading="expandedCallsLoading"
                        @change="(p) => loadCalls(item.reportId, p)"
                      />
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <p
      v-if="!data.items.length"
      class="empty"
    >
      暂无符合条件的报告 Token 追踪记录
    </p>

    <PaginationBar
      v-if="data.total > pageSize"
      :page="data.page"
      :total="data.total"
      :page-size="pageSize"
      :loading="loading"
      @change="changePage"
    />
  </section>
</template>

<style scoped>
.filter-bar {
  background: white;
  padding: 16px 20px;
  border-radius: 10px;
  border: 1px solid var(--border);
  gap: 14px;
}
.filter-bar input[type='search'] {
  min-width: 180px;
}
.block {
  display: block;
}
.col-expand {
  width: 36px;
  text-align: center;
}
.expand-btn {
  background: none;
  border: none;
  font-size: 1rem;
  padding: 4px 8px;
  color: var(--muted);
  cursor: pointer;
  border-radius: 4px;
}
.expand-btn:hover {
  background: #edf3ff;
  color: var(--blue);
}
.row-expanded {
  background: #f7faff;
}
.expanded-detail-row {
  background: #f9fbfe;
}
.detail-cell {
  padding: 0 !important;
}
.calls-panel {
  padding: 16px 24px 20px 48px;
  border-bottom: 2px solid #e1eaf7;
  background: #fcfdff;
}
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.detail-header h4 {
  margin: 0;
  font-size: 0.95rem;
  color: #273957;
}
.calls-table {
  background: white;
  border: 1px solid #dce6f2;
  border-radius: 6px;
  font-size: 0.8125rem;
}
.calls-table th {
  background: #f3f7fd;
  color: #4b607d;
  font-weight: 600;
  padding: 8px 12px;
}
.calls-table td {
  padding: 8px 12px;
  border-top: 1px solid #edf2f9;
}
.response-id {
  font-size: 0.75rem;
  background: #f1f4f9;
  padding: 2px 6px;
  border-radius: 4px;
  color: #556987;
}
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 550;
  line-height: 1.5;
}
.badge-success {
  background: #e6f8f0;
  color: #0d8a54;
}
.badge-danger {
  background: #fdebee;
  color: #c92a2a;
}
.badge-warning {
  background: #fff8e6;
  color: #b7791f;
}
.badge-neutral {
  background: #edf2f7;
  color: #4a5568;
}
.badge-muted {
  background: #f1f4f9;
  color: #718096;
}
.text-warning {
  color: #b7791f;
  font-weight: 600;
}
.sub-pagination {
  margin-top: 12px;
}
.empty {
  text-align: center;
  padding: 32px;
  color: var(--muted);
}
</style>
