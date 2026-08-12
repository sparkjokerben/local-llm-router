import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/crates/**", "**/src-tauri/**"] },
  },
  build: {
    outDir: "dist",
    target: "es2021",
  },
});
