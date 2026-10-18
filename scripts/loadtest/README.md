# 本地隔离接口压测

默认目标固定为 `http://127.0.0.1:18200`，专用数据库为 `artedu_loadtest`，不会复用开发数据库。生成的账号凭据、日志、资源快照和结果只进入忽略目录 `local-artifacts/loadtest/`。测试模型及RAG明确关闭，不测付费模型/GPU容量。

## 当前可运行方式：编译版原生API＋Docker PostgreSQL

1. 启动Docker，执行 `docker compose -f scripts/loadtest/compose.yml up -d postgres`。
2. 在PowerShell设置 `DATABASE_URL=postgresql://loadtest:loadtest_local_only@127.0.0.1:55432/artedu_loadtest`，再执行根目录 `npm run db:migrate`、`npm run db:seed` 和 `node scripts/loadtest/fixtures.mjs`。只初始化专用数据库。
3. 执行 `npm --prefix apps/api run build`，再执行 `node scripts/loadtest/start-native.mjs`。启动器采用独立cwd和环境变量白名单，不读取原项目.env和模型凭据。记下API子进程PID。
4. 用便携k6执行 `run -e SMOKE=1 scripts/loadtest/browse.k6.js`，先验证3次迭代。
5. 设置 `LOADTEST_API_PID` 为专用API PID，执行 `node scripts/loadtest/run.mjs`，启动阶梯压测及资源监控。

标准测试用150个独立学生账号、各自真实Cookie，会校验学习空间返回的账号ID。操作为课程列表/详情、案例列表、搜索、个人学习空间，每轮停顿约3–8秒；约10%迭代写入一条测试笔记。档位10/30/50/100/150，100及150各保持90秒，合计约6分20秒，登录setup另计。短时初筛不等于30–60分钟持续稳定验证。

按300人运行：先设置 `LOADTEST_USERS=300` 执行fixtures，再设置 `TARGET_VUS=300` 执行run。300人档为30秒升至300、保持180秒、20秒降压。fixtures会创建总计15门课程、14个案例的合成元数据，没有真实媒体资源，不要把本轮视为完整页面/带宽压测。150人档被用户中途切换时，原有日志可留在 `partial-150/`，不能作为完整通过结果。

独立preload仅在test模式、明确标记和指定数据库下生效：将每来源IP的限额设为读60000/分、写12000/分，认证和角色校验保持。原生产限流模块没有改动；原限流能力应单独测试，不能从本轮高限额推断网关能承载共享出口IP的人群。

停止条件：业务错误率超1%、HTTP错误超2%、P99超过5秒（延迟30秒启用），或连续3次健康检查失败、宿主可用内存低于1GiB。P95小于1秒作为验收阈值，未达到会报告失败。监控不能捕获所有亚秒级峰值，最终还要检查OOM/restart及数据库状态。

`summary.json` 为k6汇总，`resources.jsonl`为API/压测进程与数据库资源快照，`environment.json`记录环境，`exit.json`记录退出状态，`load.log`记录过程。以上不记录Cookie内容。

## 可选容器化运行

`prepare-build.mjs`准备最小生产构建上下文，`compose.yml`可构建API和Nginx。2026-10-18本机拉取Docker Hub Node镜像失败，因此首轮退回原生API，没有经过Nginx，也不使用Vite开发服务器。该最小API镜像不含Chromium、OCR与PDF转换工具，不用于验证文档/媒体生成的资源需求。容器网络不对外发布业务服务，只有loopback端口；运行环境中不注入真实密钥。

停止专用服务可用Ctrl+C结束原生API，或 `docker compose -f scripts/loadtest/compose.yml stop`。不要对原项目执行down或删除卷；专用测试数据保留供复查，不自动清理真实资料。

## 扩展升压与Linux限额对比（2026-10-18）

`TARGET_VUS`支持150/300/500/800/1000/1500/2000；除150阶梯外均为30秒升压、默认180秒保持、20秒降压。`HOLD_SECONDS`可设60、90、180，登录setup另计。fixtures支持最多2000个隔离账号。`LOADTEST_API_CONTAINER=artedu-loadtest-api-1`时监控容器CPU/内存，不再要求原生API PID；`LOADTEST_PROFILE`写入元数据。`summarize.mjs`汇总`runs/`中已归档的每轮结果；每次运行前需归档根目录结果，避免覆盖。

本轮Linux测试因Docker Hub拉取失败，以缓存的`pgvector/pgvector:pg16`作为运行时底座，放入官方Node22.23.3 Linux x64（SHA256 `df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de`）、API编译产物及生产依赖；额外补齐启动引用的adm-zip。仅作API容量测试，不替代项目正式部署镜像。

限额API/数据库各分配一半CPU：2核档各1核，4核档各2核，8核档各4核。内存分别各1GiB、3GiB、7GiB，合计2/6/14GiB，其余约2GiB作为4/8/16GiB服务器系统及其他服务预算。容器限制不等于真实云主机：没有虚拟CPU型号、共享宿主争抢、公网、Nginx或OS硬限额；数据库与API不能互借各自CPU配额，内存预算也未实际跑满。禁止据此线性外推实例容量。单Node进程不能自动利用全部分配CPU。

每轮复用同一独立演示库并写入少量笔记，缓存和笔记数量会变化；这不是严格控制数据规模的机型基准测试。相同脚本含3–8秒思考停顿，不能将虚拟用户数解释为同时在途HTTP数或同时模型生成数。300人前次原生测试保持180秒；后续800/1000/1500及容器对比保持90秒，属于初筛。

已缓存镜像的离线构建备选：将官方校验后的Linux Node归档保存到构建上下文`node.tar.xz`，在该上下文执行`npm ci --omit=dev --ignore-scripts`，并复制本地`apps/api/node_modules/adm-zip`到上下文依赖目录；再使用`scripts/loadtest/Dockerfile.cached`构建镜像。该文件只依赖已缓存pgvector镜像，不拉取Node镜像。启动API时使用compose的同一隔离网络与专用数据库、只发布127.0.0.1:18200，挂载preload并显式禁用RAG/模型。测试完成可停止`artedu-loadtest-api-1`和`artedu-loadtest-postgres-1`；保留专用卷与证据。
