import {lockPageScroll} from './pageScrollLock.js';
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createWork, getWork, updateWork, uploadWorkAsset, getWorkUploadPolicy } from "./services/adminApi.js";
import { caseUploadError, emptyStep, emptyStory, splitCaseLabels } from "./caseStory.js";
import { findCaseEditorialIssues } from "./caseEditorial.js";
import { useUnsavedChanges } from './useUnsavedChanges.js';

export function CaseStoryEditor({ initial, workflows, onSaved, onClose: closeEditor, onNotice }) {
  const [form, setForm] = useState(() => ({ title: initial?.title ?? "", summary: initial?.summary ?? "", discipline: initial?.discipline ?? "视觉传达", tags: initial?.tags?.map(t => t.name).join("，") ?? "", workflowId: initial?.workflows?.[0]?.id ?? "", story: { ...emptyStory(), ...initial?.story } }));
  const [assets, setAssets] = useState(initial?.assets ?? []);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [labelFields, setLabelFields] = useState(() => ({ creators: (initial?.story?.creators ?? []).join("，"), tools: (initial?.story?.tools ?? []).join("，"), methods: (initial?.story?.methods ?? []).join("，") }));
  const baseline=useRef(JSON.stringify({form,labelFields}));
  const requestLeave=useUnsavedChanges(files.length>0||JSON.stringify({form,labelFields})!==baseline.current,{busy,label:'案例草稿'});
  const onClose=()=>{void requestLeave(closeEditor);};
  const [policy, setPolicy] = useState(null);
  const [progress, setProgress] = useState(null);
  const cancellation = useRef(null);
  useEffect(() => {
    let active = true;
    getWorkUploadPolicy().then(value => { if (active) setPolicy(value); }).catch(() => { if (active) setError('无法读取上传限制，请关闭后重新打开编辑器。'); });
    return () => { active = false; cancellation.current?.abort(); };
  }, []);
  const dialog = useRef(null);
  const closeState = useRef({ busy, onClose });
  closeState.current = { busy, onClose };
  useEffect(() => {
    const previousFocus = document.activeElement;
    const unlockPage=lockPageScroll();
    const focusable = () => [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')].filter(element => !element.matches(':disabled'));
    focusable()[0]?.focus({ preventScroll: true });
    const handleKey = event => {
      if(document.querySelector('.feedback-dialog'))return;
      if (event.key === "Escape" && !closeState.current.busy) closeState.current.onClose();
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      unlockPage();
      document.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  const workId = useRef(initial?.id);
  const uploaded = useRef(new Set());
  const originalAssetCount = useRef(initial?.assets?.length ?? 0);
  const [error, setError] = useState("");
  const change = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const storyChange = (key, value) => setForm(current => ({ ...current, story: { ...current.story, [key]: value } }));
  const stepChange = (index, key, value) => storyChange("steps", form.story.steps.map((step, i) => i === index ? { ...step, [key]: value } : step));
  const editorialIssues = findCaseEditorialIssues({ ...form, story: { ...form.story, creators: splitCaseLabels(labelFields.creators) } });
  const save = async event => {
    event.preventDefault();
    if (busy) return;
    const remaining = files.filter(file => !uploaded.current.has(file));
    if (!policy) { setError('请等待上传限制加载完成'); return; }
    const invalid = caseUploadError(remaining, originalAssetCount.current + uploaded.current.size, policy);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError("");
    cancellation.current = new AbortController();
    const signal = cancellation.current.signal;
    try {
      const { collection, ...writableStory } = form.story; // 模块归属只能由管理员通过独立接口调整。
      const payload = { title: form.title, summary: form.summary, discipline: form.discipline, workflowIds: form.workflowId ? [form.workflowId] : [], tagNames: splitCaseLabels(form.tags), story: { ...writableStory, ...Object.fromEntries(Object.entries(labelFields).map(([key,value]) => [key,splitCaseLabels(value)])) } };
      if (!workId.current) workId.current = (await createWork(payload)).id;
      else await updateWork(workId.current, payload);
      for (const file of remaining) {
        if (signal.aborted) throw new DOMException('已取消上传', 'AbortError');
        setProgress({ name: file.name, percent: 0 });
        await uploadWorkAsset(workId.current, file, { signal, onProgress: percent => setProgress({ name: file.name, percent }) });
        uploaded.current.add(file); // Preserve successful uploads when a later upload fails.
      }
      const saved = await getWork(workId.current);
      setAssets(saved.assets ?? []);
      setFiles([]); uploaded.current.clear();
      onSaved(saved);
    } catch (failure) {
      if (workId.current) {
        try { setAssets((await getWork(workId.current)).assets ?? []); } catch { /* Keep form recoverable offline. */ }
      }
      setError(`${failure.name === 'AbortError' ? '已取消后续上传，已完成的文件不会删除' : failure.message}。输入已保留，可重试保存；相同文件会自动复用。`);
      onNotice("草稿未完全保存，请查看表单提示");
    } finally { setBusy(false); setProgress(null); cancellation.current = null; }
  };
  // Mount outside route animations: transformed ancestors otherwise trap fixed dialogs.
  return createPortal(<div className="publish-layer case-editor-layer" role="dialog" aria-modal="true" aria-label="编辑案例">
    <button className="publish-scrim" aria-label="关闭案例编辑" disabled={busy} onClick={onClose} />
    <form ref={dialog} className="publish-form case-editor" onSubmit={save} aria-label="案例草稿编辑">
      <header><div><span>CASE STUDY</span><h2>{initial ? "编辑案例草稿" : "新建案例草稿"}</h2></div><button type="button" disabled={busy} onClick={onClose} aria-label="关闭案例编辑">关闭</button></header>
      <p>保存并预览案例，确认后提交审核。</p>
      <fieldset disabled={busy}>
        <label>案例名称<input required minLength={2} maxLength={160} value={form.title} onChange={e => change("title", e.target.value)} /></label>
        <label>项目简介<textarea required minLength={2} maxLength={3000} value={form.summary} onChange={e => change("summary", e.target.value)} /><small>描述作品主题、创作理念与成果。</small></label>
        <div className="publish-form__row"><label>学科<input required maxLength={100} value={form.discipline} onChange={e => change("discipline", e.target.value)} /></label><label>来源<select value={form.story.origin} onChange={e => storyChange("origin", e.target.value)}><option value="unspecified">请选择来源</option><option value="collected">收集案例／外部创作</option><option value="platform">在 ArtEdu 创作</option></select><small>提交审核前需明确来源；外部案例还需填写作者与授权说明。</small></label></div>
        <label>原作者／团队（多人用逗号分隔）<input maxLength={960} value={labelFields.creators} onChange={e => setLabelFields({...labelFields,creators:e.target.value})} placeholder="支持匿名作者；上传者不会替代原作者署名" /></label>
        {form.story.origin === "collected" && <section className="case-editor-step" aria-label="作品来源与展览信息">
          <h3>作品来源与展览信息</h3>
          <small>在作品正文下方展示；来源链接不代表转载授权，仍需单独确认图片、视频的展示权限。</small>
          <label>作品展示方式<select aria-label="作品展示方式" value={form.story.displayStyle} onChange={e => storyChange("displayStyle", e.target.value)}><option value="case-study">教学案例（成果与创作步骤）</option><option value="exhibition">艺术展览（封面、介绍与媒体）</option></select></label>
          <label>来源网站名称<input maxLength={160} value={form.story.sourceName} onChange={e => storyChange("sourceName", e.target.value)} placeholder="CVPR Art" /></label>
          <label>来源网站地址<input type="url" maxLength={2048} value={form.story.sourceUrl} onChange={e => storyChange("sourceUrl", e.target.value)} placeholder="https://thecvf-art.com/" /></label>
          <label>原作页面地址<input type="url" maxLength={2048} value={form.story.originalUrl} onChange={e => storyChange("originalUrl", e.target.value)} placeholder="作品的官方展示页面，用于“查看原作”" /></label>
          <div className="publish-form__row"><label>展览名称<input maxLength={200} value={form.story.exhibitionName} onChange={e => storyChange("exhibitionName", e.target.value)} placeholder="CVPR Art Gallery" /></label><label>展览年份<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={form.story.exhibitionYear} onChange={e => storyChange("exhibitionYear", e.target.value)} placeholder="2025" /></label></div>
        </section>}
        <label>使用工具<input maxLength={960} value={labelFields.tools} onChange={e => setLabelFields({...labelFields,tools:e.target.value})} placeholder="按作者提供的信息填写，未提供则留空" /></label>
        <label>创作方式<input maxLength={720} value={labelFields.methods} onChange={e => setLabelFields({...labelFields,methods:e.target.value})} placeholder="概念探索，品牌设计，图像生成" /></label>
        <label>主题标签<input value={form.tags} maxLength={480} onChange={e => change("tags", e.target.value)} placeholder="咖啡，传统文化，材料实验" /></label>
        <label>关联教学工作流<select value={form.workflowId} onChange={e => change("workflowId", e.target.value)}><option value="">未关联／尚未整理</option>{workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label>添加成果与过程文件<input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf,.docx,.pptx" onChange={e => { setFiles([...e.target.files]); uploaded.current.clear(); }} /><small>{policy ? `视频最多 ${policy.videoBytes / 1024 / 1024} MiB，图片及文档最多 10 MiB，共最多 10 个` : '正在读取上传限制…'}；ZIP、MOV、webloc 请先处理。保存后可将图片关联到步骤。</small></label>
        {!!files.length && <p>待上传：{files.map(file => file.name).join("、")}</p>}
        {!!assets.length && <><p>已上传 {assets.length} 个文件</p><label>封面<select value={form.story.coverAssetId} onChange={e => storyChange("coverAssetId", e.target.value)}><option value="">使用第一张图片</option>{assets.filter(a => a.asset_type === "image").map(a => <option key={a.id} value={a.id}>{a.file_name}</option>)}</select><small>提交审核至少需要一张图片；视频、PDF 和演示文稿可作为过程材料。</small></label></>}
        <h3>创作过程</h3>
        {form.story.steps.map((step, index) => <section className="case-editor-step" key={index}>
          <h4>步骤 {index + 1}</h4>
          {[['title','步骤名称',160],['description','目标与人工操作',4000],['tool','工具／模型',160],['parameters','参数（未知则留空）',2000],['prompt','输入提示词',10000],['outcome','结果与调整',4000]].map(([key,label,max]) => <label key={key}>{label}<textarea required={key === 'title'} rows={key === 'prompt' ? 4 : 2} maxLength={max} value={step[key]} onChange={e => stepChange(index,key,e.target.value)} /></label>)}
          <label>步骤配图（可多选）<select multiple value={step.assetIds} onChange={e => stepChange(index,"assetIds",[...e.target.selectedOptions].map(o => o.value))}>{assets.filter(a => a.asset_type === "image").map(a => <option key={a.id} value={a.id}>{a.file_name}</option>)}</select></label>
          <button type="button" onClick={() => storyChange("steps",form.story.steps.filter((_,i) => i !== index))}>移除此步骤</button>
        </section>)}
        <button type="button" disabled={form.story.steps.length >= 20} onClick={() => storyChange("steps",[...form.story.steps,emptyStep()])}>＋ 添加创作步骤</button>
        <label>经验与反思<textarea maxLength={4000} value={form.story.reflection} onChange={e => storyChange("reflection",e.target.value)} /></label>
        <label>编辑备注（仅上传者与审核人员可见）<textarea maxLength={8000} value={form.story.editorialNote} onChange={e => storyChange("editorialNote", e.target.value)} placeholder="资料整理说明、尚缺素材、核对情况等写在这里，不混入作者的创作反思。" /></label>
        {!!editorialIssues.length && <aside className="case-editorial-warning" role="status"><strong>公开文案需要调整</strong>{editorialIssues.map((issue, index) => <p key={`${issue.field}-${index}`}>{issue.message}</p>)}<small>可先保存草稿，调整后再提交审核。</small></aside>}
        <h3>发布与附件权限</h3>
        <label>展示授权<select value={form.story.authorization} onChange={e => storyChange("authorization",e.target.value)}><option value="pending">待确认（仅保存草稿）</option><option value="confirmed">已获得作者展示授权</option></select></label>
        <label>授权说明（仅上传者与审核人员可见）<textarea maxLength={1000} value={form.story.authorizationNote} onChange={e => storyChange("authorizationNote",e.target.value)} placeholder="记录授权渠道、范围与时间，不填写私人联系方式" /></label>
        <label className="case-checkbox"><input type="checkbox" checked={form.story.allowDocumentDownload} onChange={e => storyChange("allowDocumentDownload",e.target.checked)} />允许已发布案例的读者下载文档原件（需另获授权）</label>
      </fieldset>
      {error && <p role="alert" className="case-error">{error}</p>}
      {progress && <div role="status"><p>{progress.name}：{progress.percent === 100 ? '传输完成，服务器校验中…' : `${progress.percent}%`}</p><progress aria-label="文件上传进度" max="100" value={progress.percent} /></div>}
      {busy && <button type="button" onClick={() => cancellation.current?.abort()}>取消后续上传</button>}
      <button className="publish-submit" disabled={busy || !policy}>{busy ? "正在保存…" : "保存草稿并预览"}</button>
    </form>
  </div>, document.body);
}
