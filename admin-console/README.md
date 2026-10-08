# ArtEdu 学生门户与管理后台

React 19 + Vite 前端，包含课程学习、我的学习、AI 创作、工作流、案例社区、统一搜索和管理后台。正式入口使用后端会话与业务 API；后端不可用时不能依赖内置演示数据完成登录或业务写入。

## 快速运行

使用 Node.js 22 与 npm 10+，复制 `.env.example` 为 `.env.local`，执行 `npm ci` 和 `npm run dev`。默认地址为 http://localhost:4173，`/api` 代理到 http://localhost:4000；建议按根 README 启动整套工程。

## 阅读入口

- `src/main.jsx`、`App.jsx`：入口、会话恢复和角色分流。
- `src/routing.js`、`Portal.jsx`：路由与学生门户。
- `src/AdminDashboard.jsx`：后台总览、用户、额度与审核。
- `src/services/adminApi.js`、`uploadFile.js`：API 调用与上传。
- `src/conversationStore.js`：按账号隔离的浏览器 IndexedDB 对话存储。
- `src/styles.css`：全局样式；复杂页面另有专用 CSS。
- `tests/`：Worker、创作和平台回归测试。
- `worker/`：静态站点 Worker。

## 构建与验证

执行 `npm run build`、`npm run test:sites`、`npm run test:chat`、`npm run test:platform`。构建脚本生成 `dist/client` 与 Sites Worker 文件。完整检查使用根目录 `npm run check`。

`VITE_API_BASE_URL` 默认 `/api`；`VITE_API_PROXY_TARGET` 默认 `http://localhost:4000`。供应商密钥只配置在服务端或本地 Bridge，不放入前端环境变量。

本地账号登录、服务端权限校验、审计、数据库持久化与受控文件访问已接入。学校 SSO 与对象存储直传仍待接入；接口以 `apps/api/src/modules` 和 [API 契约索引](../docs/api-contracts.md) 为准。[INTEGRATION.md](INTEGRATION.md) 保留管理端字段对照。