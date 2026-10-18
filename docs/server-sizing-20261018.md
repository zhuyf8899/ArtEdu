# 服务器规格初步评估（2026-10-18）

结论：以外部大模型/图片API、GPU Worker独立运行、门户本机保留PostgreSQL和轻量embedding为前提，建议4 vCPU / 8GB RAM / 100GB SSD，公网带宽先按10Mbps估算。低预算小规模演示可从2 vCPU / 4GB / 80GB SSD开始。两者均是采购起点，不是压测后的并发保证。

## 当前Ubuntu服务器实测

只读SSH采集，无配置变更、清理或部署。Ubuntu 24.04.4 LTS、内核6.8、2个vCPU，来宾CPU型号Intel Xeon Platinum；不能据此确认云厂商售卖实例型号或独享CPU性能。

- 物理内存1612MiB，available两次采样748–755MiB；swap共2047MiB，已用136MiB。5秒vmstat采样无持续换入换出，不能将已用swap解释成当前内存抖动。
- 根盘40G，已用32G/85%，可用5.8G，是当前最明显的容量余量问题。
- 负载均值约0.38/0.22/0.13；vmstat主要空闲75%–99%。不是高并发负载样本。
- 当前7个容器含主站API/web、预览站API/web、PostgreSQL、embedding和rag-worker，合计docker stats内存约483–496MiB。该值不等于整机内存需求或峰值。
- 主站API约57MiB、Postgres55MiB、embedding227MiB、rag-worker78MiB、预览API63–77MiB，Nginx实例约1MiB。
- 容器本轮运行以来restart=0、OOMKilled=false，启动时间2026-10-16；不证明更早没有OOM，也不代表高负载稳定。
- Docker镜像9.701GB、构建缓存4.008GB、卷3.101GB；不同统计可能共享层，不应简单累加为独立占用。
- readiness返回ok；服务器checkout为7eefcac，早于本地最新合并与执行记录改动，不能当作最新代码容量验收。

## 分档建议

| 场景 | CPU/内存 | SSD | 适用边界 |
| --- | --- | --- | --- |
| 当前参照机 | 2 vCPU / 实测1.575GiB | 40GB | 已能在低负载下运行，空间和发布余量小 |
| 预算演示起点 | 2 vCPU / 4GB | 80GB起 | 以目录浏览和外部模型调用为主，减少并行索引，优先在其他机器构建镜像 |
| 推荐正式试运行起点 | 4 vCPU / 8GB | 100GB起 | API、数据库、本地embedding及索引Worker同机，给索引、文档生成和发布留余量 |
| 较多索引/文档任务或主预览环境长期并行 | 8 vCPU / 16GB，或拆分Worker | 150GB起 | 须有实际峰值依据再升级；不代表本地运行大语言模型或GPU生成 |

带宽：10Mbps理论上限约1.25MB/s，多人同时下载图片/PDF或看视频会共享；若视频与大文件持续由门户直出，应提高带宽或将媒体移到对象存储/CDN。实例规格里的“内网Gbps”不是购买的公网带宽。

GPU：门户无需GPU的前提是推理交给外部供应商或独立GPU Worker；如果要求本机部署大模型或ComfyUI，本表不适用，需要按模型显存和生成并发另外选型。

## 型号参考与后续验证

腾讯云标准型SA5.LARGE8为4 vCPU/8GB的官方规格例子，地域库存/套餐需在购买时确认：https://cloud.tencent.com/document/product/213/101709 。可选同等规格标准型；若追求持续性能，关注CPU是否共享/积分突发，不能只对比核数。突发型积分机制参考：https://www.alibabacloud.com/help/en/ecs/user-guide/burst-performance-instance-overview 。本报告未比较价格或生成账单估价。

后续先对最新代码做受控压测，区分目录请求并发、同时生成数、RAG检索与批量索引；记录P95、错误率、RSS峰值、数据库连接、swap/OOM和磁盘增长。日活200–300不能直接换算并发；运行态与构建发布峰值也须分别测量。


## 后续实测更新

已完成300→500→800→1000→1500人升压，以及2核4GB、4核8GB、8核16GB预算档的容器限额初筛。详见[完整数据与边界](loadtest-sizing-20261018.md)。4核档1000人90秒保持段P95约159ms，8核档约230ms，均无错误；本轮没有证明8核能提升该浏览负载性能。2核档300人约11ms通过、1000人约2.4秒未通过。该结果不含公网、媒体、RAG或模型，10Mbps公网预算需重新验证，不能据此承诺长期容量。
