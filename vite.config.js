import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  // 注意：如果部署到 https://<USERNAME>.github.io/<REPO>/，请取消注释并设置 base 为 '/<REPO>/'
  base: './',
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  }
})
