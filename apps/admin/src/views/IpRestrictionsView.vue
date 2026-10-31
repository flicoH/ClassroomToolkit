<script setup lang="ts">
import IpRestrictions from '../components/IpRestrictions.vue'
</script>
<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">
        ACCESS
      </p>
      <h1>IP 登录限制</h1>
      <p class="muted">
        管理禁止登录 Web 的 IP 地址。
      </p>
    </div>
  </div>
  <IpRestrictions />
</template>
