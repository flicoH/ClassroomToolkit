<script setup lang="ts">
/** 分页组件只负责展示和发出页码变化，数据查询与加载状态由页面维护。 */
defineProps<{ page: number; total: number; pageSize?: number; loading?: boolean }>()
const emit = defineEmits<{ change: [page: number] }>()
</script>
<template>
  <div class="pagination">
    <span
      >共 {{ total }} 条 · 第 {{ page }} /
      {{ Math.max(1, Math.ceil(total / (pageSize || 20))) }} 页</span
    ><button :disabled="page <= 1 || loading" @click="emit('change', page - 1)">上一页</button
    ><button
      :disabled="page * (pageSize || 20) >= total || loading"
      @click="emit('change', page + 1)"
    >
      下一页
    </button>
  </div>
</template>
