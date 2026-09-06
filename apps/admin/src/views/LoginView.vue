<script setup lang="ts">
/** 登录成功仅保留展示资料；实际管理凭据由后端通过 Cookie 设置。 */
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, profile } from '../lib/api'
const username = ref(''),
  password = ref(''),
  error = ref(''),
  busy = ref(false)
const router = useRouter(),
  route = useRoute()
async function submit() {
  busy.value = true
  error.value = ''
  try {
    profile.value = await api(
      'auth/login',
      {},
      { username: username.value, password: password.value },
    )
    password.value = ''
    const target = String(route.query.redirect || '/')
    await router.replace(target.startsWith('/') && !target.startsWith('//') ? target : '/')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <div class="login-page">
    <section class="login-intro">
      <div class="brand"><span class="brand-mark">课</span><span>课堂小组件</span></div>
      <div>
        <p class="eyebrow">CLASSROOM TOOLKIT</p>
        <h1>看见每一间课堂<br />的成长。</h1>
        <p>教师、学生与功能使用数据，尽在管理工作台。</p>
      </div>
      <small>课堂小组件 · 平台管理</small>
    </section>
    <section class="login-form">
      <form @submit.prevent="submit">
        <span class="pill">管理员入口</span>
        <h2>登录管理后台</h2>
        <p class="muted">使用管理员账号访问平台数据。</p>
        <label
          >账号<input
            v-model="username"
            autocomplete="username"
            required
            maxlength="64"
            placeholder="请输入管理员账号" /></label
        ><label
          >密码<input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            maxlength="256"
            placeholder="请输入密码"
        /></label>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
        <button class="primary" :disabled="busy">{{ busy ? '正在登录…' : '登录工作台 →' }}</button>
        <p class="muted footnote">教师账号请使用教师端登录。</p>
      </form>
    </section>
  </div>
</template>
