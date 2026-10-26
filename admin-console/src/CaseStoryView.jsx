import { ArrowSquareOut } from "@phosphor-icons/react";
import { useState } from "react";
import { ImageLightbox } from "./ImageLightbox.jsx";
import { safeCaseSourceUrl } from "./caseStory.js";
import { DocumentPreviewDialog } from './DocumentPreview.jsx';
import { previewKind } from './documentPreview.js';

function CaseAttachments({ assets, work, exhibition, title }) {
  const [document, setDocument] = useState(null);
  if (!assets.length) return null;
  const multipleVideos = assets.filter(asset => asset.asset_type === "video").length > 1;
  return <><section className="case-media-section"><h3>{title}</h3><div className={`case-related-assets${multipleVideos ? " case-related-assets--multiple-videos" : ""}`}>{assets.map(asset => <article className={`case-attachment${asset.asset_type === "video" ? " case-attachment--video" : ""}`} key={asset.id}>
    {asset.asset_type !== "video" && <header className="case-attachment__header"><strong>{asset.file_name}</strong><span>{asset.external_url ? "原作资料" : "附件"}</span></header>}
    {asset.asset_type === "video" && <video controls preload="metadata" className="case-attachment__video" playsInline poster={exhibition ? work.previewUrl : undefined} src={asset.url} aria-label={`${work.title} · 作品视频`} />}
    <footer className="case-attachment__actions">{asset.asset_type !== 'video' && asset.canDownload && asset.url?.startsWith('/api/') && previewKind(asset.file_name,asset.mime_type) !== 'unsupported' && <button type="button" className="course-material__preview-button" onClick={() => setDocument(asset)}>在线预览</button>}{asset.canDownload ? <a href={asset.url} download>下载文件</a> : asset.external_url ? <a href={asset.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">查看原始资料</a> : <em>作者未开放下载</em>}</footer>
  </article>)}</div></section>{document && <DocumentPreviewDialog fileName={document.file_name} mimeType={document.mime_type} src={document.url} downloadUrl={document.url} onClose={() => setDocument(null)} />}</>;
}

export function CaseStoryView({ work, onOpenImage, exhibition = false, showMeta = true, showSource = true, showNavigation = true }) {
  const story = work.story ?? {};
  const assets = work.assets ?? [];
  const images = assets.filter(asset => asset.asset_type === "image" && (!exhibition || asset.url !== work.previewUrl));
  const videos = assets.filter(asset => asset.asset_type === "video");
  const documents = assets.filter(asset => asset.asset_type !== "image" && asset.asset_type !== "video");
  // 管理审核与公开案例复用同一看图层，文件名仅用于原图下载。
  const [preview, setPreview] = useState(null);
  const openImage = onOpenImage ?? setPreview;
  const galleryImages = assets.filter(asset => asset.asset_type === "image");
  const previewIndex = galleryImages.findIndex(asset => asset.url === preview?.url);
  const previewAsset = (asset) => setPreview({ url: asset.url, fileName: asset.file_name, alt: `${work.title} · 作品图片` });
  const [expandedSteps,setExpandedSteps]=useState({});
  return <div className={`case-story${exhibition ? " case-story--exhibition" : ""}`}>
    {showNavigation&&<nav className="case-reading-nav" aria-label="案例阅读目录">{images.length>0&&<a href="#case-gallery">作品图集</a>}{videos.length>0&&<a href="#case-video">作品影像</a>}{story.steps?.length>0&&<a href="#case-process">创作过程 · {story.steps.length} 步</a>}{story.reflection&&<a href="#case-reflection">经验与反思</a>}<a href="#case-discussion-heading">跳到讨论 ↓</a></nav>}
    {showMeta && !exhibition && <div className="case-meta"><span>{({ collected: "收集案例 · 外部创作", platform: "ArtEdu 创作", unspecified: "创作来源待补充" })[story.origin] ?? "创作来源待补充"}</span><span>原作者：{story.creators?.join("、") || "待补充"}</span><span>上传者：{work.author}</span><span>工具：{story.tools?.join("、") || "待补充"}</span><span>方式：{story.methods?.join("、") || "待补充"}</span></div>}
    <div id="case-video"><CaseAttachments assets={videos} work={work} exhibition={exhibition} title="作品影像" /></div>
    {!!images.length && <section id="case-gallery"><h3>{exhibition ? "作品图集" : "成果与过程图集"} <small className="case-gallery-count">{images.length} 张</small></h3><p className="case-gallery-hint">点击图片查看完整作品，可切换、缩放及下载原图。</p><div className="case-gallery">{images.map((asset,index) => <figure key={asset.id}><button type="button" className="case-image-button" aria-label={`查看图集图片 ${index + 1}`} onClick={() => openImage({ url: asset.url, fileName: asset.file_name, alt: `${work.title} · 作品图片 ${index + 1}` })}><img loading="lazy" src={asset.url} alt={`${work.title} · 作品图片 ${index + 1}`} /></button></figure>)}</div></section>}
    {!!story.steps?.length && <section id="case-process"><header className="case-process-heading"><h3>创作过程</h3><button onClick={()=>setExpandedSteps(Object.fromEntries(story.steps.map((_,i)=>[i,!story.steps.every((_,j)=>expandedSteps[j])])))}>{story.steps.every((_,i)=>expandedSteps[i])?'收起全部':'展开全部'}</button></header>{story.steps.map((step,index) => <details className="case-step" key={index} open={Boolean(expandedSteps[index])} onToggle={e=>{const open=e.currentTarget.open;setExpandedSteps(current=>current[index]===open?current:{...current,[index]:open});}}><summary>
      <span>STEP {String(index + 1).padStart(2,'0')}</span><h4>{step.title}</h4>
      <small>{(step.assetIds??[]).length} 张过程图 · 展开阅读</small></summary>
      {step.description && <p>{step.description}</p>}
      {step.tool && <p>工具／模型：{step.tool}</p>}
      {step.parameters && <p>参数：{step.parameters}</p>}
      {step.prompt && <details><summary>查看输入提示词</summary><pre>{step.prompt}</pre></details>}
      {step.outcome && <><h5>结果与调整</h5><p>{step.outcome}</p></>}
      <div className="case-gallery">{(step.assetIds ?? []).map(id => assets.find(a => a.id === id && a.asset_type === "image")).filter(Boolean).map(a => <button className="case-image-button" key={a.id} onClick={() => openImage({ url: a.url, fileName: a.file_name, alt: `${step.title}配图` })}><img loading="lazy" src={a.url} alt={`${step.title}配图`} /></button>)}</div>
    </details>)}</section>}
    {story.reflection && <section id="case-reflection"><h3>经验与反思</h3><p>{story.reflection}</p></section>}
    <CaseAttachments assets={documents} work={work} exhibition={exhibition} title="附件资料" />
    {preview && <ImageLightbox src={preview.url} fileName={preview.fileName} alt={preview.alt} variant="gallery" onClose={() => setPreview(null)} gallery={{ index: previewIndex, count: galleryImages.length, onPrevious: previewIndex > 0 ? () => previewAsset(galleryImages[previewIndex - 1]) : null, onNext: previewIndex + 1 < galleryImages.length ? () => previewAsset(galleryImages[previewIndex + 1]) : null }} />}
    {showSource && <CaseSourceFooter story={story} />}
    {work.status !== "approved" && <p className="case-draft-note">当前为{work.status === "pending" ? "审核中" : "未发布"}案例，仅本人和审核人员可查看。</p>}
  </div>;
}

export function CaseSourceFooter({ story }) {
  const sourceUrl = safeCaseSourceUrl(story.sourceUrl);
  const originalUrl = safeCaseSourceUrl(story.originalUrl);
  if (story.origin !== "collected" || !(story.sourceName || sourceUrl || originalUrl || story.exhibitionName || story.exhibitionYear)) return null;
  return <footer className="case-source-footer" aria-label="作品来源与展览信息">
    <dl>
      {(story.sourceName || sourceUrl) && <div><dt>来源网站</dt><dd>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{story.sourceName || new URL(sourceUrl).hostname}<ArrowSquareOut size={17} aria-hidden="true" /></a> : story.sourceName}</dd></div>}
      {(story.exhibitionName || story.exhibitionYear) && <div><dt>展览信息</dt><dd>{[story.exhibitionName, story.exhibitionYear].filter(Boolean).join(" · ")}</dd></div>}
    </dl>
    {originalUrl && <a className="case-source-footer__original" href={originalUrl} target="_blank" rel="noopener noreferrer">查看原作<ArrowSquareOut size={19} aria-hidden="true" /><span className="sr-only">（在新窗口打开）</span></a>}
  </footer>;
}
