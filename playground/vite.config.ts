import { defineConfig } from "vite"

export default defineConfig({
  server: {
    port: 5173,
    open: true,
  },
  resolve: {
    extensions: [".ts", ".mjs", ".js"],
  },
})
