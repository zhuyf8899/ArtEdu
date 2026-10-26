# ComfyUI 官方工作流 1:1 复刻库

2026-10-26。已查阅并复刻 12 个公开官方模板，保留上游 MIT 许可证。

来源：[Comfy-Org/workflow_templates](https://github.com/Comfy-Org/workflow_templates/tree/67984637eefcd4825dcf5c134e39034785be1682)；固定提交 `67984637eefcd4825dcf5c134e39034785be1682`。

## 文件与使用

- `replicas/`：12 个原样 ComfyUI UI JSON，字节与上游原文件一致，可直接拖入完整 ComfyUI。
- `originals/`：上游原始文件，作为比对基准。
- `platform/`：12 个 ArtEdu 平台导入包；也已通过真实 API 保存为草稿。
- `input/`：源图引用的 6 张官方输入素材。直接使用 ComfyUI 时复制到其 `input/`，保持文件名。
- `analysis/`：每个案例的节点、端口、参数、布局、模式、依赖与来源。
- `manifest.json`：固定来源、SHA-256 和逐字段往返结果。
- `dependencies.json`：模型文件引用及本机同名文件检查。
- `LICENSE`：上游 MIT 许可证。模型权重未打包，按原作者链接与模型各自许可获取。

## 案例清单

| 案例 | 节点 | 连线 | 原图 | 平台草稿 |
| --- | ---: | ---: | --- | --- |
| 基础文生图 | 11 | 9 | [源文件](https://github.com/Comfy-Org/workflow_templates/blob/67984637eefcd4825dcf5c134e39034785be1682/archived/default.json) | [打开](http://localhost:4173/admin/workflows?edit=workflow-97725816-50a8-4b80-b55c-acf1150d0e82) |
| 图生图 | 12 | 12 | [源文件](https://github.com/Comfy-Org/workflow_templates/blob/67984637eefcd4825dcf5c134e39034785be1682/archived/image2image.json) | [打开](http://localhost:4173/admin/workflows?edit=workflow-42c783ac-c9d7-4c31-9633-4ae9a9212502) |
| 局部重绘 | 12 | 13 | [源文件](https://github.com/Comfy-Org/workflow_templates/blob/67984637eefcd4825dcf5c134e39034785be1682/archived/inpaint_example.json) | [打开](http://localhost:4173/admin/workflows?edit=workflow-2e8f38a4-5dd2-45ea-b8f4-63cb04b40205) |
| 向外扩图 | 13 | 14 | [源文件](https://github.com/Comfy-Org/workflow_templates/blob/67984637eefcd4825dcf5c134e39034785be1682/archived/inpaint_model_outpainting.json) | [打开](http://localhost:4173/admin/workflows?edit=workflow-54860fc7-b05b-48fc-b963-582f5408041f) |
| 单 LoRA（保留旁路层） | 10 | 13 | [源文件](https://github.com/Comfy-Org/workflow_templates/blob/67984637eefcd4825dcf5c134e39034785be1682/archived/lora.json) | [打开](http://localhost:4173/admin/workflows?edit=workflow-37410d81-116b-4ebf-bb89-859098568e18) |
| 多 LoRA 串联 | 10 | 13 | [源文件](https://github.com/Comfy-Org/workflow_templates/blob/67984637eefcd4825dcf5c134e39034785be1682/archived/lora_multiple.json) | [打开](http://localhost:4173/admin/workflows?edit=workflow-d33a1078-3423-4f88-8dc4-3a578affed27) |
| 潜空间二次采样放大 | 12 | 17 | [源文件](https://github.com/Comfy-Org/workflow_templates/blob/67984637eefcd4825dcf5c134e39034785be1682/archived/hiresfix_latent_workflow.json) | [打开](http://localhost:4173/admin/workflows?edit=workflow-156df11d-a867-4e23-b6e3-3a77aa0c759a) |
| ESRGAN 二次采样放大 | 16 | 23 | [源文件](https://github.com/Comfy-Org/workflow_templates/blob/67984637eefcd4825dcf5c134e39034785be1682/archived/hiresfix_esrgan_workflow.json) | [打开](http://localhost:4173/admin/workflows?edit=workflow-d0f2088f-48fd-44cb-a4a5-c978103eba24) |
| ControlNet 控制 | 15 | 15 | [源文件](https://github.com/Comfy-Org/workflow_templates/blob/67984637eefcd4825dcf5c134e39034785be1682/archived/controlnet_example.json) | [打开](http://localhost:4173/admin/workflows?edit=workflow-15bd8226-0094-470d-bc1b-1033faf5c393) |
| 多 ControlNet 混合 | 15 | 17 | [源文件](https://github.com/Comfy-Org/workflow_templates/blob/67984637eefcd4825dcf5c134e39034785be1682/archived/mixing_controlnets.json) | [打开](http://localhost:4173/admin/workflows?edit=workflow-a983a623-0923-4ec5-8498-0b48053f946e) |
| 模型超分 | 11 | 12 | [源文件](https://github.com/Comfy-Org/workflow_templates/blob/67984637eefcd4825dcf5c134e39034785be1682/archived/esrgan_example.json) | [打开](http://localhost:4173/admin/workflows?edit=workflow-e5903008-938c-4f6e-bf37-8905c72c5af8) |
| SDXL Base 与 Refiner | 20 | 19 | [源文件](https://github.com/Comfy-Org/workflow_templates/blob/67984637eefcd4825dcf5c134e39034785be1682/templates/sdxl_refiner_prompt_example.json) | [打开](http://localhost:4173/admin/workflows?edit=workflow-be93ab36-5917-42d4-92df-045287abd392) |

## 验证范围

- 12/12 原始副本 SHA-256 一致；12/12 平台导入/导出全部字段一致。
- 12/12 真实服务端保存后再读取与导出一致；12/12 页面实际下载文件与原图全部字段一致。
- 157 个节点、177 条连线、285 项原始控件值、55 个原图分组已核对；保留 3 个折叠节点和 1 个旁路节点。
- 原始节点坐标与尺寸、连线端口、控件顺序、种子策略、模式、模型文件名、说明节点和扩展属性均保留。
- 这里的 1:1 指工作流数据及原始布局，不是对 ComfyUI 软件界面的像素级克隆，也不等同于生成图像逐像素一致。
- 未执行这些 GPU 图。当前 Bridge 停用、ComfyUI 未启动；本机也缺少源图指定的多项模型。
- 前端平台回归 170/170 通过，生产构建通过；既有 ComfyUI 导入导出浏览器回归通过。

## 逐个查阅记录

### 01-text-to-image · 基础文生图

基础采样：检查点、正负条件、空潜空间、采样、VAE 解码和保存。

教程：[官方示例说明](https://docs.comfy.org/tutorials/basic/text-to-image)。

节点类型：`CheckpointLoaderSimple`, `KSampler`, `VAEDecode`, `SaveImage`, `CLIPTextEncode`, `EmptyLatentImage`, `MarkdownNote`。

依赖与原始参数：

- 节点 4 `CheckpointLoaderSimple`，模式 0，控件值 `["v1-5-pruned-emaonly-fp16.safetensors"]`。
- 采样节点 3 `KSampler` 的完整有序参数：`[685468484323813, "randomize", 20, 8, "euler", "normal", 1]`。

[原始副本](replicas/01-text-to-image.json) · [详细节点清单](analysis/01-text-to-image.json)

### 02-image-to-image · 图生图

载入原图经 VAE 编码后进入采样器，保留原始 denoise 与尺寸处理。

教程：[官方示例说明](https://docs.comfy.org/tutorials/basic/image-to-image)。

节点类型：`CheckpointLoaderSimple`, `VAEDecode`, `SaveImage`, `LoadImage`, `CLIPTextEncode`, `ImageScaleToTotalPixels`, `VAEEncode`, `KSampler`, `MarkdownNote`。

依赖与原始参数：

- 节点 14 `CheckpointLoaderSimple`，模式 0，控件值 `["v1-5-pruned-emaonly-fp16.safetensors"]`。
- 节点 10 `LoadImage`，模式 0，控件值 `["image2image_input_image.jpg", "image"]`。
- 采样节点 3 `KSampler` 的完整有序参数：`[266967097991208, "randomize", 15, 8, "dpmpp_2m", "normal", 0.87]`。

[原始副本](replicas/02-image-to-image.json) · [详细节点清单](analysis/02-image-to-image.json)

### 03-inpainting · 局部重绘

保留原图透明遮罩及重绘编码链，不改成普通文字生图。

教程：[官方示例说明](https://docs.comfy.org/tutorials/basic/inpaint)。

节点类型：`CLIPTextEncode`, `LoadImage`, `ImageScaleToTotalPixels`, `MarkdownNote`, `VAEEncodeForInpaint`, `VAEDecode`, `KSampler`, `SaveImage`, `CheckpointLoaderSimple`。

依赖与原始参数：

- 节点 20 `LoadImage`，模式 0，控件值 `["inpaint_example_input_image.png", "image"]`。
- 节点 29 `CheckpointLoaderSimple`，模式 0，控件值 `["512-inpainting-ema.safetensors"]`。
- 采样节点 3 `KSampler` 的完整有序参数：`[808369199502636, "randomize", 20, 8, "uni_pc_bh2", "normal", 1]`。

[原始副本](replicas/03-inpainting.json) · [详细节点清单](analysis/03-inpainting.json)

### 04-outpainting · 向外扩图

保留扩图 padding、遮罩与重绘模型链。

教程：[官方示例说明](https://docs.comfy.org/tutorials/basic/inpaint)。

节点类型：`CheckpointLoaderSimple`, `CLIPTextEncode`, `LoadImage`, `ImageScaleToTotalPixels`, `KSampler`, `VAEDecode`, `SaveImage`, `ImagePadForOutpaint`, `MarkdownNote`, `VAEEncodeForInpaint`。

依赖与原始参数：

- 节点 29 `CheckpointLoaderSimple`，模式 0，控件值 `["512-inpainting-ema.safetensors"]`。
- 节点 20 `LoadImage`，模式 0，控件值 `["inpaint_model_outpainting_input_image.png", "image"]`。
- 采样节点 3 `KSampler` 的完整有序参数：`[476514576444494, "randomize", 20, 7, "dpmpp_2m", "karras", 1]`。

[原始副本](replicas/04-outpainting.json) · [详细节点清单](analysis/04-outpainting.json)

### 05-lora · 单 LoRA（保留旁路层）

启用 blindbox 权重 0.75 / 1，原图第二层 MoXin 权重 0.5 / 1 处于旁路模式 4；完整保留旁路状态。

教程：[官方示例说明](https://docs.comfy.org/tutorials/basic/lora)。

节点类型：`KSampler`, `VAEDecode`, `SaveImage`, `EmptyLatentImage`, `CheckpointLoaderSimple`, `LoraLoader`, `CLIPTextEncode`, `MarkdownNote`。

依赖与原始参数：

- 节点 4 `CheckpointLoaderSimple`，模式 0，控件值 `["dreamshaper_8.safetensors"]`。
- 节点 11 `LoraLoader`，模式 0，控件值 `["blindbox_v1_mix.safetensors", 0.75, 1]`。
- 节点 13 `LoraLoader`，模式 4，控件值 `["MoXinV1.safetensors", 0.5, 1]`。
- 采样节点 3 `KSampler` 的完整有序参数：`[261660645921551, "randomize", 30, 7, "dpmpp_2m", "karras", 1]`。

[原始副本](replicas/05-lora.json) · [详细节点清单](analysis/05-lora.json)

### 06-multiple-loras · 多 LoRA 串联

保留串联顺序和每层 MODEL、CLIP 权重，不合并为一个风格提示词。

教程：[官方示例说明](https://docs.comfy.org/tutorials/basic/lora)。

节点类型：`LoraLoader`, `CheckpointLoaderSimple`, `EmptyLatentImage`, `CLIPTextEncode`, `KSampler`, `VAEDecode`, `SaveImage`, `MarkdownNote`。

依赖与原始参数：

- 节点 11 `LoraLoader`，模式 0，控件值 `["blindbox_v1_mix.safetensors", 0.9, 1]`。
- 节点 4 `CheckpointLoaderSimple`，模式 0，控件值 `["dreamshaper_8.safetensors"]`。
- 节点 10 `LoraLoader`，模式 0，控件值 `["MoXinV1.safetensors", 0.9, 1]`。
- 采样节点 3 `KSampler` 的完整有序参数：`[736724629443131, "randomize", 30, 7, "dpmpp_2m", "karras", 1]`。

[原始副本](replicas/06-multiple-loras.json) · [详细节点清单](analysis/06-multiple-loras.json)

### 07-hires-latent · 潜空间二次采样放大

低分辨率采样、潜空间放大、第二次采样，保留两阶段参数。

教程：[官方示例说明](https://comfyanonymous.github.io/ComfyUI_examples/2_pass_txt2img/)。

节点类型：`EmptyLatentImage`, `LatentUpscale`, `KSampler`, `CLIPTextEncode`, `VAEDecode`, `PreviewImage`, `SaveImage`, `CheckpointLoaderSimple`, `MarkdownNote`。

依赖与原始参数：

- 节点 16 `CheckpointLoaderSimple`，模式 0，控件值 `["DreamShaper_8_pruned.safetensors"]`。
- 采样节点 3 `KSampler` 的完整有序参数：`[873141143997374, "randomize", 12, 8, "dpmpp_sde", "normal", 1]`。
- 采样节点 11 `KSampler` 的完整有序参数：`[32484370206415, "randomize", 14, 8, "dpmpp_2m", "simple", 0.5]`。

[原始副本](replicas/07-hires-latent.json) · [详细节点清单](analysis/07-hires-latent.json)

### 08-hires-esrgan · ESRGAN 二次采样放大

像素空间超分后重新编码到潜空间，再做二次采样。

教程：[官方示例说明](https://comfyanonymous.github.io/ComfyUI_examples/2_pass_txt2img/#non-latent-upscaling)。

节点类型：`KSampler`, `VAEDecode`, `UpscaleModelLoader`, `EmptyLatentImage`, `ImageUpscaleWithModel`, `VAEEncode`, `CheckpointLoaderSimple`, `ImageScale`, `MarkdownNote`, `SaveImage`, `CLIPTextEncode`。

依赖与原始参数：

- 节点 23 `UpscaleModelLoader`，模式 0，控件值 `["RealESRGAN_x4plus.safetensors"]`。
- 节点 25 `CheckpointLoaderSimple`，模式 0，控件值 `["DreamShaper_8_pruned.safetensors"]`。
- 采样节点 11 `KSampler` 的完整有序参数：`[756770419990187, "randomize", 14, 8, "uni_pc_bh2", "normal", 0.5]`。
- 采样节点 3 `KSampler` 的完整有序参数：`[736955103296125, "randomize", 12, 8, "dpmpp_sde", "normal", 1]`。

[原始副本](replicas/08-hires-esrgan.json) · [详细节点清单](analysis/08-hires-esrgan.json)

### 09-controlnet · ControlNet 控制

保留控制图、控制模型及条件强度，不虚构预处理器。

教程：[官方示例说明](https://comfyanonymous.github.io/ComfyUI_examples/controlnet/)。

节点类型：`CLIPTextEncode`, `CheckpointLoaderSimple`, `LoadImage`, `VAEDecode`, `KSampler`, `SaveImage`, `PreviewImage`, `VAELoader`, `ControlNetLoader`, `MarkdownNote`, `ControlNetApplyAdvanced`, `Canny`, `EmptyLatentImage`。

依赖与原始参数：

- 节点 14 `CheckpointLoaderSimple`，模式 0，控件值 `["DreamShaper_8_pruned.safetensors"]`。
- 节点 11 `LoadImage`，模式 0，控件值 `["controlnet_example_input_image.png", "image"]`。
- 节点 13 `VAELoader`，模式 0，控件值 `["vae-ft-mse-840000-ema-pruned.safetensors"]`。
- 节点 12 `ControlNetLoader`，模式 0，控件值 `["control_v11p_sd15_scribble_fp16.safetensors"]`。
- 采样节点 3 `KSampler` 的完整有序参数：`[599575228983496, "randomize", 20, 6, "euler", "normal", 1]`。

[原始副本](replicas/09-controlnet.json) · [详细节点清单](analysis/09-controlnet.json)

### 10-mixed-controlnets · 多 ControlNet 混合

保留多个控制图和顺序应用的条件链。

教程：[官方示例说明](https://comfyanonymous.github.io/ComfyUI_examples/controlnet/#mixing-controlnets)。

节点类型：`VAELoader`, `LoadImage`, `ControlNetLoader`, `ControlNetApplyAdvanced`, `CLIPTextEncode`, `EmptyLatentImage`, `KSampler`, `VAEDecode`, `SaveImage`, `CheckpointLoaderSimple`, `MarkdownNote`。

依赖与原始参数：

- 节点 15 `VAELoader`，模式 0，控件值 `["vae-ft-mse-840000-ema-pruned.safetensors"]`。
- 节点 20 `LoadImage`，模式 0，控件值 `["mixing_controlnets_scribble_input.png", "image"]`。
- 节点 21 `LoadImage`，模式 0，控件值 `["mixing_controlnets_pose_input.png", "image"]`。
- 节点 26 `ControlNetLoader`，模式 0，控件值 `["control_v11p_sd15_scribble_fp16.safetensors"]`。
- 节点 35 `ControlNetLoader`，模式 0，控件值 `["control_v11p_sd15_openpose_fp16.safetensors"]`。
- 节点 31 `CheckpointLoaderSimple`，模式 0，控件值 `["awpainting_v14.safetensors"]`。
- 采样节点 3 `KSampler` 的完整有序参数：`[1021287240057524, "randomize", 20, 6, "dpmpp_sde", "karras", 1]`。

[原始副本](replicas/10-mixed-controlnets.json) · [详细节点清单](analysis/10-mixed-controlnets.json)

### 11-esrgan · 模型超分

保留 UpscaleModelLoader 和 ImageUpscaleWithModel 的真实模型引用。

教程：[官方示例说明](https://comfyanonymous.github.io/ComfyUI_examples/upscale_models/)。

节点类型：`ImageUpscaleWithModel`, `KSampler`, `CLIPTextEncode`, `VAEDecode`, `SaveImage`, `PreviewImage`, `EmptyLatentImage`, `UpscaleModelLoader`, `CheckpointLoaderSimple`, `MarkdownNote`。

依赖与原始参数：

- 节点 13 `UpscaleModelLoader`，模式 0，控件值 `["RealESRGAN_x4plus.safetensors"]`。
- 节点 4 `CheckpointLoaderSimple`，模式 0，控件值 `["DreamShaper_8_pruned.safetensors"]`。
- 采样节点 3 `KSampler` 的完整有序参数：`[479320868631054, "randomize", 20, 8, "euler", "normal", 1]`。

[原始副本](replicas/11-esrgan.json) · [详细节点清单](analysis/11-esrgan.json)

### 12-sdxl-refiner · SDXL Base 与 Refiner

保留 Base、Refiner 独立提示词与高级采样器阶段边界。

教程：[官方示例说明](https://comfyanonymous.github.io/ComfyUI_examples/sdxl/)。

节点类型：`Note`, `CheckpointLoaderSimple`, `CLIPTextEncode`, `PrimitiveNode`, `EmptyLatentImage`, `KSamplerAdvanced`, `VAEDecode`, `SaveImage`, `MarkdownNote`。

依赖与原始参数：

- 节点 12 `CheckpointLoaderSimple`，模式 0，控件值 `["sd_xl_refiner_1.0.safetensors"]`。
- 节点 4 `CheckpointLoaderSimple`，模式 0，控件值 `["sd_xl_base_1.0.safetensors"]`。
- 采样节点 10 `KSamplerAdvanced` 的完整有序参数：`["enable", 6767725640732, "randomize", 25, 8, "euler", "normal", 0, 20, "enable"]`。
- 采样节点 11 `KSamplerAdvanced` 的完整有序参数：`["disable", 0, "fixed", 25, 8, "euler", "normal", 20, 10000, "disable"]`。

[原始副本](replicas/12-sdxl-refiner.json) · [详细节点清单](analysis/12-sdxl-refiner.json)
