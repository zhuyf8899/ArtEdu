/**
 * 【创作对话页】管理对话选择、输入、流式回复和暂停；通过上层回调请求执行，通过 conversationStore 保存浏览器对话。阅读时先追发送与暂停流程，再看消息渲染和布局。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, ArrowLeft, ArrowRight, ChatCircleDots, Copy, DotsThreeVertical, PaperPlaneTilt, Paperclip, PencilSimple, Plus, SidebarSimple, Sparkle, Stop, Trash, X } from "@phosphor-icons/react";
import { AiMarkdown, safeReplyUrl } from "./AiMarkdown.js";
import { ZoomableImage } from "./ImageLightbox.jsx";
import { isImageArtifact } from "./imageSources.js";
import { CapabilityPicker } from "./CapabilityPicker.jsx";
import { DocumentOptions } from "./DocumentOptions.jsx";
import { supportsCreationMethod } from "./creation-capabilities.js";
import {
  DEFAULT_METHOD_ID, FALLBACK_MODELS, buildCreationParameters, creationMethod, formatConversationTime, promptForOperation, resolveCreationOperation, titleFromPrompt,
} from "./creationMethods.js";
import {
  createConversation, deleteConversation, listConversations, makeModelContext, saveConversation, taskStateFor,
} from "./conversationStore.js";
import { uploadTemporaryCreationFile } from "./services/adminApi.js";
import { archiveArtifacts } from './localArtifacts.js';
import { LocalArtifact } from './LocalArtifact.jsx';
import { createDeltaBuffer } from "./chatStream.js";
import { activityLabel, appendActivity, settleActivity, recoverExecution, visibleActivities } from './agentActivity.js';
import { findReplyIndex, mergeFollowupQuestions, parseFollowupQuestions, withSuggestions } from "./followupQuestions.js";
import { useFeedback } from "./FeedbackCenter.jsx";
import { useUnsavedChanges } from './useUnsavedChanges.js';

// 专用创作对话页：左侧历次对话，右侧长文本阅读区与续写输入。
// 起始页提交的需求以 pending 形式落进本地对话，由本页接管真实的模型/演示调用。
export function AiCreationWorkspace({ account, creation, ready = true, onCreate, onSuggest, onNotice, showHistory = false, startNew = false, conversationId = "", onBack = () => {} }) {
  const [conversations, setConversations] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState([]);
  const [methodId, setMethodId] = useState(DEFAULT_METHOD_ID);
  const [modelId, setModelId] = useState(FALLBACK_MODELS[0].id);
  const [prompt, setPrompt] = useState("");
  const [runningIds, setRunningIds] = useState([]);
  const executionsRef = useRef(new Map());
  const creatingRef = useRef(false);
  const sending = runningIds.includes(activeId);
  const [failed, setFailed] = useState(false);
  const [reference, setReference] = useState(null);
  useUnsavedChanges(!sending&&Boolean(prompt.trim()),{label:'尚未发送的创作输入'});
  const [pageCount, setPageCount] = useState("");
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [openConversationMenuId, setOpenConversationMenuId] = useState("");
  // 会话列表常驻左侧栏，可收起；偏好记在本机，刷新后保持。
  const [historyOpen, setHistoryOpen] = useState(() => {
    try { return localStorage.getItem("artedu-creation-history-open") !== "0"; } catch { return true; }
  });
  const [suggestingFor, setSuggestingFor] = useState(null);
  useEffect(() => { if (showHistory) setHistoryOpen(true); }, [showHistory]);
  const { confirmAction } = useFeedback();

  const conversationsRef = useRef([]);
  // 消息列表的"最新值"引用：让「重新输出」这类回调保持稳定，不必把 messages 放进依赖。
  // 否则它每帧都会换一个函数身份，memo 化的消息行每次增量都要全部重渲染，性能改良就白做了。
  const messagesRef = useRef([]);
  const loadedIdRef = useRef("");
  const ranPendingRef = useRef("");
  const scrollRef = useRef(null);
  const followOutputRef = useRef(true);
  // 进入对话、切换对话、发出新一轮时置位：无论用户上次停在哪里，都必须落到最新消息处。
  // 平时（流式输出时）才用"离底部近才跟随"的保守规则，避免抢用户翻看历史的滚动。
  const jumpToBottomRef = useRef(false);
  const referenceInput = useRef(null);
  const promptInput = useRef(null);
  const activeIdRef = useRef("");
  // 草稿按会话保留，切换时不把上一会话的输入带入新会话。
  const draftsRef = useRef(new Map());

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

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => {
    try { localStorage.setItem("artedu-creation-history-open", historyOpen ? "1" : "0"); } catch { /* 隐私模式下忽略 */ }
  }, [historyOpen]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const updateConversations = useCallback((updater) => {
    // SSE events can arrive before React commits its next render. Update the
    // persistence source synchronously so an old pending job cannot be revived.
    const next = typeof updater === "function" ? updater(conversationsRef.current) : updater;
    conversationsRef.current = next;
    setConversations(next);
  }, []);

  const modelLabel = model?.name ?? "未选择模型";

  // 载入本地对话列表；IndexedDB 不可用时页面仍可读，只是不再持久化。
  useEffect(() => {
    let cancelled = false;
    void listConversations(account.id).then((records) => {
      if (cancelled) return;
      const items = records.map(recoverExecution);
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
    if (startNew) { activeIdRef.current = ""; loadedIdRef.current = ""; setActiveId(""); setMessages([]); setPrompt(""); return; }
    const items = conversationsRef.current;
    if (conversationId && items.some((item) => item.id === conversationId)) { activeIdRef.current = conversationId; setActiveId(conversationId); return; }
    setActiveId(items[0]?.id ?? "");
  }, [loaded, startNew, conversationId]);

  const startBlank = useCallback(() => {
    if (activeIdRef.current) draftsRef.current.set(activeIdRef.current, prompt);
    activeIdRef.current = "";
    loadedIdRef.current = "";
    ranPendingRef.current = "";
    setActiveId("");
    setMessages([]);
    setFailed(false);
    setReference(null);
    setPrompt("");
    setSearchEnabled(false);
    setSuggestingFor(null);
  }, [prompt]);

  useEffect(() => {
    if (!activeId) { loadedIdRef.current = ""; return; }
    if (loadedIdRef.current === activeId) return;
    const target = conversationsRef.current.find((item) => item.id === activeId);
    if (!target) return;
    loadedIdRef.current = activeId;
    ranPendingRef.current = "";
    setMessages(executionsRef.current.get(activeId)?.messages ?? target.messages ?? []);
    setMethodId(target.methodId ?? DEFAULT_METHOD_ID);
    setFailed(false);
    setReference(target.reference ?? target.pending?.reference ?? null);
    setPageCount(target.pending?.pageCount ?? target.pageCount ?? "");
    setSearchEnabled(target.pending?.searchEnabled === true);
    setSuggestingFor(null);
    jumpToBottomRef.current = true;
  }, [activeId, conversations, loaded]);

  const persist = useCallback(async (id, patch) => {
    const current = conversationsRef.current.find((item) => item.id === id);
    if (!current) return null;
    const next = { ...current, ...patch };
    updateConversations((items) => [next, ...items.filter((item) => item.id !== id)]);
    // Serialize writes per conversation; a slow activity snapshot must never
    // overwrite a later final reply. Different conversations write independently.
    const execution = executionsRef.current.get(id);
    const write = (execution?.writes ?? Promise.resolve()).catch(() => {}).then(() => saveConversation(next));
    if (execution) execution.writes = write;
    const saved = await write;
    if (conversationsRef.current.find(item => item.id === id) === next) {
      updateConversations(items => [saved, ...items.filter(item => item.id !== id)]);
    }
    return saved;
  }, [updateConversations]);

  // 暂停不是失败：保留已渲染的内容、把输入回填输入框，且不弹错误提示
  // （错误提示会让人以为请求坏了）。服务端那一次调用可能仍在收尾，但界面上
  // 控制权已经交还用户，可以改完直接重新发送。
  const settlePaused = useCallback(async (conversationId, streaming, promptText, checkpoint, localArtifacts = []) => {
    if (activeIdRef.current === conversationId) setPrompt(promptText);
    else draftsRef.current.set(conversationId, promptText);
    // 已经流出来的正文要留住——暂停不等于丢弃，只补一句说明。
    const partial = streaming[streaming.length - 1]?.content ?? "";
    const pauseNote = "已暂停本次输出，输入已保留，可直接重新发送继续。";
    const pausedMessages = [...streaming.slice(0, -1), {
      ...streaming[streaming.length - 1],
      role: "assistant",
      content: partial ? `${partial}\n\n（${pauseNote}）` : pauseNote,
      paused: true,
      status:'paused',
      ...(checkpoint?{delivery:{...checkpoint,status:'paused'}}:{}),
      localArtifacts,
      streaming: false,
      activity: settleActivity(streaming[streaming.length - 1]?.activity, 'paused'),
    }];
    if (activeIdRef.current === conversationId) setMessages(pausedMessages);
    await persist(conversationId, { pending: null, messages: pausedMessages, savedArtifacts: [...(conversationsRef.current.find(item => item.id === conversationId)?.savedArtifacts ?? []), ...localArtifacts.filter(item => item.localArchiveId)] }).catch(() => {});
  }, [persist]);

  /**
   * 统一的生成入口：发送、起始页带过来的 pending 任务、「重新输出」都走这里。
   *
   * · baseMessages 决定"从哪一轮开始"——「重新输出」传入截断后的历史，
   *   上一轮的回复就此被清除，而不是追加在它下面。
   * · onDelta 接住服务端推来的正文增量，气泡逐字长出来，不再转圈等一整段。
   */
  const generate = useCallback(async ({ conversation, baseMessages, content, operationDefinition, methodId: usedMethodId, searchEnabled: usedSearch, reference: usedReference, pageCount: usedPageCount, modelId, modelName }) => {
    if (executionsRef.current.has(conversation.id)) return;
    const controller = new AbortController();
    const execution = { controller, messages: [], writes: Promise.resolve() };
    executionsRef.current.set(conversation.id, execution);
    setRunningIds([...executionsRef.current.keys()]);
    const isActive = () => activeIdRef.current === conversation.id;
    const displayMessages = (items) => {
      execution.messages = items;
      if (isActive()) { messagesRef.current = items; setMessages(items); }
    };
    if (isActive()) { setSuggestingFor(null); setFailed(false); }
    const context = makeModelContext(conversation, baseMessages);
    // 空气泡 + 占位文案：支持流式的场景一到增量就顶掉占位文案；
    // 不支持流式的场景（生图/文档）继续显示占位，行为与改动前一致。
    const placeholderText = serviceReady
      ? `正在用 ${modelName} 处理“${operationDefinition.label}”，请稍候……`
      : `正在通过本地演示引擎处理“${operationDefinition.label}”，不会调用外部模型……`;
    const attachmentName = usedReference?.fileName ? `\n\n📎 已附参考文件：${usedReference.fileName}` : "";
    let rendered = [...baseMessages, { role: "user", content: `${content}${attachmentName}`, attachment: usedReference ?? null }, { role: "assistant", content: "", placeholder: placeholderText, streaming: true }];
    displayMessages(rendered);
    if (isActive()) jumpToBottomRef.current = true;
    // 增量先合帧再上屏：SSE 一秒可能来几十帧，逐帧 setState 会让长回复越写越卡。
    const deltaBuffer = createDeltaBuffer({
      onFlush: (text) => {
        const last = rendered[rendered.length - 1];
        rendered = [...rendered.slice(0, -1), { ...last, content: `${last.content ?? ""}${text}` }];
        displayMessages(rendered);
      },
    });
    const onDelta = (text) => { deltaBuffer.push(text); };
    let activityWrites = Promise.resolve();
    const onProgress = (event) => {
      if (controller.signal.aborted) return;
      const last = rendered[rendered.length - 1];
      const activity = appendActivity(last.activity, event);
      if (activity === last.activity&&(!event.runId||event.runId===last.runId)) return;
      rendered = [...rendered.slice(0,-1), { ...last, activity,...(event.runId?{runId:event.runId}:{}) }];
      displayMessages(rendered);
      if (event.kind === 'tool' && event.status === 'failed') onNotice?.(activityLabel(event), 'error');
      if(event.status==='running'||event.kind==='model')return;
      const snapshot = rendered;
      activityWrites = activityWrites.then(() => persist(conversation.id, { pending: null, messages: snapshot })).catch(() => {});
    };
    try {
      await persist(conversation.id, { pending: null, methodId: usedMethodId, messages: rendered });
      onProgress({id:'run',kind:'run',name:'agent.execute',status:'running'});
      const result = await onCreate({
        jobType: operationDefinition.jobType,
        // 生图模式下只在提示词尾部补一句「用户可能希望生成图片」：不强制、也不改路由判定，
        // 服务端仍按文本推断交付类型。
        prompt: promptForOperation(content, usedMethodId),
        modelConfigId: modelId ?? undefined,
        parameters: {...buildCreationParameters({ methodId: operationDefinition.id, advisoryMethodId: usedMethodId, modelId, searchEnabled: usedSearch, reference: usedReference, pageCount: usedPageCount }),conversationLocalId: conversation.id, previousTask:taskStateFor(baseMessages,conversation.memoryState)},
        context,
      }, controller.signal, onDelta, onProgress);
      let localArtifacts = [];
      if (result) {
        const artifacts = [...(result.delivery?.artifacts ?? [])];
        if (result.localFile?.downloadUrl && !artifacts.some(a => a.openUrl === result.localFile.downloadUrl)) artifacts.push({ path: result.localFile.fileName, openUrl: result.localFile.downloadUrl, kind: isImageArtifact(result.localFile) ? 'image' : 'document' });
        const archived = await archiveArtifacts(account.id, conversation.id, artifacts);
        localArtifacts = archived.artifacts;
        if (archived.failures.length) onNotice?.('部分成果未能保存到本机，请在链接过期前下载文件', 'error');
      }
      const status=result?.status??(result?'succeeded':'failed');
      onProgress({id:'run',kind:'run',name:'agent.execute',status});
      await activityWrites;
      // 最终正文以服务端返回为准，尚未画出的那一帧不必再补。
      deltaBuffer.cancelFrame();
      const finalMessages = [...rendered.slice(0, -1), { role: "assistant", status, delivery:result?.delivery, localArtifacts, activity: settleActivity(rendered[rendered.length-1]?.activity, status), content: responseText(result, operationDefinition), sources: result?.sources ?? null, localFile: result?.localFile ?? null }];
      displayMessages(finalMessages);
      if (isActive()) { setFailed(!result); if (!result) setPrompt(content); }
      await persist(conversation.id, { messages: finalMessages, methodId: usedMethodId, pageCount: usedPageCount ?? "", savedArtifacts: [...(conversationsRef.current.find(item => item.id === conversation.id)?.savedArtifacts ?? []), ...localArtifacts.filter(item => item.localArchiveId)] });
      if (result&&status==='succeeded') {
        const replyIndex = finalMessages.length - 1;
        const replyContent = finalMessages[replyIndex].content;
        const stopSuggesting = () => setSuggestingFor((value) => value?.conversationId === conversation.id && value?.replyIndex === replyIndex ? null : value);
        if (isActive()) setSuggestingFor({ conversationId: conversation.id, replyIndex });
        const suggestionModelId = models.find((item) => item.capabilities?.includes("chat"))?.id;
        void (async () => {
          let questions = [];
          try {
            if (suggestionModelId && onSuggest) {
              const raw = await onSuggest({ question: content, answer: replyContent, modelId: suggestionModelId });
              questions = parseFollowupQuestions(raw);
            }
          } catch (error) {
            console.warn("[creation] 建议提问生成失败", error);
          }
          questions = mergeFollowupQuestions(questions);
          // 定位这条回复时不能看数组长度：长对话会被自动压缩，用户也可能已经发了新消息。
          // 按「助手回复 + 正文一致」从后往前找，本地与已落库的两份记录各自定位。
          if (activeIdRef.current === conversation.id) setMessages((items) => withSuggestions(items, findReplyIndex(items, replyContent), questions));
          const current = conversationsRef.current.find((item) => item.id === conversation.id);
          const storedIndex = findReplyIndex(current?.messages, replyContent);
          if (!current || storedIndex === -1) { stopSuggesting(); return; }
          await persist(conversation.id, { messages: withSuggestions(current.messages, storedIndex, questions) }).catch(() => {});
          stopSuggesting();
        })();
      }
    } catch (error) {
      await activityWrites;
      if (error?.name === "AbortError") {
        // 暂停时要把还在缓冲里的最后一段正文交给界面，否则会丢掉已生成的尾巴。
        deltaBuffer.flush();
        const archived = await archiveArtifacts(account.id, conversation.id, error.checkpoint?.delivery?.artifacts ?? []);
        if (archived.failures.length) onNotice?.('部分成果未能保存到本机，请及时下载文件', 'error');
        await settlePaused(conversation.id, rendered, content, error.checkpoint?.delivery, archived.artifacts);
        return;
      }
      deltaBuffer.cancelFrame();
      if (isActive()) { setFailed(true); setPrompt(content); }
      else draftsRef.current.set(conversation.id, content);
      const failedMessages = [...rendered.slice(0, -1), { role: "assistant", activity: settleActivity(rendered[rendered.length-1]?.activity, 'failed'), content: error.message || "请求失败，请重试", failed: true }];
      displayMessages(failedMessages);
      await persist(conversation.id, { pending: null, messages: failedMessages }).catch(() => {});
      console.error("[creation] 生成失败", error);
      onNotice?.(error.message || "创作请求失败", "error");
    } finally {
      if (executionsRef.current.get(conversation.id) === execution) {
        executionsRef.current.delete(conversation.id);
        setRunningIds([...executionsRef.current.keys()]);
      }
    }
  }, [account.id, models, onCreate, onNotice, onSuggest, persist, serviceReady, settlePaused]);

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

  // 跟随输出自动滚到底：流式时正文长度一直在变，所以增量长度也要进依赖；
  // 但用户往回翻看历史时（离底部较远）不抢滚动，直接把控制权留给用户。
  // 例外是"刚进入/刚切换对话/刚发出新一轮"——那时必须无条件落到最新消息，否则会停在顶部。
  const streamingLength = messages[messages.length - 1]?.content?.length ?? 0;
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    // Empty-state guidance starts at the top; it is not a latest chat reply.
    if(!messages.length){node.scrollTo({top:0,behavior:'auto'});return;}
    const force = jumpToBottomRef.current;
    if (force) jumpToBottomRef.current = false;
    if (!force && !followOutputRef.current) return;
    if(force)followOutputRef.current=true;
    node.scrollTo({ top: node.scrollHeight, behavior: "auto" });
  }, [messages.length, streamingLength, messages[messages.length - 1]?.suggestions?.length, suggestingFor]);
  useEffect(()=>{
    const node=scrollRef.current;if(!node||typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(()=>{if(followOutputRef.current)node.scrollTop=node.scrollHeight;});
    [...node.children].forEach(child=>observer.observe(child));return()=>observer.disconnect();
  },[loaded,messages.length]);

  const send = async (event) => {
    event.preventDefault();
    const content = prompt.trim();
    if (!content || executionsRef.current.has(activeIdRef.current) || creatingRef.current || !ready) return;
    const operationDefinition = resolveCreationOperation(content, methodId);
    const modelSupportsOperation = supportsCreationMethod(model, 'chat');
    const operationNeedsSelectedModel = !["image", "pattern"].includes(operationDefinition.jobType);
    if (serviceReady && operationNeedsSelectedModel && !modelSupportsOperation) { onNotice?.(`请选择支持${operationDefinition.label}的模型`, "error"); return; }
    if (quotaBlocked) {
      onNotice?.("当前生成额度或并发额度已达到上限，请稍后重试或联系管理员调整额度。", "error");
      return;
    }
    let conversation = conversationsRef.current.find((item) => item.id === activeId) ?? null;
    if (!conversation) {
      creatingRef.current = true;
      try {
        const created = createConversation(account.id, methodId, titleFromPrompt(content));
        conversation = await saveConversation({ ...created, reference: reference ?? null, attachments: reference ? [reference] : [] });
      } catch {
        onNotice?.("本地对话空间不可用，无法创建新的创作对话", "error");
        return;
      } finally { creatingRef.current = false; }
      activeIdRef.current = conversation.id;
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
    executionsRef.current.get(activeIdRef.current)?.controller.abort();
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
    const messages = messagesRef.current;
    const previousUser = [...messages.slice(0, index)].reverse().find((message) => message.role === "user");
    if (!previousUser?.content) return;
    const conversation = conversationsRef.current.find((item) => item.id === activeId);
    if (!conversation) return;
    const operationDefinition = resolveCreationOperation(previousUser.content, methodId);
    const modelSupportsOperation = supportsCreationMethod(model, 'chat');
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
  }, [activeId, generate, methodId, model, modelLabel, onNotice, pageCount, quotaBlocked, ready, reference, searchEnabled, sending, serviceReady]);

  const editPrompt = useCallback((content) => {
    setPrompt(content);
    onNotice?.("已带回输入框，可修改后重新发送", "success");
  }, [onNotice]);

  // 点一条建议提问＝带回输入框并聚焦，等用户确认后再发送（不擅自替他发问）。
  const pickSuggestion = useCallback((content) => {
    setPrompt(content);
    promptInput.current?.focus();
  }, []);

  const removeConversation = async (targetId = activeId) => {
    const target = conversationsRef.current.find((item) => item.id === targetId);
    if (!target) return;
    if (executionsRef.current.has(targetId)) { onNotice?.("请先暂停该对话，再删除", "error"); return; }
    const confirmed = await confirmAction({ title: "删除创作对话", message: `确认删除“${target.title}”吗？删除后本地记录无法恢复。`, confirmLabel: "确认删除", danger: true });
    if (!confirmed || executionsRef.current.has(targetId)) return;
    try { await deleteConversation(target.id); } catch { /* 记录已不可读时同样从列表移除。 */ }
    const remaining = conversationsRef.current.filter((item) => item.id !== target.id);
    updateConversations(remaining);
    if (target.id === activeIdRef.current) {
      startBlank();
      if (remaining[0]) { activeIdRef.current = remaining[0].id; setActiveId(remaining[0].id); }
    }
  };

  const openConversation = (id) => {
    if (id === activeId) return;
    draftsRef.current.set(activeIdRef.current, prompt);
    activeIdRef.current = id;
    loadedIdRef.current = "";
    ranPendingRef.current = "";
    setActiveId(id);
    setReference(null);
    setPrompt(draftsRef.current.get(id) ?? "");
    setOpenConversationMenuId("");
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
      <div className="creation-canvas__header-left">
        <button type="button" className="creation-canvas__back" onClick={onBack}><ArrowLeft size={17} weight="bold" />返回</button>
        {/* 会话列表常驻左侧；收起后必须留按钮，否则用户找不回历史对话。 */}
        <button type="button" className={`creation-canvas__history-toggle${historyOpen ? " is-open" : ""}`} aria-expanded={historyOpen} aria-controls="artedu-creation-history" aria-label="历史对话" onClick={() => setHistoryOpen((open) => !open)} title={historyOpen ? "收起会话列表" : "展开会话列表"}>
          <SidebarSimple size={16} weight="bold" /><span>记录</span><b>{conversations.length}</b>
        </button>
      </div>
      <div className="creation-canvas__identity"><span>MORPH LAB</span><i />创作空间</div>
      <div className="creation-canvas__header-actions">
        <span className={sending ? "is-working" : ""}><i />{sending ? "正在生成" : serviceReady ? "可以开始创作" : "创作服务暂不可用"}</span>
        <button type="button" onClick={startBlank}><Plus size={16} weight="bold" />新对话</button>
      </div>
    </header>

    <div className={`creation-canvas__body${historyOpen ? "" : " is-history-collapsed"}`}>
    <nav className="creation-canvas__history" id="artedu-creation-history" aria-label="历次创作对话" aria-hidden={historyOpen ? undefined : "true"}>
      <div className="creation-canvas__history-label"><ChatCircleDots size={17} weight="bold" /><span>创作记录</span><b>{conversations.length}</b></div>
      <div className="creation-canvas__history-list">
        {conversations.length ? conversations.map((item) => <div className={`creation-canvas__history-item${item.id === activeId ? " is-active" : ""}`} key={item.id}>
          <button type="button" className="creation-canvas__history-open" onClick={() => openConversation(item.id)} title={item.title}>
            <span>{creationMethod(item.methodId).label}</span>
            <strong>{item.title}</strong>
            <small>{runningIds.includes(item.id) || item.pending ? "处理中" : formatConversationTime(item.updatedAt)}</small>
          </button>
          <button type="button" className="creation-canvas__history-menu-toggle" aria-label={`打开“${item.title}”的更多操作`} aria-expanded={openConversationMenuId === item.id} onClick={() => setOpenConversationMenuId((current) => current === item.id ? "" : item.id)}><DotsThreeVertical size={17} weight="bold" /></button>
          {openConversationMenuId === item.id && <div className="creation-canvas__history-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { setOpenConversationMenuId(""); void removeConversation(item.id); }}><Trash size={15} />删除对话</button>
          </div>}
        </div>) : <p>还没有创作记录，开始后会自动保存在这里。</p>}
      </div>
    </nav>

    <main className="creation-canvas__main">
      <section className="creation-canvas__conversation ai-conversation">
        <header className="creation-canvas__conversation-title"><div><p>{method.eyebrow}</p><h1>{activeConversation?.title ?? "新的创作对话"}</h1></div><span>建议模式：{method.label}</span></header>
        <div className="ai-thread creation-canvas__thread" ref={scrollRef} onScroll={e=>{const node=e.currentTarget;followOutputRef.current=node.scrollHeight-node.scrollTop-node.clientHeight<=160;}} onClickCapture={e=>{if(e.target.closest('summary'))followOutputRef.current=false;}} aria-busy={sending} aria-live="polite">
              {messages.length ? messages.map((message, index) => <ChatMessage
                key={`${index}-${message.role}`}
                message={message}
                index={index}
                suggesting={suggestingFor?.conversationId === activeId && suggestingFor.replyIndex === index}
                onCopy={copyReply}
                onRetry={retryReply}
                onEdit={editPrompt}
                onPick={pickSuggestion}
              />) : <div className="ai-thread__empty creation-canvas__empty">
                <span><Sparkle size={25} weight="fill" /></span>
                <strong>今天，想弄明白什么？</strong>
                <p>{loadError || "提问、讲解、思路梳理，直接说就行；需要产物时，在这句话里明确写出“生成图片 / 生成网页 / 生成 PPT”等意图。"}</p>
                <div className="creation-canvas__starter-suggestions" aria-label="建议提问内容">
                  {suggestions.slice(0, 3).map((item) => <button type="button" key={item} onClick={() => { setPrompt(item); promptInput.current?.focus(); }}>{item}</button>)}
                </div>
              </div>}
        </div>
      </section>

      {!!activeConversation?.savedArtifacts?.length && <details className="conversation-saved-artifacts"><summary>本机成果 · {activeConversation.savedArtifacts.length}</summary><div className="agent-artifacts">{activeConversation.savedArtifacts.map(artifact => <LocalArtifact key={artifact.localArchiveId} artifact={artifact}/>)}</div></details>}
      <form className="creation-canvas__composer" onSubmit={send}>
        <div className="creation-canvas__input">
              <label htmlFor="artedu-thread-prompt" className="sr-only">继续描述你的创作想法</label>
              <textarea ref={promptInput} id="artedu-thread-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={handlePromptKeyDown} placeholder={method.placeholder} rows={2} disabled={sending} />
              <small className="cloud-cache-notice">成果自动随聊天保存在本机。参考附件 20 分钟后过期。</small>
              <div className="creation-canvas__toolbar">
                <div className="creation-canvas__tools">
                <input ref={referenceInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.docx,.pptx,.txt,.md,.csv" onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const uploaded = await uploadTemporaryCreationFile(file, activeConversation?.id);
                    const nextReference = { id: uploaded.id, fileName: uploaded.fileName, sizeBytes: uploaded.sizeBytes, expiresAt: uploaded.expiresAt, downloadUrl: uploaded.downloadUrl };
                    setReference(nextReference);
                    if (activeConversation) await persist(activeConversation.id, { reference: nextReference, attachments: [...(activeConversation.attachments ?? []).filter((item) => item.id !== nextReference.id), nextReference] });
                    onNotice?.(`“${uploaded.fileName}”已上传，20 分钟后过期`, "success");
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
              {reference && <div className="creation-canvas__attachment" title="该文件会保存在当前浏览器的对话记录中，并作为本轮模型参考资料。">
                <Paperclip size={15} weight="bold" /><span>{reference.fileName}</span><small>已加入本轮上下文</small>
                <button type="button" aria-label="移除参考文件" title="只移除对话关联，不删除服务器上的临时文件" onClick={() => { setReference(null); if (activeConversation) void persist(activeConversation.id, { reference: null }); }}><X size={14} /></button>
              </div>}
            </div>
      </form>
    </main>
    </div>
  </section>;
}

function responseText(result, methodDefinition) {
  if (!result) return "创作请求失败，输入已保留。请根据错误提示重试。";
  if (result.local) return `${result.content}\n\n本次为本地演示结果，任务已写入数据库并完成审计；接入正式模型后可沿用同一创作入口。`;
  // 图片产物直接在气泡里渲染（附件按钮见下方 artifactImageOf），不再让用户点链接跳走；
  // 文档类产物仍然给下载入口，因为浏览器无法内联预览 Office 原件。
  if (result.content) {
    const file = result.localFile;
    if (!file?.downloadUrl || isImageArtifact(file)) return result.content;
    return `${result.content}\n\n[打开本次生成的 ${file.fileName ?? methodDefinition.label}](${file.downloadUrl})`;
  }
  return `任务 ${String(result.id).slice(0, 8)} 已创建（${methodDefinition.label}）。你可以继续输入下一步。`;
}

/** 图片产物在气泡内直接展示；不是图片（文档/视频等）返回空，仍走原有链接。 */
function artifactImageOf(file) {
  if (!file?.downloadUrl || !isImageArtifact(file)) return null;
  return <ZoomableImage src={file.downloadUrl} alt={file.fileName ?? "生成图片"} fileName={file.fileName ?? ""} />;
}

/**
 * 一条对话消息。
 *
 * 用 memo 包住是有意的：流式输出时每帧只有最后一条气泡的 content 变化，
 * 历史消息的对象引用与 props 都没变，可以直接跳过重渲染；再配合 memo 化的
 * AiMarkdown，历史正文的 Markdown 解析也不会被反复触发（这是长对话发卡的主因）。
 */
const ChatMessage = memo(function ChatMessage({ message, index, suggesting, onCopy, onRetry, onEdit, onPick }) {
  if (message.role === "user") return <div className="ai-message--user" aria-label="你的问题">
    <span className="ai-message__author">你</span>
    <p>{message.content}</p>
    <button type="button" className="ai-message__action" onClick={() => onEdit(message.content)}><PencilSimple size={14} />编辑</button>
  </div>;
  const pendingSuggestions = suggesting && !message.suggestions?.length;
  const activities = visibleActivities(message.activity);
  const localSources = new Set((message.localArtifacts ?? []).filter(a => a.localArchiveId).map(a => a.openUrl));
  const openLocalLink = event => {
    const link = event.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!localSources.has(href)) return;
    const card = [...event.currentTarget.querySelectorAll('[data-local-source]')].find(node => node.dataset.localSource === href);
    if (card) { event.preventDefault(); card.querySelector('[data-open-local]')?.click(); }
  };
  const runActivity=activities.find(event=>event.kind==='run')??activities.at(-1);
  return <div className={`ai-message ai-message--assistant${message.streaming ? " ai-message--streaming" : ""}`}>
    <span aria-hidden="true"><ChatCircleDots size={21} weight="regular" /></span>
    <div className="ai-message__body" onClickCapture={openLocalLink}>
      <span className="ai-message__author">{message.paused||message.status==='paused' ? "已暂停" : message.status==='partial'?'部分完成':message.status==='needs_confirmation'?'等待确认':message.failed||message.status==='failed' ? "请求未完成" : "ArtEdu 助教"}</span>
      {!!activities.length && <details className="agent-execution" open={message.streaming||message.status==='partial'||message.status==='failed'}><summary>执行进度 · {activityLabel(runActivity)}</summary><ol className="agent-activity" aria-label="Agent 执行记录">{activities.map(event => <li key={event.id} data-status={event.status}><span aria-hidden="true">{event.status === 'failed' ? '!' : '·'}</span><span>{activityLabel(event)}</span><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time></li>)}</ol></details>}
      <AiMarkdown>{message.content || message.placeholder}</AiMarkdown>
      {!!message.delivery?.artifacts?.length&&<div className="agent-artifacts" aria-label="本轮成果">{message.delivery.artifacts.filter(a=>/^\/api\/(?!\/)/.test(a.openUrl) && !localSources.has(a.openUrl)).map(a=><article key={a.openUrl} className="agent-artifact"><strong>{a.kind==='image'?'AI生成图片 · ':''}{a.path}</strong>{a.kind==='image'&&<ZoomableImage src={a.openUrl} alt="AI生成图片，视觉内容待核验" fileName={a.path}/>}<small>{a.kind==='image'?'视觉内容待核验':a.kind==='webpage'?(a.validation==='pass'?'最新版本检查通过':'尚未通过检查'):'文件已生成'}</small><a href={a.openUrl} target="_blank" rel="noopener noreferrer">打开成果 ↗</a></article>)}</div>}
      {!!message.localArtifacts?.length && <div className="agent-artifacts" aria-label="本机成果">{message.localArtifacts.map(artifact => artifact.localArchiveId ? <LocalArtifact key={artifact.localArchiveId} artifact={artifact}/> : <p key={artifact.openUrl} role="alert">{artifact.path}：本地保存失败，请及时下载。</p>)}</div>}
      {!localSources.has(message.localFile?.downloadUrl) && artifactImageOf(message.localFile)}
      {(message.sources?.length ?? 0) > 0 && <SourcesBlock sources={message.sources} />}
      <div className="ai-message__actions">
        <button type="button" onClick={() => onCopy(message.content)} title="复制回复"><Copy size={14} />复制</button>
        <button type="button" onClick={() => onRetry(index)} title="清除这一轮的回复并重新生成"><ArrowClockwise size={14} />重新输出</button>
      </div>
      {(message.suggestions?.length > 0 || pendingSuggestions) && <div className="creation-canvas__followups" aria-label="建议提问内容">
        <span>建议提问内容</span>
        {message.suggestions?.length
          ? <div>{message.suggestions.map((item) => <button type="button" key={item} onClick={() => onPick(item)}>{item}<ArrowRight size={14} weight="bold" /></button>)}</div>
          : <p>正在生成建议提问…</p>}
      </div>}
    </div>
  </div>;
});

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
