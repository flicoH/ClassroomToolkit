<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { ref } from 'vue'
import { api, profile } from './lib/api'
const route = useRoute(),
  router = useRouter(),
  error = ref('')
const links = [
  { path: '/', label: '数据概览', icon: '◫' },
  { path: '/registrations', label: '注册分析', icon: '↗' },
  { path: '/logins', label: '登录分析', icon: '↪' },
  { path: '/features', label: '功能分析', icon: '▥' },
  { path: '/teachers', label: '教师管理', icon: '人' },
  { path: '/students', label: '学生档案', icon: '册' },
  { path: '/classrooms', label: '班级管理', icon: '班' },
]
async function logout() {
  try {
    await api('auth/logout', {}, {})
    profile.value = null
    await router.push('/login')
  } catch (e) {
    error.value = (e as Error).message
  }
}
</script>
<template>
  <RouterView v-if="route.path === '/login'" />
  <div v-else class="shell">
    <aside class="sidebar">
      <RouterLink to="/" class="brand"
        ><span class="brand-mark">课</span
        ><span>课堂小组件<small>管理后台</small></span></RouterLink
      >
      <p class="nav-label">平台管理</p>
      <nav aria-label="主导航">
        <RouterLink
          v-for="link in links"
          :key="link.path"
          :to="link.path"
          :class="{
            selected: link.path === '/' ? route.path === '/' : route.path.startsWith(link.path),
          }"
          ><span aria-hidden="true">{{ link.icon }}</span
          >{{ link.label }}</RouterLink
        >
      </nav>
      <div class="sidebar-bottom"><span class="status-dot"></span>教师与课堂，一目了然</div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <span
          >工作台 <span class="muted">/ {{ route.meta.title }}</span></span
        >
        <div class="account">
          <span class="avatar">管</span><span>{{ profile?.username }}</span
          ><button class="text-button" @click="logout">退出登录</button>
        </div>
      </header>
      <main>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
        <RouterView :key="route.path" />
      </main>
    </div>
  </div>
</template>
