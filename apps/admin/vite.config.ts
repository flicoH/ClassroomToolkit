/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-18 16:21:45
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-18 21:40:15
 */
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    // 管理平台固定使用 8080，端口占用时直接报错，避免静默切换访问地址。
    port: 8080,
    strictPort: true,
    hmr: true,
    proxy: {
      '/admin': { target: process.env.BACKEND_URL || 'http://127.0.0.1:3000', changeOrigin: true },
    },
    open: false,
  },
})
