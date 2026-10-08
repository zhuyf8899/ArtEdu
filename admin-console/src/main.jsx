/**
 * 【前端入口】找到 index.html 中 id="root" 的容器，把 App 组件显示进去，并加载全局样式。接下来读 App.jsx，了解登录检查与页面分流。
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

// createRoot 连接网页容器，render 把组件显示进去；<App /> 表示使用 App 组件。
// StrictMode 在开发环境辅助发现问题，可能重复执行 Effect 的检查周期。
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
