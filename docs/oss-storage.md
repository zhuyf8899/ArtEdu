# 云端对象存储接口

默认供应商阿里云 OSS，OSS_ENABLED=false。模块已注册，可注入 ObjectStorageService，通过 put/get/delete 操作私有对象，上传下载均使用流。关闭时不创建 SDK 客户端、不请求云端，操作返回服务未启用。

这是预接入阶段：现有上传、附件预览、生成文件和缓存清理仍使用本地文件系统，暂未迁移或切换到 OSS。不能只打开开关就删除本地文件；业务切换需要同步适配文件读取、范围请求和到期清理。

配置见 apps/api/.env.example。后续启用需要 OSS_ENABLED=true，以及 OSS_REGION、OSS_BUCKET、OSS_ACCESS_KEY_ID、OSS_ACCESS_KEY_SECRET；短期凭据可附加 OSS_STS_TOKEN（过期后需更新配置并重启）。密钥只放服务器环境变量，不提交仓库。使用 HTTPS、V4 签名和私有对象 ACL；RAM 身份需要对应对象读写删除权限。不提供公开桶或匿名访问接口。

验证：在 apps/api 下执行 npx tsx --test src/modules/object-storage/object-storage.test.ts，以及 npx tsc --noEmit。
