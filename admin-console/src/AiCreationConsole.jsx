import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, ChatCircleDots, Check, CaretDown, FloppyDisk, Gauge,
  ImageSquare, Paperclip, Sparkle, Trash,
} from "@phosphor-icons/react";
import {
  CREATION_METHODS, FALLBACK_MODELS, creationMethod, titleFromPrompt,
} from "./creationMethods.js";
import { createConversation, listConversations, saveConversation } from "./conversationStore.js";
import { uploadTemporaryCreationFile } from "./services/adminApi.js";

// 起始页只负责“说清需求 + 选定能力”。长回复与历次对话在 /creation 专用页面阅读。
export function AiCreationConsole({ account, creation, onNotice, onOpenConversation }) {
  const storedDraft = useMemo(() => readDraft(account.id), [account.id]);
  const [methodId, setMethodId] = useState(() => storedDraft?.methodId ?? CREATION_METHODS[0].id);
  const [modelId, setModelId] = useState(() => storedDraft?.modelId ?? FALLBACK_MODELS[0].id);
  const [prompt, setPrompt] = useState(() => storedDraft?.prompt ?? "");
  const [searchEnabled, setSearchEnabled] = useState(() => storedDraft?.searchEnabled ?? false);
  const [sending, setSending] = useState(false);
  const [draftSaved, setDraftSaved] = useState(Boolean(storedDraft?.prompt));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reference, setReference] = useState(null);
  const [recent, setRecent] = useState([]);
  const pickerRef = useRef(null);
  const referenceInput = useRef(null);

  const method = useMemo(() => creationMethod(methodId), [methodId]);
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
    if (!models.some((item) => item.id === modelId)) setModelId(models[0]?.id ?? FALLBACK_MODELS[0].id);
  }, [modelId, models]);

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (event) => { if (!pickerRef.current?.contains(event.target)) setPickerOpen(false); };
    const escape = (event) => { if (event.key === "Escape") setPickerOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [pickerOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!prompt.trim()) {
        clearDraft(account.id);
        setDraftSaved(false);
        return;
      }
      setDraftSaved(saveDraft(account.id, { prompt, methodId, modelId, searchEnabled, updatedAt: new Date().toISOString() }));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [account.id, methodId, modelId, prompt, searchEnabled]);

  useEffect(() => {
    let cancelled = false;
    void listConversations(account.id).then((items) => { if (!cancelled) setRecent(items); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [account.id, sending]);

  const submit = async (event) => {
    event.preventDefault();
    const content = prompt.trim();
    if (!content || sending) return;
    if (quotaBlocked) {
      onNotice?.("当前生成额度或并发额度已达到上限，草稿已保存。请稍后重试或联系管理员调整额度。", "error");
      return;
    }
    setSending(true);
    try {
      // 起始页不直接调用模型：先把需求落进本地对话，再跳转到专用阅读页执行与展示。
      const conversation = await saveConversation({
        ...createConversation(account.id, methodId, titleFromPrompt(content)),
        pending: {
          prompt: content,
          methodId,
          modelId: serviceReady ? (model?.id ?? null) : null,
          searchEnabled,
          reference: reference ?? null,
          createdAt: new Date().toISOString(),
        },
      });
      clearDraft(account.id);
      setDraftSaved(false);
      setPrompt("");
      setReference(null);
      onOpenConversation(conversation.id);
    } catch {
      onNotice?.("本地对话空间不可用，暂时无法打开创作对话页", "error");
    } finally {
      setSending(false);
    }
  };

  return <section className="ai-creation" aria-labelledby="ai-creation-title">
    <div className="ai-creation__intro">
      <span><Sparkle size={14} weight="fill" /> {serviceReady ? "已配置模型服务 · 校内账号直接使用" : "本地演示模式 · 不调用外部模型"}</span>
      <h2 id="ai-creation-title">今天想<span>创作</span>什么？</h2>
      <p>选择能力与大模型，把灵感变成可以执行、学习和复用的艺术工作流。</p>
    </div>

    <form className="ai-composer" onSubmit={submit}>
      <div className={`ai-service-state ${serviceReady ? "is-ready" : "is-offline"}`}>
        <span><i />{serviceReady ? `${creation.models.length} 个模型配置可执行` : "外部模型未接入 · 本地演示可用"}</span>
        <span><Gauge size={14} />{quota.dailyLimit === null || quota.dailyLimit === undefined ? "今日额度未限制" : `今日剩余 ${Math.max(0, quota.dailyLimit - quota.dailyUsed)} / ${quota.dailyLimit}`}</span>
        <span>并发 {quota.inFlight ?? 0} / {quota.concurrentLimit ?? "∞"}</span>
      </div>

      <div className="ai-entry">
        <div className={`ai-entry__capability ${pickerOpen ? "is-open" : ""}`}>
          <span className="ai-entry__capability-icon"><method.Icon size={16} weight="bold" /></span>
          <div><small>当前创作能力</small><strong>{method.label}</strong></div>
          <em>{method.eyebrow}</em>
        </div>

        <label htmlFor="artedu-ai-prompt" className="sr-only">描述你的创作想法</label>
        <textarea
          id="artedu-ai-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={method.placeholder}
          rows={4}
        />
        <p className="ai-entry__hint">提交后会进入专用创作对话页，完整回复在那里阅读，历次对话保留在左侧。</p>
      </div>

      <div className="ai-composer__footer">
        <div className="model-picker">
          <span>{serviceReady ? "模型接口" : "演示参数"}</span>
          <div className="model-picker__row"><select aria-label="选择大模型" value={model?.id ?? ""} onChange={(event) => setModelId(event.target.value)}>{models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className={`search-toggle ${searchEnabled ? "is-active" : ""}`} aria-pressed={searchEnabled} onClick={() => setSearchEnabled((enabled) => !enabled)} title={searchEnabled ? "搜索能力已开启：模型可以调用平台搜索工具" : "搜索能力已关闭：本轮不会向模型提供搜索工具"}>智能搜索 <b>{searchEnabled ? "开" : "关"}</b></button></div>
        </div>
        <div className="ai-composer__controls">
          <div className="ai-composer__actions">
            <input ref={referenceInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.docx,.pptx" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const uploaded = await uploadTemporaryCreationFile(file);
                setReference({ id: uploaded.id, fileName: uploaded.fileName, sizeBytes: uploaded.sizeBytes, expiresAt: uploaded.expiresAt });
                onNotice?.(`“${uploaded.fileName}”已临时上传，72 小时未活动后自动删除`, "success");
              } catch (error) { onNotice?.(error.message || "文件上传失败", "error"); }
              event.target.value = "";
            }} />
            <button type="button" className="ai-attach" aria-label="添加本机参考文件" title="本机临时参考文件" onClick={() => referenceInput.current?.click()}><Paperclip size={18} weight="bold" /></button>

            <div className="capability-picker" ref={pickerRef}>
              <button
                type="button"
                className={`capability-fab ${pickerOpen ? "is-open" : ""}`}
                aria-haspopup="listbox"
                aria-expanded={pickerOpen}
                aria-label={`创作能力：${method.label}，点击展开能力列表`}
                title={`创作能力：${method.label}`}
                onClick={() => setPickerOpen((open) => !open)}
              >
                <method.Icon size={18} weight="bold" />
                <CaretDown className="capability-fab__caret" size={11} weight="bold" />
              </button>
              {pickerOpen && <div className="capability-menu" role="listbox" aria-label="选择创作能力">
                <header><span>// CREATION METHOD</span><strong>选择创作能力</strong></header>
                {CREATION_METHODS.map(({ id, label, eyebrow, Icon }) => <button
                  type="button"
                  key={id}
                  role="option"
                  aria-selected={methodId === id}
                  className={methodId === id ? "is-active" : ""}
                  onClick={() => { setMethodId(id); setPickerOpen(false); }}
                ><span className="capability-menu__icon"><Icon size={17} weight="bold" /></span><span className="capability-menu__text"><strong>{label}</strong><small>{eyebrow}</small></span>{methodId === id && <Check className="capability-menu__check" size={15} weight="bold" />}</button>)}
              </div>}
            </div>

            <button type="submit" className="ai-submit" disabled={!prompt.trim() || sending || quotaBlocked} title={!serviceReady ? "使用本地 Harness 完成结构化演示，不调用外部模型" : undefined}>
              {sending ? "正在打开" : quotaBlocked ? "额度已用尽" : "开始创作"} <ArrowRight size={18} weight="bold" />
            </button>
          </div>
        </div>
      </div>

      <div className="ai-composer__status">
        <span><ImageSquare size={14} /> 当前身份：{account.shortName} · {method.label} · {model.name}</span>
        {reference && <span title="临时文件独立占用服务器配额">临时文件：{reference.fileName} · 72 小时未活动自动删除</span>}
        {prompt.trim() && <button type="button" onClick={() => { setPrompt(""); setDraftSaved(false); clearDraft(account.id); }}><Trash size={13} /> 清空草稿</button>}
        <em><FloppyDisk size={13} />{draftSaved ? "草稿已保存" : "输入后自动保存"}</em>
      </div>
    </form>

    {recent.length > 0 && <div className="ai-history-strip">
      <button type="button" onClick={() => onOpenConversation(recent[0].id)}><ChatCircleDots size={16} weight="bold" />继续上次对话 · {recent[0].title}</button>
      <button type="button" onClick={() => onOpenConversation("")}>历次对话（{recent.length}）<ArrowRight size={15} weight="bold" /></button>
    </div>}
  </section>;
}

function draftKey(accountId) { return `artedu.ai-draft.${accountId}`; }
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
      methodId: CREATION_METHODS.some((item) => item.id === value.methodId) ? value.methodId : CREATION_METHODS[0].id,
      modelId: typeof value.modelId === "string" ? value.modelId : FALLBACK_MODELS[0].id,
      searchEnabled: value.searchEnabled === true,
    };
  } catch {
    return null;
  }
}
