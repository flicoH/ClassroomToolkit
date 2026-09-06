<script setup lang="ts">
/** 首页读取后端聚合结果，不在浏览器拉取全量师生记录进行计数。 */
import { onMounted, ref } from 'vue'
import { api, formatTime, type Meta } from '../lib/api'
const data = ref<(Meta & Record<string, number | string | null>) | null>(null),
  error = ref(''),
  loading = ref(false)
const cards = [
  { key: 'teachers', label: '教师总数', suffix: '位' },
  { key: 'students', label: '学生档案', suffix: '份' },
  { key: 'classrooms', label: '班级总数', suffix: '个' },
  { key: 'registrationsToday', label: '今日注册教师', suffix: '位' },
  { key: 'loginTeachersToday', label: '今日登录教师', suffix: '位' },
  { key: 'activeTeachersToday', label: '今日活跃教师', suffix: '位' },
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
onMounted(load)
</script>
<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">OVERVIEW</p>
      <h1>数据概览</h1>
      <p class="muted">掌握平台规模与今日使用情况。</p>
    </div>
    <button :disabled="loading" @click="load">{{ loading ? '更新中…' : '刷新数据' }}</button>
  </div>
  <p v-if="error" class="error" role="alert">{{ error }}</p>
  <div class="metric-grid">
    <article v-for="(card, i) in cards" :key="card.key" class="metric" :class="{ accent: i === 0 }">
      <span>{{ card.label }}</span
      ><strong
        >{{ data ? Number(data[card.key]).toLocaleString() : '—'
        }}<small>{{ card.suffix }}</small></strong
      ><span class="metric-line"></span>
    </article>
  </div>
  <div class="two-columns">
    <section class="panel">
      <h2>增长与活跃</h2>
      <RouterLink class="action-row" to="/registrations"
        ><span><strong>教师注册趋势</strong><small>查看新增与累计注册、注册明细</small></span
        ><span>↗</span></RouterLink
      ><RouterLink class="action-row" to="/logins"
        ><span><strong>教师登录分析</strong><small>登录人数、次数与最近登录记录</small></span
        ><span>↗</span></RouterLink
      ><RouterLink class="action-row" to="/features"
        ><span><strong>热门功能排行</strong><small>了解教师常用功能及使用变化</small></span
        ><span>↗</span></RouterLink
      >
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
  <p v-if="data" class="muted footnote">更新于 {{ formatTime(data.updatedAt) }}</p>
</template>
