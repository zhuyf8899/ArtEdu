import { useEffect, useMemo, useRef, useState } from "react";
import { AiMarkdown } from "./AiMarkdown.js";
import {
  ArrowUpRight, Browser, ChatCircleDots, CirclesThreePlus, Code,
  FileDoc, FilePpt, FloppyDisk, Gauge, ImageSquare, Paperclip, Sparkle, Trash,
} from "@phosphor-icons/react";

const CREATION_METHODS = [
  {
    id: "ui",
    label: "UI 创作",
    eyebrow: "界面 / 图标 / 设计系统",
    placeholder: "例如：为艺术教育平台设计一套高对比度课程卡片，并说明信息层级……",
    jobType: "image",
    Icon: Browser,
  },
  {
    id: "pattern",
    label: "图案生成",
    eyebrow: "纹样 / 材质 / 视觉实验",
    placeholder: "例如：将宋代花窗与海浪结构组合成可连续平铺的蓝绿色纹样……",
    jobType: "pattern",
    Icon: CirclesThreePlus,
  },
  {
    id: "vibe",
    label: "Vibe Coding",
    eyebrow: "网页 / 交互 / 可运行原型",
    placeholder: "例如：创建一个展示学生 AI 艺术作品的响应式画廊，支持分类筛选……",
    jobType: "webpage",
    Icon: Code,
  },
  {
    id: "word",
    label: "Word 文档",
    eyebrow: "教案 / 课程方案 / 创作说明",
    placeholder: "例如：为“传统纹样与当代视觉”生成一份 45 分钟课程教案，包含目标、流程、材料和评价方式……",
    jobType: "document",
    outputFormat: "docx",
    Icon: FileDoc,
  },
  {
    id: "slides",
    label: "PPT 演示",
    eyebrow: "汇报 / 课程课件 / 作品阐释",
    placeholder: "例如：生成一份关于 AI 辅助纹样创作的 8 页课堂汇报，包含主题、案例、方法与讨论题……",
    jobType: "document",
    outputFormat: "pptx",
    Icon: FilePpt,
  },
];

const FALLBACK_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", note: "策划与视觉理解" },
  { id: "claude-4", name: "Claude 4", note: "长文本与代码" },
  { id: "flux-1", name: "FLUX.1", note: "图像生成" },
  { id: "qwen-image", name: "Qwen Image", note: "中文视觉创作" },
];

export function AiCreationConsole({ account, onCreate, onSmartSearch, creation, onNotice }) {
  const storedDraft = useMemo(() => readDraft(account.id), [account.id]);
  const [methodId, setMethodId] = useState(() => storedDraft?.methodId ?? "ui");
  const [modelId, setModelId] = useState(() => storedDraft?.modelId ?? "gpt-4o");
  const [prompt, setPrompt] = useState(() => storedDraft?.prompt ?? "");
  const [sending, setSending] = useState(false);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [draftSaved, setDraftSaved] = useState(Boolean(storedDraft?.prompt));
  const [messages, setMessages] = useState(() => readConversation(account.id));
  const [artifact, setArtifact] = useState(null);
  const [localReference, setLocalReference] = useState(null);
  const referenceInput = useRef(null);

  const method = useMemo(() => CREATION_METHODS.find((item) => item.id === methodId) ?? CREATION_METHODS[0], [methodId]);
  const models = useMemo(() => creation?.enabled && creation?.models?.length
    ? creation.models.map((item) => ({ id: item.id, name: item.name, note: item.identifier, capabilities: item.capabilities ?? [] }))
    : FALLBACK_MODELS, [creation]);
  const model = useMemo(() => models.find((item) => item.id === modelId) ?? models[0], [modelId, models]);
  const quota = creation?.quota ?? {};
  const serviceReady = Boolean(creation?.enabled && creation?.models?.length);
  const quotaBlocked = (quota.dailyLimit !== null && quota.dailyLimit !== undefined && quota.dailyUsed >= quota.dailyLimit)
    || (quota.monthlyLimit !== null && quota.monthlyLimit !== undefined && quota.monthlyUsed >= quota.monthlyLimit)
    || (quota.concurrentLimit !== null && quota.concurrentLimit !== undefined && quota.inFlight >= quota.concurrentLimit);

  useEffect(() => {
    if (!models.some((item) => item.id === modelId)) setModelId(models[0]?.id ?? "gpt-4o");
  }, [modelId, models]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!prompt.trim()) {
        clearDraft(account.id);
        setDraftSaved(false);
        return;
      }
      setDraftSaved(saveDraft(account.id, { prompt, methodId, modelId, updatedAt: new Date().toISOString() }));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [account.id, methodId, modelId, prompt]);

  useEffect(() => {
    try { window.localStorage.setItem(conversationKey(account.id), JSON.stringify(messages.slice(-20))); }
    catch { /* 对话缓存失败不影响当前会话。 */ }
  }, [account.id, messages]);

  const submit = async (event) => {
    event.preventDefault();
    const content = prompt.trim();
    if (!content || sending) return;
    if (quotaBlocked) {
      setFailed(true);
      setReply("当前生成额度或并发额度已达到上限，草稿已保存。请稍后重试或联系管理员调整额度。");
      onNotice?.("当前生成额度不可用，请稍后重试", "error");
      return;
    }
    setSending(true);
    setFailed(false);
    setArtifact(null);
    const context = messages.map(({ role, content: messageContent }) => ({ role, content: messageContent }));
    const pendingReply = serviceReady ? `正在用 ${model.name} 生成“${method.label}”建议，请稍候……` : `正在通过本地演示引擎整理“${method.label}”方案，不会调用外部模型……`;
    setMessages((current) => [...current, { role: "user", content }, { role: "assistant", content: pendingReply }]);
    const result = await onCreate({
      jobType: method.jobType,
      prompt: content,
      modelConfigId: serviceReady ? model.id : undefined,
      parameters: { method: method.id, methodLabel: method.label, model: model.id, ...(method.outputFormat ? { outputFormat: method.outputFormat } : {}) },
      context,
    });
    const response = result?.local
      ? `${result.content}\n\n本次为本地演示结果，任务已写入数据库并完成审计；接入正式模型后可沿用同一创作入口。`
      : result?.content
        ? result.content
      : result
        ? `任务 ${result.id.slice(0, 8)} 已创建。输入内容已清空，你可以继续创建下一个任务。`
        : "创作请求失败，输入已保留。请根据错误提示重试。";
    setMessages((current) => [...current.slice(0, -1), { role: "assistant", content: response }]);
    if (result) {
      setArtifact(result.artifact ?? null);
      setPrompt("");
      setDraftSaved(false);
      clearDraft(account.id);
    }
    setFailed(!result);
    setSending(false);
  };

  const runSmartSearch = async () => {
    const content = prompt.trim();
    if (!content || sending || searching) return;
    setSearching(true);
    setFailed(false);
    const context = messages.map(({ role, content: messageContent }) => ({ role, content: messageContent }));
    setMessages((current) => [...current, { role: "user", content }, { role: "assistant", content: "正在根据你的需求搜索课程、工作流和案例……" }]);
    const result = await onSmartSearch?.(content, context);
    setMessages((current) => [...current.slice(0, -1), { role: "assistant", content: result?.content ?? "智能搜索未完成，输入内容已保留。请稍后重试。" }]);
    setFailed(!result);
    setSearching(false);
  };

  return <section className="ai-creation" aria-labelledby="ai-creation-title">
    <div className="ai-creation__intro">
      <span><Sparkle size={14} weight="fill" /> {serviceReady ? "已配置模型服务 · 校内账号直接使用" : "本地演示模式 · 不调用外部模型"}</span>
      <h2 id="ai-creation-title">今天想<span>创作</span>什么？</h2>
      <p>选择方法与大模型，把灵感变成可以执行、学习和复用的艺术工作流。</p>
    </div>

    <form className="ai-composer" onSubmit={submit}>
      <div className={`ai-service-state ${serviceReady ? "is-ready" : "is-offline"}`}>
        <span><i />{serviceReady ? `${creation.models.length} 个模型配置可执行` : "外部模型未接入 · 本地演示可用"}</span>
        <span><Gauge size={14} />{quota.dailyLimit === null || quota.dailyLimit === undefined ? "今日额度未限制" : `今日剩余 ${Math.max(0, quota.dailyLimit - quota.dailyUsed)} / ${quota.dailyLimit}`}</span>
        <span>并发 {quota.inFlight ?? 0} / {quota.concurrentLimit ?? "∞"}</span>
      </div>
      <div className="ai-conversation">
        {messages.map((message, index) => message.role === "user"
          ? <div className="ai-message--user" aria-label="你的问题" key={`${index}-${message.role}`}><span className="ai-message__author">你</span><p>{message.content}</p></div>
          : <div className="ai-message ai-message--assistant" aria-live="polite" aria-busy={sending || searching} key={`${index}-${message.role}`}><span aria-hidden="true"><ChatCircleDots size={21} weight="regular" /></span><div className="ai-message__body"><span className="ai-message__author">ArtEdu 助教</span><AiMarkdown>{message.content}</AiMarkdown>{index === messages.length - 1 && artifact && <a className="ai-download" href={artifact.downloadUrl} download>{`下载 ${artifact.fileName}`}</a>}{index === messages.length - 1 && failed && <img className="ai-failure-image" src="/assets/generation-failure.png" alt="生成失败占位图" />}</div></div>)}
        <label htmlFor="artedu-ai-prompt" className="sr-only">描述你的创作想法</label>
        <textarea
          id="artedu-ai-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={method.placeholder}
          rows={4}
        />
      </div>

      <div className="ai-composer__footer">
        <div className="model-picker">
          <span>{serviceReady ? "模型接口" : "演示参数"}</span>
          <select aria-label="选择大模型" value={model?.id ?? ""} onChange={(event) => setModelId(event.target.value)}>
            {models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div className="ai-composer__controls">
          <div className="ai-methods" role="tablist" aria-label="AI 使用方法">
            {CREATION_METHODS.map(({ id, label, eyebrow, Icon }) => <button
              type="button"
              role="tab"
              aria-selected={methodId === id}
              title={eyebrow}
              className={methodId === id ? "is-active" : ""}
              key={id}
              onClick={() => setMethodId(id)}
            ><Icon size={14} weight="bold" /><strong>{label}</strong></button>)}
          </div>
          <div className="ai-composer__actions">
            <input ref={referenceInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.docx,.pptx" onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setLocalReference({ name: file.name, size: file.size });
              onNotice?.(`“${file.name}”仅暂存在当前浏览器，未上传到服务器`, "info");
              event.target.value = "";
            }} />
            <button type="button" className="ai-attach" aria-label="添加本机参考文件" title="本机临时参考文件" onClick={() => referenceInput.current?.click()}><Paperclip size={18} weight="bold" /></button>
            <button type="button" className="ai-attach" disabled={!prompt.trim() || sending || searching || !serviceReady} onClick={() => void runSmartSearch()} title="让模型按需求搜索课程、工作流和案例">智能搜索</button>
            <button type="submit" className="ai-submit" disabled={!prompt.trim() || sending || searching || quotaBlocked} title={!serviceReady ? "使用本地 Harness 完成结构化演示，不调用外部模型" : undefined}>
              {sending ? "创建中" : quotaBlocked ? "额度已用尽" : serviceReady ? "开始创作" : "本地演示"} <ArrowUpRight size={18} weight="bold" />
            </button>
          </div>
        </div>
      </div>
      <div className="ai-composer__status"><span><ImageSquare size={14} /> 当前身份：{account.shortName} · {method.label} · {model.name}</span>{localReference && <span title="文件未上传，刷新页面后会消失">本机暂存：{localReference.name}</span>}{prompt.trim() && <button type="button" onClick={() => { setPrompt(""); setDraftSaved(false); clearDraft(account.id); }}><Trash size={13} /> 清空草稿</button>}<em><FloppyDisk size={13} />{draftSaved ? "草稿已保存" : "输入后自动保存"}</em></div>
    </form>
  </section>;
}

function draftKey(accountId) { return `artedu.ai-draft.${accountId}`; }
function conversationKey(accountId) { return `artedu.ai-conversation.${accountId}`; }

function readConversation(accountId) {
  try {
    const value = JSON.parse(window.localStorage.getItem(conversationKey(accountId)) || "[]");
    return Array.isArray(value) ? value.filter((item) => (item?.role === "user" || item?.role === "assistant") && typeof item.content === "string") : [];
  } catch { return []; }
}

// 草稿只保存在当前浏览器，并按账号隔离；不包含密钥或服务端响应。
function saveDraft(accountId, value) {
  try { window.localStorage.setItem(draftKey(accountId), JSON.stringify(value)); return true; }
  catch { return false; }
}

function clearDraft(accountId) {
  try { window.localStorage.removeItem(draftKey(accountId)); }
  catch { /* 浏览器禁用本地存储时不影响创作流程。 */ }
}

function readDraft(accountId) {
  try {
    const value = JSON.parse(window.localStorage.getItem(draftKey(accountId)) || "null");
    if (!value || typeof value.prompt !== "string") return null;
    return {
      prompt: value.prompt,
      methodId: CREATION_METHODS.some((item) => item.id === value.methodId) ? value.methodId : "ui",
      modelId: typeof value.modelId === "string" ? value.modelId : "gpt-4o",
    };
  } catch {
    return null;
  }
}
