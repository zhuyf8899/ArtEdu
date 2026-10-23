# 2026-10-23 安全检查与加固

## 已确认与修复

- API 锁定的 Fastify 5.12.5 命中 GHSA-389g-gv7q-r4x8（2026-10-13，低危，header propertyNames 大小写校验绕过）。override 更新为 5.12.6，锁文件同步。未发现业务使用该 schema 条件，属于依赖层预防修复。
- Vite 开发服务器默认绑定从所有网卡改为 127.0.0.1。确需远程调试时显式配置 VITE_DEV_HOST，配合网络访问控制；生产继续使用构建产物和 Nginx。
- Nginx 拒绝隐藏文件路径，防止误部署的 .env/.git 文件公开；保留 .well-known。

## 公告与适用性

- Vite CVE-2026-39364：已报告利用的开发服务器文件读取漏洞；公告范围 7.1.0–7.3.1、8.0.0–8.0.4。项目使用 6.4.4，不在该公告范围，仍收紧开发服务监听。
- React2Shell CVE-2025-55182 以及 RSC 后续公告：项目为客户端 React/Vite，没有 Next.js、react-server-dom-* 或 RSC 插件，不符合受影响条件；React 本身版本号不能单独用于判定。
- multipart/busboy 近期 DoS 公告：实际锁定 @fastify/multipart 10.1.1、@fastify/busboy 3.2.2；本次 npm 审计未报漏洞。

## 验证与边界

前后端 npm audit 均为零已知漏洞。后端安全测试 275 项中 274 项通过，1 项因本机 Chromium 无法启动而未完成。类型检查通过。Nginx 配置尚未在实际容器内验证，线上部署也未执行。本检查不是渗透测试，不能保证未知漏洞不存在。OSS 仍默认关闭。

来源：
- https://github.com/fastify/fastify/security/advisories/GHSA-389g-gv7q-r4x8
- https://www.csa.gov.sg/alerts-and-advisories/alerts/al-2026-124/
- https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components
