import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    target: "es2022",
    // three 덩어리(527KB, 지연 로딩)는 알고 있는 크기라 경고를 600KB로 올린다.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // three.js를 별도 청크로 분리한다. 앱 코드가 바뀌어도 3D 덩어리는 캐시된다.
        manualChunks: {
          three: ["three"]
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
