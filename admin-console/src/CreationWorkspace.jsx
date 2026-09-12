import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChatCircleDots, Paperclip, Plus, Sparkle, Trash } from "@phosphor-icons/react";
import { AiMarkdown } from "./AiMarkdown.js";
import { CapabilityPicker } from "./CapabilityPicker.jsx";
import { DocumentOptions } from "./DocumentOptions.jsx";
import { supportsCreationMethod } from "./creation-capabilities.js";
import {
  DEFAULT_METHOD_ID, FALLBACK_MODELS, buildCreationParameters, creationMethod, formatConversationTime, titleFromPrompt,
} from "./creationMethods.js";
import {
  createConversation, deleteConversation, listConversations, makeModelContext, saveConversation,
} from "./conversationStore.js";
import { uploadTemporaryCreationFile } from "./services/adminApi.js";
import { useFeedback } from "./FeedbackCenter.jsx";

// 专用创作对话页：左侧历次对话，右侧长文本阅读区与续写输入。
// 起始页提交的需求以 pending 形式落进本地对话，由本页接管真实的模型/演示调用。
export function AiCreationWorkspace({ account, creation, onCreate, onNotice, startNew = false, conversationId = "", onBack = () => {} }) {
  const [conversations, setConversations] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState([]);
  const [methodId, setMethodId] = useState(DEFAULT_METHOD_ID);
  const [modelId, setModelId] = useState(FALLBACK_MODELS[0].id);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [artifact, setArtifact] = useState(null);
  const [reference, setReference] = useState(null);
  const [pageCount, setPageCount] = useState("");
  const { confirmAction } = useFeedback();

  const conversationsRef = useRef([]);
  const loadedIdRef = useRef("");
  const ranPendingRef = useRef("");
  const scrollRef = useRef(null);
  const referenceInput = useRef(null);

  const models = useMemo(() => creation?.enabled && creation?.models?.length
    ? creation.models.map((item) => ({ id: item.id, name: item.name, note: item.identifier, capabilities: item.capabilities ?? [] }))
    : FALLBACK_MODELS, [creation]);
  const model = useMemo(() => models.find((item) => item.id === modelId) ?? models[0], [modelId, models]);
  const quota = creation?.quota ?? {};
  const serviceReady = Boolean(creation?.enabled && creation?.models?.length);
  const quotaBlocked = (quota.dailyLimit !== null && quota.dailyLimit !== undefined && quota.dailyUsed >= quota.dailyLimit)
    || (quota.monthlyLimit !== null && quota.monthlyLimit !== undefined && quota.monthlyUsed >= quota.monthlyLimit)
    || (quota.concurrentLimit !== null && quota.concurrentLimit !== undefined && quota.inFlight >= quota.concurrentLimit);

  const activeConversation = conversations.find((item) => item.id === activeId) ?? null;
  const method = useMemo(() => creationMethod(methodId), [methodId]);

  const updateConversations = useCallback((updater) => {
    setConversations((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      conversationsRef.current = next;
      return next;
    });
  }, []);

  // 图像/图案由平台内部图像通道完成（不出现在前台模型列表），
  // 因此只有当前模型声明支持该能力时才把 modelConfigId 发给服务端。
  const modelSupportsMethod = supportsCreationMethod(model, method.jobType);
  const documentBlocked = serviceReady && method.jobType === "document" && !modelSupportsMethod;
  const modelLabel = modelSupportsMethod ? (model?.name ?? "未选择模型") : method.jobType === "document" ? "请选择支持文档的模型" : "平台内置图像通道";

  // 载入本地对话列表；IndexedDB 不可用时页面仍可读，只是不再持久化。
  useEffect(() => {
    let cancelled = false;
    void listConversations(account.id).then((items) => {
      if (cancelled) return;
      conversationsRef.current = items;
      setConversations(items);
      setLoaded(true);
    }).catch(() => {
      if (cancelled) return;
      setLoaded(true);
      setLoadError("本地对话空间不可用，本次对话不会保存到本机");
      onNotice?.("本地对话空间不可用，本次对话不会保存到本机", "error");
    });
    return () => { cancelled = true; };
  }, [account.id]);

  // 决定首屏展示哪个对话：?new=1 开新对话，?id= 指定对话，否则回到最近一次。
  useEffect(() => {
    if (!loaded) return;
    if (startNew) { loadedIdRef.current = ""; setActiveId(""); setMessages([]); return; }
    const items = conversationsRef.current;
    if (conversationId && items.some((item) => item.id === conversationId)) { setActiveId(conversationId); return; }
    setActiveId(items[0]?.id ?? "");
  }, [loaded, startNew, conversationId]);

  const startBlank = useCallback(() => {
    loadedIdRef.current = "";
    ranPendingRef.current = "";
    setActiveId("");
    setMessages([]);
    setFailed(false);
    setArtifact(null);
    setReference(null);
    setPrompt("");
  }, []);

  useEffect(() => {
    if (!activeId) { loadedIdRef.current = ""; return; }
    if (loadedIdRef.current === activeId) return;
    const target = conversationsRef.current.find((item) => item.id === activeId);
    if (!target) return;
    loadedIdRef.current = activeId;
    ranPendingRef.current = "";
    setMessages(target.messages ?? []);
    setMethodId(target.methodId ?? DEFAULT_METHOD_ID);
    setFailed(false);
    setArtifact(null);
    setReference(target.pending?.reference ?? null);
    setPageCount(target.pending?.pageCount ?? target.pageCount ?? "");
  }, [activeId, conversations, loaded]);

  const persist = useCallback(async (id, patch) => {
    const current = conversationsRef.current.find((item) => item.id === id);
    if (!current) return null;
    const saved = await saveConversation({ ...current, ...patch });
    updateConversations((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
    return saved;
  }, [updateConversations]);

  const run = useCallback(async (conversation, job, methodDefinition, modelName) => {
    setSending(true);
    setFailed(false);
    setArtifact(null);
    const context = makeModelContext(conversation);
    const placeholder = { role: "assistant", content: serviceReady
      ? `正在用 ${modelName} 生成“${methodDefinition.label}”，请稍候……`
      : `正在通过本地演示引擎整理“${methodDefinition.label}”方案，不会调用外部模型……` };
    const streaming = [...(conversation.messages ?? []), { role: "user", content: job.prompt }, placeholder];
    setMessages(streaming);
    try {
      await persist(conversation.id, { pending: null, methodId: methodDefinition.id, messages: streaming });
      const result = await onCreate({
        jobType: methodDefinition.jobType,
        prompt: job.prompt,
        modelConfigId: job.modelId ?? undefined,
        parameters: buildCreationParameters({ methodId: methodDefinition.id, modelId: job.modelId, searchEnabled: job.searchEnabled, reference: job.reference, pageCount: job.pageCount }),
        context,
      });
      const finalMessages = [...streaming.slice(0, -1), { role: "assistant", content: responseText(result, methodDefinition), artifact: result?.artifact ?? null }];
      setMessages(finalMessages);
      setArtifact(result?.artifact ?? null);
      setFailed(!result);
      await persist(conversation.id, { messages: finalMessages, methodId: methodDefinition.id, pageCount: job.pageCount ?? "" });
    } catch (error) {
      setFailed(true);
      console.error("[creation] 生成失败", error);
      onNotice?.(error.message || "创作请求失败", "error");
    } finally {
      setSending(false);
    }
  }, [onCreate, onNotice, persist, serviceReady]);

  // 起始页交过来的 pending 任务在此执行（StrictMode 下由 ranPendingRef 去重）。
  useEffect(() => {
    if (!activeId || loadedIdRef.current !== activeId) return;
    const target = conversationsRef.current.find((item) => item.id === activeId);
    const job = target?.pending;
    if (!job || ranPendingRef.current === activeId) return;
    ranPendingRef.current = activeId;
    const modelName = job.modelId ? (models.find((item) => item.id === job.modelId)?.name ?? job.modelId) : model?.name;
    void run(target, job, creationMethod(job.methodId), modelName);
  }, [activeId, conversations, loaded, models, model, run]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async (event) => {
    event.preventDefault();
    const content = prompt.trim();
    if (!content || sending) return;
    if (documentBlocked) { onNotice?.("请选择支持文档生成的模型", "error"); return; }
    if (quotaBlocked) {
      onNotice?.("当前生成额度或并发额度已达到上限，请稍后重试或联系管理员调整额度。", "error");
      return;
    }
    let conversation = conversationsRef.current.find((item) => item.id === activeId) ?? null;
    if (!conversation) {
      try {
        conversation = await saveConversation(createConversation(account.id, methodId, titleFromPrompt(content)));
      } catch {
        onNotice?.("本地对话空间不可用，无法创建新的创作对话", "error");
        return;
      }
      loadedIdRef.current = conversation.id;
      ranPendingRef.current = conversation.id;
      updateConversations((items) => [conversation, ...items]);
      setActiveId(conversation.id);
    }
    setPrompt("");
    setSending(true);
    setFailed(false);
    setArtifact(null);
    const context = makeModelContext(conversation);
    const methodDefinition = creationMethod(methodId);
    const placeholder = { role: "assistant", content: serviceReady
      ? `正在用 ${modelLabel} 生成“${methodDefinition.label}”，请稍候……`
      : `正在通过本地演示引擎整理“${methodDefinition.label}”方案，不会调用外部模型……` };
    const streaming = [...(conversation.messages ?? []), { role: "user", content }, placeholder];
    setMessages(streaming);
    try {
      await persist(conversation.id, { messages: streaming, methodId, title: conversation.title });
      const result = await onCreate({
        jobType: methodDefinition.jobType,
        prompt: content,
        modelConfigId: serviceReady && modelSupportsMethod ? model?.id : undefined,
        parameters: buildCreationParameters({ methodId, modelId: model?.id, searchEnabled: false, reference, pageCount }),
        context,
      });
      const finalMessages = [...streaming.slice(0, -1), { role: "assistant", content: responseText(result, methodDefinition), artifact: result?.artifact ?? null }];
      setMessages(finalMessages);
      setArtifact(result?.artifact ?? null);
      setFailed(!result);
      if (!result) setPrompt(content);
      await persist(conversation.id, { messages: finalMessages, methodId, pageCount });
    } catch (error) {
      setFailed(true);
      console.error("[creation] 生成失败", error);
      onNotice?.(error.message || "创作请求失败", "error");
    } finally {
      setSending(false);
    }
  };

  const removeConversation = async () => {
    const target = conversationsRef.current.find((item) => item.id === activeId);
    if (!target) return;
    const confirmed = await confirmAction({ title: "删除创作对话", message: `确认删除“${target.title}”吗？删除后本地记录无法恢复。`, confirmLabel: "确认删除", danger: true });
    if (!confirmed) return;
    try { await deleteConversation(target.id); } catch { /* 记录已不可读时同样从列表移除。 */ }
    const remaining = conversationsRef.current.filter((item) => item.id !== target.id);
    updateConversations(remaining);
    startBlank();
    if (remaining[0]) setActiveId(remaining[0].id);
  };

  const openConversation = (id) => {
    if (id === activeId) return;
    loadedIdRef.current = "";
    ranPendingRef.current = "";
    setActiveId(id);
    setReference(null);
    setPrompt("");
  };

  return <section className="creation-workspace" aria-label="创作对话">
    <header className="creation-workspace__header">
      <button type="button" onClick={onBack}><ArrowLeft size={16} weight="bold" />返回首页</button>
      <div><p>// {method.eyebrow}</p><h1>{activeConversation?.title ?? "新的创作对话"}</h1></div>
      <span>{sending ? "正在生成" : serviceReady ? "已连接模型服务" : "本地演示模式"}</span>
    </header>

    <div className="creation-workspace__layout">
      <aside className="creation-history" aria-label="历次创作对话">
        <header>
          <div><span>历次对话</span><strong>{conversations.length} 个会话</strong></div>
          <button type="button" onClick={startBlank} aria-label="新建创作对话" title="新建创作对话"><Plus size={16} weight="bold" /></button>
        </header>
        <div className="creation-history__list">
          {conversations.length ? conversations.map((item) => <button
            type="button"
            key={item.id}
            className={item.id === activeId ? "is-active" : ""}
            onClick={() => openConversation(item.id)}
            title={item.title}
          >
            <span>{creationMethod(item.methodId).label}{item.pending ? " · 待生成" : ""}</span>
            <strong>{item.title}</strong>
            <small>{formatConversationTime(item.updatedAt)} · {item.messages?.length ?? 0} 条记录</small>
          </button>) : <p className="creation-history__empty">还没有创作对话，在右侧输入一个想法即可开始。</p>}
        </div>
        {activeConversation && <button type="button" className="creation-history__delete" onClick={removeConversation}><Trash size={14} weight="bold" />删除当前对话</button>}
      </aside>

      <div className="creation-workspace__main">
        <form className="ai-composer" onSubmit={send}>
          <div className="ai-conversation">
            <div className="ai-thread" ref={scrollRef} aria-busy={sending} aria-live="polite">
              {messages.length ? messages.map((message, index) => {
                const isLast = index === messages.length - 1;
                return message.role === "user"
                  ? <div className="ai-message--user" aria-label="你的问题" key={`${index}-${message.role}`}><span className="ai-message__author">你</span><p>{message.content}</p></div>
                  : <div className="ai-message ai-message--assistant" key={`${index}-${message.role}`}><span aria-hidden="true"><ChatCircleDots size={21} weight="regular" /></span><div className="ai-message__body"><span className="ai-message__author">ArtEdu 助教</span><AiMarkdown>{message.content}</AiMarkdown>{(message.artifact || (isLast && artifact)) && <ArtifactBlock artifact={message.artifact || artifact} />}{isLast && failed && <img className="ai-failure-image" src="/assets/generation-failure.png" alt="生成失败占位图" />}</div></div>;
              }) : <div className="ai-thread__empty">
                <Sparkle size={30} weight="duotone" />
                <strong>还没有内容</strong>
                <p>{loadError || "在下方描述你的创作想法；完整回复会在这块阅读区展开，历次对话保存在左侧。"}</p>
              </div>}
            </div>
            <label htmlFor="artedu-thread-prompt" className="sr-only">继续描述你的创作想法</label>
            <textarea
              id="artedu-thread-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={method.placeholder}
              rows={3}
              disabled={sending}
            />
          </div>

          <div className="ai-composer__footer">
            <DocumentOptions method={method} pageCount={pageCount} onChange={setPageCount} disabled={sending} />
            <div className="model-picker">
              <span>{serviceReady ? "模型接口" : "演示参数"}</span>
              <div className="model-picker__row"><select aria-label="选择大模型" value={model?.id ?? ""} onChange={(event) => setModelId(event.target.value)}>{models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            </div>
            <div className="ai-composer__controls">
              <div className="ai-composer__actions">
                <input ref={referenceInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.docx,.pptx" onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const uploaded = await uploadTemporaryCreationFile(file, activeConversation?.id);
                    setReference({ id: uploaded.id, fileName: uploaded.fileName, sizeBytes: uploaded.sizeBytes, expiresAt: uploaded.expiresAt });
                    onNotice?.(`“${uploaded.fileName}”已临时上传，72 小时未活动后自动删除`, "success");
                  } catch (error) { onNotice?.(error.message || "文件上传失败", "error"); }
                  event.target.value = "";
                }} />
                <button type="button" className="ai-attach" aria-label="添加本机参考文件" title={reference ? `已选择：${reference.fileName}` : "本机临时参考文件"} onClick={() => referenceInput.current?.click()}><Paperclip size={18} weight="bold" /></button>
                <CapabilityPicker methodId={methodId} onChange={setMethodId} align="end" />
                <button type="submit" className="ai-submit" disabled={!prompt.trim() || sending || quotaBlocked || documentBlocked}>
                  {sending ? "生成中" : quotaBlocked ? "额度已用尽" : "继续创作"} <ArrowRight size={18} weight="bold" />
                </button>
              </div>
            </div>
          </div>

          <div className="ai-composer__status">
            <span>{method.label} · {modelLabel}</span>
            {reference && <span title="临时参考文件独立占用服务器配额">参考文件：{reference.fileName}</span>}
            <span>{quota.dailyLimit === null || quota.dailyLimit === undefined ? "今日额度未限制" : `今日剩余 ${Math.max(0, quota.dailyLimit - quota.dailyUsed)} / ${quota.dailyLimit}`}</span>
            <em>对话保存在本机浏览器 · 仅当前账号可见</em>
          </div>
        </form>
      </div>
    </div>
  </section>;
}

function responseText(result, methodDefinition) {
  if (!result) return "创作请求失败，输入已保留。请根据错误提示重试。";
  if (result.local) return `${result.content}\n\n本次为本地演示结果，任务已写入数据库并完成审计；接入正式模型后可沿用同一创作入口。`;
  if (result.content) return result.content;
  return `任务 ${String(result.id).slice(0, 8)} 已创建（${methodDefinition.label}）。你可以继续输入下一步。`;
}

// 图片产物直接内联展示（下载路由对该类型返回 inline），文档仍只给下载入口。
function ArtifactBlock({ artifact }) {
  if (!String(artifact?.mimeType ?? "").startsWith("image/")) {
    return <a className="ai-download" href={artifact.downloadUrl} download>{`下载 ${artifact.fileName}`}</a>;
  }
  return <figure className="ai-artifact">
    <a href={artifact.downloadUrl} target="_blank" rel="noopener noreferrer" title="打开原图">
      <img src={artifact.downloadUrl} alt={artifact.fileName} loading="lazy" />
    </a>
    <figcaption>
      <span>{artifact.fileName}</span>
      <a href={artifact.downloadUrl} download>下载原图</a>
    </figcaption>
  </figure>;
}
