#!/usr/bin/env python3
"""更新 ArtEdu 服务器 .env 的模型配置。

密钥从 stdin 读入（不经过命令行参数，也不回显），只写入服务器本机被 git 忽略的 .env。
"""
import pathlib
import sys

PROVIDERS = (
    '[{"id":"model-deepseek-v4-pro","baseUrl":"https://api.deepseek.com","model":"deepseek-v4-pro",'
    '"capabilities":["chat","webpage","document"],"apiKeyEnv":"DEEPSEEK_API_KEY","timeoutMs":60000},'
    '{"id":"model-modelscope-qwen-image","baseUrl":"https://api-inference.modelscope.cn","model":"Qwen/Qwen-Image",'
    '"capabilities":["image","pattern"],"apiKeyEnv":"MODELSCOPE_API","timeoutMs":120000,'
    '"protocol":"modelscope-image","internal":true}]'
)

env_path = pathlib.Path.home() / "artedu" / ".env"
original = env_path.read_text(encoding="utf-8")
secret = sys.stdin.read().strip()

lines = original.splitlines()
out, seen_providers, seen_key = [], False, False
for line in lines:
    if line.startswith("MODEL_PROVIDERS_JSON="):
        out.append("MODEL_PROVIDERS_JSON=" + PROVIDERS)
        seen_providers = True
    elif line.startswith("MODELSCOPE_API="):
        out.append("MODELSCOPE_API=" + secret)
        seen_key = True
    elif line.startswith("MODEL_EXECUTION_ENABLED="):
        out.append("MODEL_EXECUTION_ENABLED=true")
    else:
        out.append(line)
if not seen_providers:
    out.append("MODEL_PROVIDERS_JSON=" + PROVIDERS)
if not seen_key:
    out.append("MODELSCOPE_API=" + secret)

env_path.write_text("\n".join(out) + "\n", encoding="utf-8")

# 回读校验：只打印键名与长度，绝不打印值。
check = env_path.read_text(encoding="utf-8")
print("--- 校验（值已隐去）---")
for line in check.splitlines():
    key = line.split("=", 1)[0]
    if key in ("DEEPSEEK_API_KEY", "MODELSCOPE_API", "ARTEDU_POSTGRES_PASSWORD", "CRAWL4AI_API_TOKEN"):
        print(f"{key}=<长度 {len(line.split('=', 1)[1])}>")
    elif key in ("MODEL_EXECUTION_ENABLED", "MODEL_PROVIDERS_JSON"):
        print(line[:150] + ("..." if len(line) > 150 else ""))
print("总行数:", len(check.strip().splitlines()))
