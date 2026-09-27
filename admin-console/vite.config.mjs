import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    build: {
      outDir: "dist/client",
      rollupOptions: {
        output: {
          /**
           * 把框架与 Markdown 渲染拆成独立 chunk。
           *
           * 之前所有依赖都并进入口 chunk（533 kB），既超过 Vite 的 500 kB 告警线，
           * 又让首屏解析时间全压在同一段脚本上。拆开之后入口只留业务代码，
           * 依赖部分可以并行下载；更重要的是：依赖没变时它们的文件名哈希不变，
           * 重新部署前端后浏览器能继续用缓存，不用整包重下。
           */
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "vendor-react";
            if (/[\\/]node_modules[\\/](react-markdown|remark-|micromark|mdast-|hast-|unist-|vfile|unified|devlop|zwitch|ccount|bail|trough|trim-lines|markdown-table|longest-streak|escape-string-regexp|extend|property-information|space-separated-tokens|comma-separated-tokens|web-namespaces|decode-named-character-reference|character-entities|html-url-attributes|style-to-js|style-to-object|inline-style-parser)/.test(id)) return "vendor-markdown";
            return undefined;
          },
        },
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom/client"],
    },
    server: {
      host: "0.0.0.0",
      port: 4173,
      strictPort: true,
      allowedHosts: ["terminal.local"],
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY_TARGET || "http://localhost:4000",
          changeOrigin: true,
        },
      },
      warmup: {
        clientFiles: ["./src/main.jsx"],
      },
    },
    plugins: [react()],
  };
});
