<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../lib/api'
const blockedIps = ref<{ ip: string }[]>([])
const ipInput = ref('')
const ipError = ref('')
const ipBusy = ref(false)
async function loadIps() {
  try {
    blockedIps.value = await api<{ ip: string }[]>('login-ip-blocks')
  } catch (e) {
    ipError.value = (e as Error).message
  }
}
async function updateIp(ip: string, remove = false) {
  ipBusy.value = true
  ipError.value = ''
  try {
    await api(`login-ip-blocks${remove ? '/remove' : ''}`, {}, { ip })
    if (!remove) ipInput.value = ''
    await loadIps()
  } catch (e) {
    ipError.value = (e as Error).message
  } finally {
    ipBusy.value = false
  }
}
onMounted(loadIps)
</script>
<template>
  <section class="panel">
    <h2>IP 登录限制</h2>
    <p class="muted">
      封禁后，该 IP 无法登录 Web 或注册并自动登录。管理员可正常登录。删除后立即解封。
    </p>
    <form
      class="toolbar"
      @submit.prevent="updateIp(ipInput)"
    >
      <label>IP 地址<input
        v-model="ipInput"
        required
        maxlength="45"
        placeholder="IPv4 或 IPv6"
      ></label>
      <button :disabled="ipBusy">
        添加封禁
      </button>
    </form>
    <p
      v-if="ipError"
      class="error"
      role="alert"
    >
      {{ ipError }}
    </p>
    <ul>
      <li
        v-for="item in blockedIps"
        :key="item.ip"
      >
        {{ item.ip }}
        <button
          :disabled="ipBusy"
          @click="updateIp(item.ip, true)"
        >
          删除并解封
        </button>
      </li>
    </ul>
    <p
      v-if="!blockedIps.length"
      class="muted"
    >
      暂无封禁 IP
    </p>
  </section>
</template>
