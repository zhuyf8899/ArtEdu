import {lockPageScroll} from './pageScrollLock.js';
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageSquare, Plus } from '@phosphor-icons/react';
import { createWork, getWork, updateWork, uploadWorkAsset, getWorkUploadPolicy } from "./services/adminApi.js";
import { caseReviewIssues, caseUploadError, emptyStep, emptyStory, splitCaseLabels } from "./caseStory.js";
import { findCaseEditorialIssues } from "./caseEditorial.js";
import { useUnsavedChanges } from './useUnsavedChanges.js';

export function CaseStoryEditor({ initial, workflows, directPublish = false, inManagement = false, onSaved, onClose: closeEditor }) {
  const published = initial?.status === 'approved';
  const [form, setForm] = useState(() => ({ title: initial?.title ?? "", summary: initial?.summary ?? "", discipline: initial?.discipline ?? "视觉传达", tags: initial?.tags?.map(t => t.name).join("，") ?? "", workflowId: initial?.workflows?.[0]?.id ?? "", story: { ...emptyStory(), ...initial?.story } }));
  const [assets, setAssets] = useState(initial?.assets ?? []);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [labelFields, setLabelFields] = useState(() => ({ creators: (initial?.story?.creators ?? []).join("，"), tools: (initial?.story?.tools ?? []).join("，"), methods: (initial?.story?.methods ?? []).join("，") }));
  const baseline=useRef(JSON.stringify({form,labelFields}));
  const requestLeave=useUnsavedChanges(files.length>0||JSON.stringify({form,labelFields})!==baseline.current,{busy,label:'案例草稿'});
  const onClose=()=>{void requestLeave(closeEditor);};
  const [policy, setPolicy] = useState(null);
  const [policyFailed, setPolicyFailed] = useState(false);
  const [policyAttempt, setPolicyAttempt] = useState(0);
  const [fileErrors, setFileErrors] = useState([]);
  const [progress, setProgress] = useState(null);
  const cancellation = useRef(null);
  const saving = useRef(false);
  const fileInput = useRef(null);
  useEffect(() => {
    let active = true;
    getWorkUploadPolicy().then(value => { if (active) setPolicy(value); }).catch(() => { if (active) setPolicyFailed(true); });
    return () => { active = false; };
  }, [policyAttempt]);
  useEffect(() => () => cancellation.current?.abort(), []);
  const dialog = useRef(null);
  const closeState = useRef({ busy, onClose });
  closeState.current = { busy, onClose };
  useEffect(() => {
    const previousFocus = document.activeElement;
    const unlockPage=lockPageScroll();
    const focusable = () => [...dialog.current.querySelectorAll('button,input,textarea,select,summary')].filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length);
    dialog.current.querySelector('h2')?.focus({ preventScroll: true });
    const handleKey = event => {
      if(document.querySelector('.feedback-dialog'))return;
      if (event.key === "Escape" && !closeState.current.busy) { event.preventDefault(); closeState.current.onClose(); }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      unlockPage();
      document.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  const workId = useRef(initial?.id);
  const [error, setError] = useState("");
  const change = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const storyChange = (key, value) => setForm(current => ({ ...current, story: { ...current.story, [key]: value } }));
  const stepChange = (index, key, value) => storyChange("steps", form.story.steps.map((step, i) => i === index ? { ...step, [key]: value } : step));
  const story = { ...form.story, creators: splitCaseLabels(labelFields.creators) };
  const editorialIssues = findCaseEditorialIssues({ ...form, story });
  const reviewIssues = caseReviewIssues({ ...form, story }, assets.filter(asset => asset.asset_type === 'image').length + files.filter(file => file.type.startsWith('image/')).length);
  const chooseFiles = list => {
    if (!policy || busy) return;
    const next = [...files];
    const errors = [];
    for (const file of list) {
      if (next.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) continue;
      const invalid = caseUploadError([file], assets.length + next.length, policy);
      if (invalid) { if (!errors.includes(invalid)) errors.push(invalid); }
      else next.push(file);
    }
    setFiles(next);
    setFileErrors(errors);
  };
  const save = async event => {
    event.preventDefault();
    if (saving.current) return;
    if (form.title.trim().length < 2 || form.summary.trim().length < 2 || !form.discipline.trim()) {
      setError('请填写案例名称、项目简介和学科，字数要求不计首尾空格。');
      return;
    }
    saving.current = true;
    setBusy(true); setError("");
    cancellation.current = new AbortController();
    const signal = cancellation.current.signal;
    const completed = new Map();
    try {
      const { collection, ...writableStory } = form.story; // 模块归属只能由管理员通过独立接口调整。
      const initialWorkflowIds = initial?.workflows?.map(workflow => workflow.id) ?? [];
      const workflowIds = form.workflowId === (initialWorkflowIds[0] ?? '') ? initialWorkflowIds : form.workflowId ? [form.workflowId] : [];
      const payload = { title: form.title, summary: form.summary, discipline: form.discipline, workflowIds, tagNames: splitCaseLabels(form.tags), story: { ...writableStory, ...Object.fromEntries(Object.entries(labelFields).map(([key,value]) => [key,splitCaseLabels(value)])) } };
      const draft = workId.current ? await updateWork(workId.current, payload) : await createWork(payload);
      workId.current = draft.id;
      baseline.current = JSON.stringify({form,labelFields});
      for (const [index, file] of files.entries()) {
        if (signal.aborted) throw new DOMException('已取消上传', 'AbortError');
        const progress = { name: file.name, index: index + 1, total: files.length };
        setProgress({ ...progress, percent: 0 });
        const uploaded = await uploadWorkAsset(workId.current, file, { signal, onProgress: percent => setProgress({ ...progress, percent }) });
        completed.set(file, uploaded);
      }
      onSaved(files.length ? await getWork(workId.current) : draft);
    } catch (failure) {
      setFiles(current => current.filter(file => !completed.has(file)));
      setAssets(current => [...new Map([...current, ...[...completed.values()].map(asset => ({
        id: asset.id, file_name: asset.fileName, asset_type: asset.mimeType.split('/')[0],
      }))].map(asset => [asset.id, asset])).values()]);
      if (workId.current) {
        try { setAssets((await getWork(workId.current)).assets ?? []); } catch { /* Keep form recoverable offline. */ }
      }
      setError(`${failure.name === 'AbortError' ? '已取消后续上传，已完成的文件已保留' : failure.message}。可直接重试，已上传的相同文件会自动复用。`);
    } finally { saving.current = false; setBusy(false); setProgress(null); cancellation.current = null; }
  };
  // Mount outside route animations: transformed ancestors otherwise trap fixed dialogs.
  return createPortal(<div className="publish-layer case-editor-layer" role="dialog" aria-modal="true" aria-label="编辑案例">
    <button className="publish-scrim" aria-label="关闭案例编辑" disabled={busy} onClick={onClose} />
    <form ref={dialog} className="publish-form case-editor" onSubmit={save} aria-label="案例草稿编辑" onInvalidCapture={event=>{for(let details=event.target.closest('details');details;details=details.parentElement.closest('details'))details.open=true;}}>
      <header><div><h2 tabIndex={-1}>{published ? '编辑已发布案例' : initial ? '编辑案例草稿' : '上传案例'}</h2>
        <p>{published ? '保存后，修改将在案例社区生效。' : inManagement ? '编辑案例资料及附件。' : `添加作品素材，填写基本信息，预览后可${directPublish ? '直接发布' : '提交审核'}。`}</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="关闭案例编辑">关闭</button></header>
      <div className="case-editor-content">
      <fieldset disabled={busy}>
        <section className="case-editor-upload" aria-labelledby="case-upload-title"
          onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();chooseFiles([...event.dataTransfer.files]);}}>
          <header>
            <ImageSquare size={25} aria-hidden="true"/>
            <div><h3 id="case-upload-title">作品图片、视频和文档</h3><p>拖入或分批选择文件。第一张图片默认作为封面。</p></div>
            <button type="button" className="case-editor-secondary" disabled={!policy || assets.length + files.length >= 10} onClick={()=>fileInput.current.click()}><Plus size={17}/>添加文件</button>
          </header>
          <input ref={fileInput} type="file" hidden multiple accept=".jpg,.jpeg,.png,.webp,.mp4,.webm,.pdf,.docx,.pptx" aria-label="选择案例文件" onChange={event=>{chooseFiles([...event.target.files]);event.target.value='';}}/>
          {policy && <small>共 {assets.length + files.length} / 10 个。图片及文档最多 {policy.fileBytes / 1024 / 1024} MiB，视频最多 {policy.videoBytes / 1024 / 1024} MiB。</small>}
          {!policy && !policyFailed && <small role="status">正在读取上传限制…</small>}
          {policyFailed && <p role="alert">无法读取上传限制。<button type="button" className="case-editor-secondary" onClick={()=>{setPolicyFailed(false);setPolicyAttempt(value=>value+1);}}>重试</button></p>}
          {(assets.length > 0 || files.length > 0) && <ul className="case-editor-files">
            {assets.map(asset=><li key={asset.id}><span>{asset.file_name}</span><small>已保存</small></li>)}
            {files.map((file,index)=><li key={`${file.name}-${file.size}-${file.lastModified}`}><span>{file.name}</span><small>待上传</small><button type="button" className="case-editor-secondary" aria-label={`移除 ${file.name}`} onClick={()=>{setFiles(current=>current.filter((_,i)=>i!==index));setFileErrors([]);}}>移除</button></li>)}
          </ul>}
          {fileErrors.length > 0 && <ul role="alert" className="case-file-errors">{fileErrors.map(message=><li key={message}>{message}</li>)}</ul>}
          {assets.filter(asset=>asset.asset_type==='image').length>0 && <label>封面
            <select value={form.story.coverAssetId} onChange={event=>storyChange('coverAssetId',event.target.value)}><option value="">使用第一张图片</option>{assets.filter(asset=>asset.asset_type==='image').map(asset=><option key={asset.id} value={asset.id}>{asset.file_name}</option>)}</select>
          </label>}
        </section>
        <label>案例名称<input required minLength={2} maxLength={160} value={form.title} onChange={e => change("title", e.target.value)} placeholder="填写作品或项目名称"/></label>
        <label>项目简介<textarea required rows={3} minLength={2} maxLength={3000} value={form.summary} onChange={e => change("summary", e.target.value)} placeholder="描述作品主题、创作理念与成果"/></label>
        <div className="publish-form__row"><label>学科<input required maxLength={100} value={form.discipline} onChange={e => change("discipline", e.target.value)} /></label><label>作品来源<select value={form.story.origin} onChange={e => storyChange("origin", e.target.value)}><option value="unspecified">请选择来源</option><option value="collected">收集案例／外部创作</option><option value="platform">在 ArtEdu 创作</option></select></label></div>
        {form.story.origin === 'collected' && <section className="case-editor-step case-authorization" aria-label="外部作品署名与授权">
          <h3>外部作品署名与授权</h3>
          <label>原作者／团队（多人用逗号分隔）<input maxLength={960} value={labelFields.creators} onChange={e => setLabelFields({...labelFields,creators:e.target.value})}/></label>
          <label>展示授权<select value={form.story.authorization} onChange={e => storyChange("authorization",e.target.value)}><option value="pending">待确认</option><option value="confirmed">已获得作者展示授权</option></select></label>
          <label>授权说明（仅上传者与审核人员可见）<textarea maxLength={1000} value={form.story.authorizationNote} onChange={e => storyChange("authorizationNote",e.target.value)} placeholder="记录授权渠道、范围与时间"/></label>
        </section>}
        {form.story.origin === "collected" && <details className="case-editor-options"><summary>原作链接与展览信息（选填）</summary><div>
          <small>来源信息显示在作品正文下方。请确认图片和视频已获展示授权。</small>
          <label>作品展示方式<select aria-label="作品展示方式" value={form.story.displayStyle} onChange={e => storyChange("displayStyle", e.target.value)}><option value="case-study">教学案例（成果与创作步骤）</option><option value="exhibition">艺术展览（封面、介绍与媒体）</option></select></label>
          <label>来源网站名称<input maxLength={160} value={form.story.sourceName} onChange={e => storyChange("sourceName", e.target.value)} placeholder="CVPR Art" /></label>
          <label>来源网站地址<input type="url" maxLength={2048} value={form.story.sourceUrl} onChange={e => storyChange("sourceUrl", e.target.value)} placeholder="https://thecvf-art.com/" /></label>
          <label>原作页面地址<input type="url" maxLength={2048} value={form.story.originalUrl} onChange={e => storyChange("originalUrl", e.target.value)} placeholder="作品的官方展示页面，用于“查看原作”" /></label>
          <div className="publish-form__row"><label>展览名称<input maxLength={200} value={form.story.exhibitionName} onChange={e => storyChange("exhibitionName", e.target.value)} placeholder="CVPR Art Gallery" /></label><label>展览年份<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={form.story.exhibitionYear} onChange={e => storyChange("exhibitionYear", e.target.value)} placeholder="2025" /></label></div>
        </div></details>}
        {!!form.story.blocks?.length && <details className="case-editor-options"><summary>编辑图文手记</summary><div>{form.story.blocks.map((block,index)=>'text' in block ? <label key={index}>第 {index+1} 段<textarea value={block.text} maxLength={4000} onChange={event=>storyChange('blocks',form.story.blocks.map((b,i)=>i===index?{text:event.target.value}:b))}/></label> : <p key={index}>配图 · {assets.find(a=>a.id===block.assetId)?.alt_text || '作品图片'}</p>)}</div></details>}
        <details className="case-editor-options" open={editorialIssues.length ? true : undefined}><summary>创作过程、工具与补充信息（选填）</summary><div>
        {form.story.origin !== 'collected' && <label>作品署名（选填）<input maxLength={960} value={labelFields.creators} onChange={e => setLabelFields({...labelFields,creators:e.target.value})} placeholder="多人用逗号分隔"/></label>}
        <label>使用工具<input maxLength={960} value={labelFields.tools} onChange={e => setLabelFields({...labelFields,tools:e.target.value})} placeholder="按作者提供的信息填写，未提供则留空" /></label>
        <label>创作方式<input maxLength={720} value={labelFields.methods} onChange={e => setLabelFields({...labelFields,methods:e.target.value})} placeholder="概念探索，品牌设计，图像生成" /></label>
        <label>主题标签<input value={form.tags} maxLength={480} onChange={e => change("tags", e.target.value)} placeholder="咖啡，传统文化，材料实验" /></label>
        <label>关联教学工作流<select value={form.workflowId} onChange={e => change("workflowId", e.target.value)}><option value="">未关联／尚未整理</option>{workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        {form.story.steps.map((step, index) => <section className="case-editor-step" key={index}>
          <h4>步骤 {index + 1}</h4>
          {[['title','步骤名称',160],['description','目标与人工操作',4000],['tool','工具／模型',160],['parameters','参数（未知则留空）',2000],['prompt','输入提示词',10000],['outcome','结果与调整',4000]].map(([key,label,max]) => <label key={key}>{label}<textarea required={key === 'title'} rows={key === 'prompt' ? 4 : 2} maxLength={max} value={step[key]} onChange={e => stepChange(index,key,e.target.value)} /></label>)}
          {assets.some(asset=>asset.asset_type==='image') ? <label>步骤配图（可多选）<select multiple value={step.assetIds} onChange={e => stepChange(index,"assetIds",[...e.target.selectedOptions].map(o => o.value))}>{assets.filter(a => a.asset_type === "image").map(a => <option key={a.id} value={a.id}>{a.file_name}</option>)}</select></label> : <small>保存图片后，重新编辑草稿即可为步骤配图。</small>}
          <button type="button" onClick={() => storyChange("steps",form.story.steps.filter((_,i) => i !== index))}>移除此步骤</button>
        </section>)}
        <button type="button" disabled={form.story.steps.length >= 20} onClick={() => storyChange("steps",[...form.story.steps,emptyStep()])}>＋ 添加创作步骤</button>
        <label>经验与反思<textarea maxLength={4000} value={form.story.reflection} onChange={e => storyChange("reflection",e.target.value)} /></label>
        <label>编辑备注（仅上传者与审核人员可见）<textarea maxLength={8000} value={form.story.editorialNote} onChange={e => storyChange("editorialNote", e.target.value)} placeholder="资料整理说明、尚缺素材、核对情况等写在这里，不混入作者的创作反思。" /></label>
        {!!editorialIssues.length && <aside className="case-editorial-warning" role="status"><strong>公开文案需要调整</strong>{editorialIssues.map((issue, index) => <p key={`${issue.field}-${index}`}>{issue.message}</p>)}<small>可先保存草稿，调整后再提交审核。</small></aside>}
        <label className="case-checkbox"><input type="checkbox" checked={form.story.allowDocumentDownload} onChange={e => storyChange("allowDocumentDownload",e.target.checked)} />允许已发布案例的读者下载文档原件（需另获授权）</label>
        </div></details>
      </fieldset>
      {!published && !inManagement && reviewIssues.length > 0 && <aside className="case-checklist"><strong>{directPublish ? '发布前' : '提交审核前'}</strong><ul>{reviewIssues.map(issue=><li key={issue}>{issue}</li>)}</ul></aside>}
      </div>
      <footer className="case-editor-footer">
        {error && <p role="alert" className="case-error">{error}</p>}
        {progress && <div role="status"><p>上传 {progress.index} / {progress.total} · {progress.name} · {progress.percent === 100 ? '正在校验…' : `${progress.percent}%`}</p><progress aria-label="文件上传进度" max="100" value={progress.percent} /></div>}
        <div><span>{files.length>0 && !busy ? `${files.length} 个文件将上传` : published ? '保存后更新公开案例' : '草稿仅自己和有权限的人员可见'}</span>
          {busy && progress && <button type="button" className="case-editor-secondary" onClick={() => cancellation.current?.abort()}>取消上传</button>}
          <button className="publish-submit" disabled={busy}>{busy ? '正在保存…' : published || inManagement ? '保存修改' : '保存并预览'}</button>
        </div>
      </footer>
    </form>
  </div>, document.body);
}
