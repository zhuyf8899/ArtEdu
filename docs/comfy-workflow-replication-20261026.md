# ComfyUI 12 个官方工作流复刻与验收报告

日期：2026-10-26。

**交付：12 份原始文件的字节级副本、12 份平台导入包、12 条平台草稿、6 张原始输入素材、12 张页面截图，以及逐节点分析和依赖清单。**

固定来源：[官方模板仓库](https://github.com/Comfy-Org/workflow_templates/tree/67984637eefcd4825dcf5c134e39034785be1682)，保留 MIT 许可证。阅读了官方图生图、局部重绘、LoRA、两阶段放大、ControlNet、SDXL、超分和区域组合等说明，逐个检查实际 JSON。

## 可打开的复刻

| 案例 | 节点 / 连线 | 平台草稿 | 截图 |
| --- | ---: | --- | --- |
| 基础文生图 | 11 / 9 | [打开](http://localhost:4173/admin/workflows?edit=workflow-97725816-50a8-4b80-b55c-acf1150d0e82) | [查看](/D:/ArtEdu/outputs/comfy-replication-20261026/01-text-to-image.png) |
| 图生图 | 12 / 12 | [打开](http://localhost:4173/admin/workflows?edit=workflow-42c783ac-c9d7-4c31-9633-4ae9a9212502) | [查看](/D:/ArtEdu/outputs/comfy-replication-20261026/02-image-to-image.png) |
| 局部重绘 | 12 / 13 | [打开](http://localhost:4173/admin/workflows?edit=workflow-2e8f38a4-5dd2-45ea-b8f4-63cb04b40205) | [查看](/D:/ArtEdu/outputs/comfy-replication-20261026/03-inpainting.png) |
| 向外扩图 | 13 / 14 | [打开](http://localhost:4173/admin/workflows?edit=workflow-54860fc7-b05b-48fc-b963-582f5408041f) | [查看](/D:/ArtEdu/outputs/comfy-replication-20261026/04-outpainting.png) |
| 单 LoRA（保留旁路层） | 10 / 13 | [打开](http://localhost:4173/admin/workflows?edit=workflow-37410d81-116b-4ebf-bb89-859098568e18) | [查看](/D:/ArtEdu/outputs/comfy-replication-20261026/05-lora.png) |
| 多 LoRA 串联 | 10 / 13 | [打开](http://localhost:4173/admin/workflows?edit=workflow-d33a1078-3423-4f88-8dc4-3a578affed27) | [查看](/D:/ArtEdu/outputs/comfy-replication-20261026/06-multiple-loras.png) |
| 潜空间二次采样放大 | 12 / 17 | [打开](http://localhost:4173/admin/workflows?edit=workflow-156df11d-a867-4e23-b6e3-3a77aa0c759a) | [查看](/D:/ArtEdu/outputs/comfy-replication-20261026/07-hires-latent.png) |
| ESRGAN 二次采样放大 | 16 / 23 | [打开](http://localhost:4173/admin/workflows?edit=workflow-d0f2088f-48fd-44cb-a4a5-c978103eba24) | [查看](/D:/ArtEdu/outputs/comfy-replication-20261026/08-hires-esrgan.png) |
| ControlNet 控制 | 15 / 15 | [打开](http://localhost:4173/admin/workflows?edit=workflow-15bd8226-0094-470d-bc1b-1033faf5c393) | [查看](/D:/ArtEdu/outputs/comfy-replication-20261026/09-controlnet.png) |
| 多 ControlNet 混合 | 15 / 17 | [打开](http://localhost:4173/admin/workflows?edit=workflow-a983a623-0923-4ec5-8498-0b48053f946e) | [查看](/D:/ArtEdu/outputs/comfy-replication-20261026/10-mixed-controlnets.png) |
| 模型超分 | 11 / 12 | [打开](http://localhost:4173/admin/workflows?edit=workflow-e5903008-938c-4f6e-bf37-8905c72c5af8) | [查看](/D:/ArtEdu/outputs/comfy-replication-20261026/11-esrgan.png) |
| SDXL Base 与 Refiner | 20 / 19 | [打开](http://localhost:4173/admin/workflows?edit=workflow-be93ab36-5917-42d4-92df-045287abd392) | [查看](/D:/ArtEdu/outputs/comfy-replication-20261026/12-sdxl-refiner.png) |

## 一致性证据

- 原始副本：12/12 SHA-256 与下载的上游文件一致。
- 结构与保存：12/12 本地往返、12/12 服务端保存后往返、12/12 页面下载导出，全部字段深度比较一致。
- 页面：核对 157 个节点、177 条连线、285 项原始参数、55 个分组；实际渲染原始位置、折叠和旁路状态。CSS 坐标显示允许浏览器浮点序列化误差 0.02 个画布单位；导出文件中的原始坐标数值严格相等。
- 浏览器运行错误 0；检查期间模型提交请求 0。
- 前端平台回归 170/170 通过；生产构建通过；既有 ComfyUI 导入导出和 Worker 状态模拟回归通过。

## 为准确复刻补齐的画布能力

- 未修改的 UI 图导出直接保留原始全部字段，避免自动注入标题、默认尺寸、计数或视角。
- 保留原始控件基准，断开 Worker 时也能查看并按原顺序编辑控件，不猜测未知控件名称或插件语义。
- 按原图节点尺寸和分组边界显示；保留折叠与旁路外观。
- 自动适配视图不再写回原图视角，避免仅打开文件就改变导出数据。

## 发现的源图细节

- `lora.json` 含两层 LoRA，但第二层模式为 4（旁路），实际只启用第一层；按原图保留。`lora_multiple.json` 的两层都启用，权重为 0.9 / 1。
- 两个 Hires Fix 图使用不同的潜空间/像素空间路径；原图中的 3 个折叠 VAE 节点均保留。
- SDXL 案例含前端 PrimitiveNode 和说明节点，保留原始 UI 语义；未伪造为可直接提交的 API 图。

## 执行边界

- 本次完成工作流结构、参数、资源引用和原始排版复刻；未完成 12 个案例的真实 GPU 生成验证。
- 当前 Local Bridge 配对/启动入口仍停用，ComfyUI 8188 无服务，已检查的本机安装缺少 main.py。
- 源图引用 13 个不同模型文件名。本机清单仅能同名匹配其中的 VAE；其余检查点、LoRA、ControlNet、SDXL 与指定超分模型仍需补齐。已有 RealESRGAN_x4plus.pth 与源图指定 .safetensors 文件名不同，保持源引用不变。
- 模型权重不在下载包内；6 张输入图片已补齐。
- 模型输出的逐像素一致还依赖完全相同的权重、运行版本、随机策略和设备，本次没有作这种承诺。

## 文件与复现

[完整逐个查阅记录](/D:/ArtEdu/data/comfy-workflow-library/README.md) · [依赖清单](/D:/ArtEdu/data/comfy-workflow-library/dependencies.json) · [浏览器结果](/D:/ArtEdu/outputs/comfy-replication-20261026/browser-report.json)

```powershell
node scripts/replicate-comfy-workflows.mjs                     # 无网络：重新分析与往返校验
node scripts/replicate-comfy-workflows.mjs --fetch             # 固定提交重新下载原始 JSON
node scripts/replicate-comfy-workflows.mjs --assets --install  # 下载输入并幂等安装为本机草稿
node scripts/verify-comfy-replicas-browser.mjs                 # 真实平台逐个打开、下载比对、截图
node --test admin-console/tests/comfy-replicas.test.mjs
```
