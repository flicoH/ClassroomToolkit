import { createRouter, createWebHistory } from 'vue-router'
import { api, profile } from '../lib/api'
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      component: () => import('../views/LoginView.vue'),
      meta: { title: '管理员登录' },
    },
    { path: '/', component: () => import('../views/HomeView.vue'), meta: { title: '数据概览' } },
    {
      path: '/registrations',
      component: () => import('../views/AnalyticsView.vue'),
      meta: { title: '注册分析' },
    },
    {
      path: '/logins',
      component: () => import('../views/AnalyticsView.vue'),
      meta: { title: '登录分析' },
    },
    {
      path: '/features',
      component: () => import('../views/FeaturesView.vue'),
      meta: { title: '功能分析' },
    },
    {
      path: '/teachers',
      component: () => import('../views/DirectoryView.vue'),
      meta: { title: '教师管理' },
    },
    {
      path: '/teachers/:id',
      component: () => import('../views/TeacherView.vue'),
      meta: { title: '教师详情' },
    },
    {
      path: '/students',
      component: () => import('../views/DirectoryView.vue'),
      meta: { title: '学生档案' },
    },
    {
      path: '/classrooms',
      component: () => import('../views/DirectoryView.vue'),
      meta: { title: '班级管理' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
/** 首次进入受保护页面时验证服务端会话；前端路由校验仅改善体验，权限仍由后端控制。 */
router.beforeEach(async (to) => {
  document.title = `${String(to.meta.title)} · 课堂小组件管理后台`
  if (to.path === '/login') return true
  if (!profile.value) {
    try {
      profile.value = await api('auth/me')
    } catch {
      return { path: '/login', query: { redirect: to.fullPath } }
    }
  }
})
window.addEventListener('admin-session-expired', () => {
  if (router.currentRoute.value.path !== '/login') void router.replace('/login')
})
export default router
