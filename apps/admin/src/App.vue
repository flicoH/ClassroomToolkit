<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { ref } from 'vue'
import { api, profile } from './lib/api'
const route = useRoute(),
  router = useRouter(),
  error = ref('')
const groups = [
  {
    label: '平台分析',
    links: [
      {
        path: '/',
        label: '数据概览',
        icon: 'M3 3h7v8H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 15h7v6H3z',
      },
      { path: '/registrations', label: '注册分析', icon: 'M3 19h18 M4 15l6-6 4 3 6-8' },
      { path: '/logins', label: '登录分析', icon: 'M14 3h6v18h-6 M3 12h12 M10 7l5 5-5 5' },
      { path: '/features', label: '功能分析', icon: 'M4 20h16 M6 16v-5 M12 16V4 M18 16V8' },
    ],
  },
  {
    label: '目录与反馈',
    links: [
      {
        path: '/teachers',
        label: '教师管理',
        icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
      },
      {
        path: '/students',
        label: '学生档案',
        icon: 'M3 4q5-2 9 1 4-3 9-1v15q-5-2-9 1-4-3-9-1z M12 5v15',
      },
      { path: '/classrooms', label: '班级管理', icon: 'M3 4h18v13H3z M12 17v4 M7 21h10' },
      { path: '/feedback', label: '意见反馈', icon: 'M3 4h18v13H9l-6 4z M7 9h10 M7 13h6' },
    ],
  },
  {
    label: '服务与安全',
    links: [
      {
        path: '/report-ai-settings',
        label: 'AI 报告配置',
        icon: 'M4 7h7m4 0h5 M4 17h2m4 0h10 M11 4v6 M7 14v6',
      },
      {
        path: '/report-token-usage',
        label: 'Token 追踪',
        icon: 'M4 3h16v18H4z M8 8h8 M8 12h8 M8 16h5',
      },
      {
        path: '/ip-restrictions',
        label: 'IP 登录限制',
        icon: 'M12 2l8 4v6c0 5-5 8-8 10-3-2-8-5-8-10V6z',
      },
    ],
  },
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
  <div
    v-else
    class="shell"
  >
    <aside class="sidebar">
      <RouterLink
        to="/"
        class="brand"
      >
        <span class="brand-mark">课</span><span>课堂小组件<small>管理后台</small></span>
      </RouterLink>
      <nav aria-label="主导航">
        <div
          v-for="group in groups"
          :key="group.label"
          class="nav-group"
        >
          <p class="nav-label">
            {{ group.label }}
          </p>
          <RouterLink
            v-for="link in group.links"
            :key="link.path"
            :to="link.path"
            :class="{
              selected: link.path === '/' ? route.path === '/' : route.path.startsWith(link.path),
            }"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
            ><path :d="link.icon" /></svg>{{ link.label }}
          </RouterLink>
        </div>
      </nav>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <span>工作台 <span class="muted">/ {{ route.meta.title }}</span></span>
        <div class="account">
          <span class="avatar">管</span><span>{{ profile?.username }}</span><button
            class="text-button"
            @click="logout"
          >
            退出登录
          </button>
        </div>
      </header>
      <main>
        <p
          v-if="error"
          role="alert"
          class="error"
        >
          {{ error }}
        </p>
        <RouterView :key="route.path" />
      </main>
    </div>
  </div>
</template>
