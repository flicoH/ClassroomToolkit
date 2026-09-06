<script setup lang="ts">
import { ref } from 'vue'
import { today, daysAgo } from '../lib/api'
const emit = defineEmits<{ change: [range: { start: string; end: string }] }>()
const start = ref(daysAgo(29)),
  end = ref(today()),
  error = ref('')
/** 自定义范围校验通过后才通知页面查询；后端仍会再次校验日期与跨度。 */
function submit() {
  error.value = ''
  if (
    !start.value ||
    !end.value ||
    start.value > end.value ||
    end.value > today() ||
    (Date.parse(end.value) - Date.parse(start.value)) / 86400000 >= 366
  ) {
    error.value = '请选择有效日期，范围不超过 366 天'
    return
  }
  emit('change', { start: start.value, end: end.value })
}
function preset(days: number) {
  start.value = daysAgo(days - 1)
  end.value = today()
  submit()
}
</script>
<template>
  <form class="toolbar" @submit.prevent="submit">
    <button type="button" @click="preset(7)">近 7 天</button
    ><button type="button" @click="preset(30)">近 30 天</button
    ><label>开始<input v-model="start" type="date" :max="end" required /></label
    ><label>结束<input v-model="end" type="date" :min="start" :max="today()" required /></label
    ><button class="primary">查询</button><span class="muted footnote">北京时间</span
    ><span v-if="error" role="alert" class="error">{{ error }}</span>
  </form>
</template>
