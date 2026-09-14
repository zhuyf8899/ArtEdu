import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, ArrowLeft, ArrowRight, ChatCircleDots, Copy, PaperPlaneTilt, Paperclip, PencilSimple, Plus, Sparkle, Stop, Trash } from "@phosphor-icons/react";
import { AiMarkdown, safeReplyUrl } from "./AiMarkdown.js";
import { CapabilityPicker } from "./CapabilityPicker.jsx";
import { DocumentOptions } from "./DocumentOptions.jsx";
import { supportsCreationMethod } from "./creation-capabilities.js";
import {
  DEFAULT_METHOD_ID, FALLBACK_MODELS, buildCreationParameters, creationMethod, formatConversationTime, resolveCreationOperation, titleFromPrompt,
} from "./creationMethods.js";
import {
  createConversation, deleteConversation, listConversations, makeModelContext, saveConversation,
} from "./conversationStore.js";
import { uploadTemporaryCreationFile } from "./services/adminApi.js";
import { useFeedback } from "./FeedbackCenter.jsx";

// 专用创作对话页：左侧历次对话，右侧长文本阅读区与续写输入。
// 起始页提交的需求以 pending 形式落进本地对话，由本页接管真实的模型/演示调用。
export function AiCreationWorkspace({ account, creation, ready = true, onCreate, onNotice, startNew = false, conversationId = "", onBack = () => {} }) {
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
  const [searchEnabled, setSearchEnabled] = useState(false);
  const { confirmAction } = useFeedback();

  const conversationsRef = useRef([]);
  const loadedIdRef = useRef("");
  const ranPendingRef = useRef("");
  const scrollRef = useRef(null);
  const referenceInput = useRef(null);
  // 本轮生成的取消句柄：暂停输出只中断当前这一轮，不影响后续请求。
  const abortRef = useRef(null);

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

  const modelLabel = model?.name ?? "未选择模型";

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
    setSearchEnabled(false);
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
    setSearchEnabled(target.pending?.searchEnabled === true);
  }, [activeId, conversations, loaded]);

  const persist = useCallback(async (id, patch) => {
    const current = conversationsRef.current.find((item) => item.id === id);
    if (!current) return null;
    const saved = await saveConversation({ ...current, ...patch });
    updateConversations((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
    return saved;
  }, [updateConversations]);

  // 暂停不是失败：保留已渲染的内容、把输入回填输入框，且不弹错误提示
  // （错误提示会让人以为请求坏了）。服务端那一次调用可能仍在收尾，但界面上
  // 控制权已经交还用户，可以改完直接重新发送。
  const settlePaused = useCallback(async (conversationId, streaming, promptText) => {
    setPrompt(promptText);
    // 已经流出来的正文要留住——暂停不等于丢弃，只补一句说明。
    const partial = streaming[streaming.length - 1]?.content ?? "";
    const pauseNote = "已暂停本次输出，输入已保留，可直接重新发送继续。";
    const pausedMessages = [...streaming.slice(0, -1), {
      role: "assistant",
      content: partial ? `${partial}\n\n（${pauseNote}）` : pauseNote,
      paused: true,
    }];
    setMessages(pausedMessages);
    await persist(conversationId, { pending: null, messages: pausedMessages }).catch(() => {});
  }, [persist]);

  /**
   * 统一的生成入口：发送、起始页带过来的 pending 任务、「重新输出」都走这里。
   *
   * · baseMessages 决定"从哪一轮开始"——「重新输出」传入截断后的历史，
   *   上一轮的回复就此被清除，而不是追加在它下面。
   * · onDelta 接住服务端推来的正文增量，气泡逐字长出来，不再转圈等一整段。
   */
  const generate = useCallback(async ({ conversation, baseMessages, content, operationDefinition, methodId: usedMethodId, searchEnabled: usedSearch, reference: usedReference, pageCount: usedPageCount, modelId, modelName }) => {
    setSending(true);
    setFailed(false);
    setArtifact(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const context = makeModelContext(conversation);
    // 空气泡 + 占位文案：支持流式的场景一到增量就顶掉占位文案；
    // 不支持流式的场景（生图/文档）继续显示占位，行为与改动前一致。
    const placeholderText = serviceReady
      ? `正在用 ${modelName} 处理“${operationDefinition.label}”，请稍候……`
      : `正在通过本地演示引擎处理“${operationDefinition.label}”，不会调用外部模型……`;
    let rendered = [...baseMessages, { role: "user", content }, { role: "assistant", content: "", placeholder: placeholderText, streaming: true }];
    setMessages(rendered);
    const onDelta = (text) => {
      const last = rendered[rendered.length - 1];
      rendered = [...rendered.slice(0, -1), { ...last, content: `${last.content ?? ""}${text}` }];
      setMessages(rendered);
    };
    try {
      await persist(conversation.id, { pending: null, methodId: usedMethodId, messages: rendered });
      const result = await onCreate({
        jobType: operationDefinition.jobType,
        prompt: content,
        modelConfigId: modelId ?? undefined,
        parameters: buildCreationParameters({ methodId: operationDefinition.id, advisoryMethodId: usedMethodId, modelId, searchEnabled: usedSearch, reference: usedReference, pageCount: usedPageCount }),
        context,
      }, controller.signal, onDelta);
      const finalMessages = [...rendered.slice(0, -1), { role: "assistant", content: responseText(result, operationDefinition), artifact: result?.artifact ?? null, sources: result?.sources ?? null }];
      setMessages(finalMessages);
      setArtifact(result?.artifact ?? null);
      setFailed(!result);
      if (!result) setPrompt(content);
      await persist(conversation.id, { messages: finalMessages, methodId: usedMethodId, pageCount: usedPageCount ?? "" });
    } catch (error) {
      if (error?.name === "AbortError") {
        await settlePaused(conversation.id, rendered, content);
        return;
      }
      setFailed(true);
      setPrompt(content);
      const failedMessages = [...rendered.slice(0, -1), { role: "assistant", content: error.message || "请求失败，请重试", failed: true }];
      setMessages(failedMessages);
      await persist(conversation.id, { pending: null, messages: failedMessages }).catch(() => {});
      console.error("[creation] 生成失败", error);
      onNotice?.(error.message || "创作请求失败", "error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
  }, [onCreate, onNotice, persist, serviceReady, settlePaused]);

  // 起始页带过来的 pending 任务：转成统一入口的参数后执行。
  const run = useCallback(async (conversation, job, modeDefinition, modelName) => {
    const operationDefinition = creationMethod(job.operationMethodId ?? resolveCreationOperation(job.prompt, modeDefinition.id).id);
    await generate({
      conversation,
      baseMessages: conversation.messages ?? [],
      content: job.prompt,
      operationDefinition,
      methodId: modeDefinition.id,
      searchEnabled: job.searchEnabled,
      reference: job.reference,
      pageCount: job.pageCount,
      modelId: job.modelId,
      modelName,
    });
  }, [generate]);

  // 起始页交过来的 pending 任务在此执行（StrictMode 下由 ranPendingRef 去重）。
  useEffect(() => {
    if (!ready || !activeId || loadedIdRef.current !== activeId) return;
    const target = conversationsRef.current.find((item) => item.id === activeId);
    const job = target?.pending;
    if (!job || ranPendingRef.current === activeId) return;
    ranPendingRef.current = activeId;
    const modelName = job.modelId ? (models.find((item) => item.id === job.modelId)?.name ?? job.modelId) : model?.name;
    void run(target, job, creationMethod(job.methodId), modelName);
  }, [activeId, conversations, loaded, models, model, run, ready]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async (event) => {
    event.preventDefault();
    const content = prompt.trim();
    if (!content || sending || !ready) return;
    const operationDefinition = resolveCreationOperation(content, methodId);
    const modelSupportsOperation = supportsCreationMethod(model, operationDefinition.jobType);
    const operationNeedsSelectedModel = !["image", "pattern"].includes(operationDefinition.jobType);
    if (serviceReady && operationNeedsSelectedModel && !modelSupportsOperation) { onNotice?.(`请选择支持${operationDefinition.label}的模型`, "error"); return; }
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
    await generate({
      conversation,
      baseMessages: conversation.messages ?? [],
      content,
      operationDefinition,
      methodId,
      searchEnabled,
      reference,
      pageCount,
      modelId: serviceReady && modelSupportsOperation ? model?.id : undefined,
      modelName: modelLabel,
    });
  };

  // 暂停输出：中断本轮在途请求。已渲染的内容与输入都保留，可直接重新发送继续。
  const pauseOutput = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const copyReply = useCallback(async (content) => {
    try {
      await navigator.clipboard.writeText(content);
      onNotice?.("回复已复制", "success");
    } catch {
      onNotice?.("浏览器未授予复制权限，请手动选择文本复制", "error");
    }
  }, [onNotice]);

  /**
   * 「重新输出」：**清除这一轮的回复**，然后用同一个问题直接重新生成，
   * 而不是把问题回填输入框、等用户再点一次发送。
   * 历史截断到该提问之前，所以这一轮之后的对话也一并作废——分支重置，语义干净。
   */
  const retryReply = useCallback(async (index) => {
    if (sending || !ready) return;
    const previousUser = [...messages.slice(0, index)].reverse().find((message) => message.role === "user");
    if (!previousUser?.content) return;
    const conversation = conversationsRef.current.find((item) => item.id === activeId);
    if (!conversation) return;
    const operationDefinition = resolveCreationOperation(previousUser.content, methodId);
    const modelSupportsOperation = supportsCreationMethod(model, operationDefinition.jobType);
    const operationNeedsSelectedModel = !["image", "pattern"].includes(operationDefinition.jobType);
    if (serviceReady && operationNeedsSelectedModel && !modelSupportsOperation) { onNotice?.(`请选择支持${operationDefinition.label}的模型`, "error"); return; }
    if (quotaBlocked) {
      onNotice?.("当前生成额度或并发额度已达到上限，请稍后重试或联系管理员调整额度。", "error");
      return;
    }
    onNotice?.("已清除上一轮输出，正在重新生成…", "success");
    await generate({
      conversation,
      // 只保留这条提问之前的历史：上一轮的回复（连同它之后的对话）就地清除。
      baseMessages: messages.slice(0, Math.max(0, index - 1)),
      content: previousUser.content,
      operationDefinition,
      methodId,
      searchEnabled,
      reference,
      pageCount,
      modelId: serviceReady && modelSupportsOperation ? model?.id : undefined,
      modelName: modelLabel,
    });
  }, [activeId, generate, messages, methodId, model, modelLabel, onNotice, pageCount, quotaBlocked, ready, reference, searchEnabled, sending, serviceReady]);

  const editPrompt = useCallback((content) => {
    setPrompt(content);
    onNotice?.("已带回输入框，可修改后重新发送", "success");
  }, [onNotice]);

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

  // Enter 提交；Ctrl+Enter（以及 Shift/Alt/Meta+Enter）保留为换行。
  // isComposing 防止中文输入法确认候选词时被误判为发送。
  const handlePromptKeyDown = (event) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    if (prompt.trim() && !sending && !quotaBlocked) event.currentTarget.form?.requestSubmit();
  };

  const suggestions = method.suggestions?.length ? method.suggestions : ["讲讲宋代山水画的构图特点，再给我三条临摹练习建议。"];

  return <section className="creation-canvas" aria-label="创作对话">
    <header className="creation-canvas__header">
      <button type="button" className="creation-canvas__back" onClick={onBack}><ArrowLeft size={17} weight="bold" />返回</button>
      <div className="creation-canvas__identity"><span>ARTEDU</span><i />创作空间</div>
      <div className="creation-canvas__header-actions">
        <span className={sending ? "is-working" : ""}><i />{sending ? "正在生成" : serviceReady ? "模型服务在线" : "本地演示模式"}</span>
        <button type="button" onClick={startBlank}><Plus size={16} weight="bold" />新对话</button>
      </div>
    </header>

    <nav className="creation-canvas__history" aria-label="历次创作对话">
      <div className="creation-canvas__history-label"><ChatCircleDots size={17} weight="bold" /><span>会话</span><b>{conversations.length}</b></div>
      <div className="creation-canvas__history-list">
        {conversations.length ? conversations.map((item) => <button
          type="button"
          key={item.id}
          className={item.id === activeId ? "is-active" : ""}
          onClick={() => openConversation(item.id)}
          title={item.title}
        >
          <span>{creationMethod(item.methodId).label}</span>
          <strong>{item.title}</strong>
          <small>{item.pending ? "处理中" : formatConversationTime(item.updatedAt)}</small>
        </button>) : <p>新对话会保存在这里。</p>}
      </div>
      {activeConversation && <button type="button" className="creation-canvas__delete" onClick={removeConversation} aria-label="删除当前对话" title="删除当前对话"><Trash size={16} weight="bold" /></button>}
    </nav>

    <main className="creation-canvas__main">
      <section className="creation-canvas__conversation ai-conversation">
        <header className="creation-canvas__conversation-title"><div><p>{method.eyebrow}</p><h1>{activeConversation?.title ?? "新的创作对话"}</h1></div><span>建议模式：{method.label}</span></header>
        <div className="ai-thread creation-canvas__thread" ref={scrollRef} aria-busy={sending} aria-live="polite">
              {messages.length ? messages.map((message, index) => {
                const isLast = index === messages.length - 1;
                return message.role === "user"
                  ? <div className="ai-message--user" aria-label="你的问题" key={`${index}-${message.role}`}><span className="ai-message__author">你</span><p>{message.content}</p><button type="button" className="ai-message__action" onClick={() => editPrompt(message.content)}><PencilSimple size={14} />编辑</button></div>
                  : <div className={`ai-message ai-message--assistant${message.streaming ? " ai-message--streaming" : ""}`} key={`${index}-${message.role}`}><span aria-hidden="true"><ChatCircleDots size={21} weight="regular" /></span><div className="ai-message__body"><span className="ai-message__author">{message.paused ? "已暂停" : message.failed ? "请求未完成" : "ArtEdu 助教"}</span><AiMarkdown>{message.content || message.placeholder}</AiMarkdown>{(message.sources?.length ?? 0) > 0 && <SourcesBlock sources={message.sources} />}{(message.artifact || (isLast && artifact)) && <ArtifactBlock artifact={message.artifact || artifact} />}<div className="ai-message__actions"><button type="button" onClick={() => copyReply(message.content)} title="复制回复"><Copy size={14} />复制</button><button type="button" onClick={() => retryReply(index)} title="清除这一轮的回复并重新生成"><ArrowClockwise size={14} />重新输出</button></div></div></div>;
              }) : <div className="ai-thread__empty creation-canvas__empty">
                <span><Sparkle size={25} weight="fill" /></span>
                <strong>今天，想弄明白什么？</strong>
                <p>{loadError || "提问、讲解、思路梳理，直接说就行；需要产物时，在这句话里明确写出“生成图片 / 生成网页 / 生成 PPT”等意图。"}</p>
                <div>
                  {suggestions.map((item) => <button type="button" key={item} onClick={() => setPrompt(item)}>{titleFromPrompt(item)}</button>)}
                </div>
              </div>}
        </div>
      </section>

      <form className="creation-canvas__composer" onSubmit={send}>
        <div className="creation-canvas__input">
              <label htmlFor="artedu-thread-prompt" className="sr-only">继续描述你的创作想法</label>
              <textarea id="artedu-thread-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={handlePromptKeyDown} placeholder={method.placeholder} rows={2} disabled={sending} />
              <div className="creation-canvas__toolbar">
                <div className="creation-canvas__tools">
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
                <CapabilityPicker methodId={methodId} onChange={setMethodId} align="end" label="建议模式" />
                <div className="model-picker"><select aria-label="选择大模型" value={model?.id ?? ""} onChange={(event) => setModelId(event.target.value)}>{models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                <button type="button" className={`search-toggle ${searchEnabled ? "is-active" : ""}`} aria-pressed={searchEnabled} onClick={() => setSearchEnabled((enabled) => !enabled)} title={searchEnabled ? "搜索能力已开启" : "搜索能力已关闭"}>搜索 <b>{searchEnabled ? "开" : "关"}</b></button>
                <DocumentOptions method={method} pageCount={pageCount} onChange={setPageCount} disabled={sending} />
                </div>
                <button type="submit" className="ai-submit" disabled={!prompt.trim() || sending || quotaBlocked}>
                  {sending ? "生成中" : quotaBlocked ? "额度已用尽" : "发送"} <PaperPlaneTilt size={18} weight="fill" />
                </button>
                {sending && <button type="button" className="ai-pause" onClick={pauseOutput} title="中断本次输出；已渲染的内容与输入都会保留">
                  <Stop size={15} weight="fill" />暂停输出
                </button>}
              </div>
            </div>
      </form>
    </main>
  </section>;
}

function responseText(result, methodDefinition) {
  if (!result) return "创作请求失败，输入已保留。请根据错误提示重试。";
  if (result.local) return `${result.content}\n\n本次为本地演示结果，任务已写入数据库并完成审计；接入正式模型后可沿用同一创作入口。`;
  if (result.content) return result.content;
  return `任务 ${String(result.id).slice(0, 8)} 已创建（${methodDefinition.label}）。你可以继续输入下一步。`;
}

/**
 * 联网检索来源卡片。
 *
 * 只渲染平台本轮真正检索到的链接：没有来源就不渲染，不做任何假占位。
 * 链接统一走 safeReplyUrl（与模型回复共用同一套 URL 安全规则），
 * 非 http(s) 或带凭据的地址一律不渲染成可点链接。
 */
function SourcesBlock({ sources }) {
  const safe = sources
    .map((source) => ({ title: String(source?.title ?? ""), href: safeReplyUrl(String(source?.url ?? "")) }))
    .filter((source) => source.href);
  if (!safe.length) return null;
  return <div className="ai-sources">
    <span className="ai-sources__label">检索来源 · {safe.length}</span>
    <ol>
      {safe.map((source) => <li key={source.href}>
        <a href={source.href} target="_blank" rel="noopener noreferrer">{source.title || source.href}</a>
      </li>)}
    </ol>
  </div>;
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
