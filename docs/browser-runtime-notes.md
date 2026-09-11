# 浏览器运行时注意事项（明文 HTTP 部署）

本文记录只在**明文 HTTP 的 IP 地址**部署下才暴露的前端问题。本地 `localhost` 开发不会遇到它们，因此很容易在验收时被漏掉。

## 安全上下文（Secure Context）限制

浏览器把 `localhost`、`127.0.0.1` 和 HTTPS 视为**安全上下文**，而 `http://<IP>:<端口>` 属于**不安全上下文**。不少 Web API 只在安全上下文存在：

| API | 本地 localhost | http://<IP> | 本项目是否用到 |
| --- | --- | --- | --- |
| `crypto.randomUUID()` | ✅ | ❌ `undefined` | 曾用到，已改 |
| `crypto.getRandomValues()` | ✅ | ✅ | 兜底方案 |
| `navigator.clipboard` | ✅ | ❌ | 未使用 |
| `crypto.subtle` / `navigator.serviceWorker` | ✅ | ❌ | 未使用 |

实测（Chrome，`isSecureContext`）：

```
http://8.212.153.167:8080/ → isSecureContext:false → typeof crypto.randomUUID === "undefined"
http://localhost:4173/     → isSecureContext:true  → typeof crypto.randomUUID === "function"
```

### 已修复的故障：点「开始创作」完全没有反应

`conversationStore.js` 的 `createConversation()` 第一行就是 `crypto.randomUUID()`。在明文 HTTP 下它会抛 `TypeError: crypto.randomUUID is not a function`；而调用它的入口把异常包在 `try/catch` 里只弹一句提示（甚至没传 `onNotice` 时不提示），于是表现为**界面毫无反应**：不跳转、不报错、输入框内容还在。

排查过程中有个陷阱：本地 `localhost` 是安全上下文，**问题在本地永远复现不出来**。要在本地复现，需用机器 IP 访问开发服务器（`vite` 已监听 `0.0.0.0`）：`http://<本机IP>:4173/`。

### 约定

- 前端**不得直接调用** `crypto.randomUUID`，统一走 `src/randomId.js` 的 `randomId()` / `shortId()`（内部优先用 `randomUUID`，不可用时退回 `getRandomValues`）。
- 该约定由 `tests/platform-runtime.test.mjs` 强制：既断言无安全上下文时仍能生成合法 UUID，也会扫描 `src/**` 阻止直接调用回归（注释不计入）。
- 入口处的错误提示**不要吞掉异常**：`catch` 里保留 `console.error` 并带上原始 message，否则这类故障只会表现成"点了没反应"。

### 长期方案

给站点配 HTTPS（哪怕是自签证书）即可让这些限制整体消失；在上述改动完成前，明文 HTTP 也能正常工作。
