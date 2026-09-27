# 临时生图通道：SiliconFlow Kolors

用于 ModelScope 排队较久时的临时切换。Kolors 在 SiliconFlow 当前价格页标为免费；实际可用性和速度以账号实测为准。

1. 在 <https://cloud.siliconflow.cn/account/ak> 注册并创建 API Key。不要把 Key 放进 Git、前端环境变量或聊天记录。
2. 在服务器私有 `.env` 添加 `SILICONFLOW_API_KEY=...`。本机开发环境对应 `apps/api/.env`；Docker 测试服务器对应根目录 `.env`。
3. 运行数据库迁移 `0031_siliconflow_temporary_image.sql`，例如从 `apps/api` 执行 `npm run db:migrate`。
4. 修改私有 `.env` 的 **现有** `MODEL_PROVIDERS_JSON` 数组，把下面这一项插到 ModelScope 条目之前。不要新增第二行 `MODEL_PROVIDERS_JSON`，也不要删掉已有文本模型条目。

```json
{"id":"model-siliconflow-kolors","baseUrl":"https://api.siliconflow.cn/v1","model":"Kwai-Kolors/Kolors","capabilities":["image","pattern"],"apiKeyEnv":"SILICONFLOW_API_KEY","timeoutMs":180000,"protocol":"siliconflow-image","internal":true}
```

5. 重启 API 服务，在 ArtEdu 发起一次小尺寸图片任务验证。`internal:true` 表示用户无须在前端下拉框选择该模型，图片任务自动使用数组中第一个支持 `image` 的配置。若需回到 ModelScope，把 ModelScope 条目重新放在它前面并重启。

这里的适配器使用 SiliconFlow 的 `POST /v1/images/generations`，发送 `image_size` 并读取 `images[0].url`，立刻下载到 ArtEdu 私有存储。Kolors 默认使用 `1024x1024`；`3:4` 与 `9:16` 分别映射到官方列出的 `960x1280` 与 `720x1280`。其余比例暂时回落到方图，避免不支持的尺寸导致 400 错误。
