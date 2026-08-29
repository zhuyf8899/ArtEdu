# ArtEdu 管理后台

这是一个可独立运行的 React 管理后台前端，覆盖 ArtEdu 第一阶段的三个管理场景：平台总览、用户/API 额度管理、作品上传审核。

> 当前交付范围：管理后台 UI、交互与后端接口契约。登录鉴权、RBAC、数据库持久化和真实 AI 调用由主项目后端负责，不能将演示数据视为生产数据。

## 快速运行

需要 Node.js 20+ 与 npm 10+。

```bash
cp .env.example .env.local
npm ci
npm run dev
```

浏览器打开 `http://localhost:4173`。默认把 `/api` 代理到 `http://localhost:4000`；后端未启动时仍会显示内置演示数据，写操作会明确提示请求失败。

## 验证与生产构建

```bash
npm run build
npm run test:sites
npm run preview
```

生产文件位于 `dist/client`。`npm run build` 同时生成 Cloudflare Pages/Sites 所需的 Worker 文件。

## 目录标注

```text
src/AdminDashboard.jsx       页面与交互状态；内置数据仅用于离线预览
src/services/adminApi.js     唯一的后端接口适配层
src/styles.css               响应式视觉样式
worker/index.js              静态站点 Worker
tests/                       Worker 路由测试
INTEGRATION.md               后端对接接口、字段与上线清单
```

## 环境变量

| 变量 | 默认值 | 用途 |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | 浏览器请求的 API 前缀或完整地址 |
| `VITE_API_PROXY_TARGET` | `http://localhost:4000` | 本地开发代理目标 |

## 当前功能状态

- 已完成：管理总览、用户筛选、单用户日/月/并发额度修改、用户启停、审核通过/驳回、桌面与移动端适配。
- 待后端接入：管理员登录、权限校验、审计日志、分页、批量额度、作品文件预览、数据库持久化。
- 安全要求：后端必须再次验证管理员身份和请求参数；不能依赖前端按钮隐藏实现权限控制。

具体请求与响应字段见 [INTEGRATION.md](./INTEGRATION.md)。
