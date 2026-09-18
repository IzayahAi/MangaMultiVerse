import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev split: the app runs on Vite (:5173) and the /api/* serverless functions run under
// `vercel dev` (:3000). This proxy forwards /api calls from the Vite server to the functions server,
// so you can develop on http://localhost:5173 and still hit the real proxies. (On the deployed Vercel
// site both are same-origin, so no proxy is needed there.)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
