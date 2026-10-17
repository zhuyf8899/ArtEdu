import { ArrowSquareOut } from "@phosphor-icons/react";
import { useState } from "react";
import { ImageLightbox } from "./ImageLightbox.jsx";
import { safeCaseSourceUrl } from "./caseStory.js";

export function CaseStoryView({ work, onOpenImage, exhibition = false, showMeta = true, showSource = true }) {
  const story = work.story ?? {};
  const assets = work.assets ?? [];
  const images = assets.filter(asset => asset.asset_type === "image" && (!exhibition || asset.url !== work.previewUrl));
  const relatedAssets = assets.filter(asset => asset.asset_type !== "image");
  // 管理审核与公开案例复用同一看图层，文件名仅用于原图下载。
  const [preview, setPreview] = useState(null);
  const openImage = onOpenImage ?? setPreview;
  const galleryImages = assets.filter(asset => asset.asset_type === "image");
  const previewIndex = galleryImages.findIndex(asset => asset.url === preview?.url);
  const previewAsset = (asset) => setPreview({ url: asset.url, fileName: asset.file_name, alt: `${work.title} · 作品图片` });
  return <div className={`case-story${exhibition ? " case-story--exhibition" : ""}`}>
    {showMeta && !exhibition && <div className="case-meta"><span>{({ collected: "收集案例 · 外部创作", platform: "ArtEdu 创作", unspecified: "创作来源待补充" })[story.origin] ?? "创作来源待补充"}</span><span>原作者：{story.creators?.join("、") || "待补充"}</span><span>上传者：{work.author}</span><span>工具：{story.tools?.join("、") || "待补充"}</span><span>方式：{story.methods?.join("、") || "待补充"}</span></div>}
    {!!images.length && <section><h3>成果与过程图集 <small className="case-gallery-count">{images.length} 张</small></h3><p className="case-gallery-hint">点击图片查看完整作品，可切换、缩放及下载原图。</p><div className="case-gallery">{images.map((asset,index) => <figure key={asset.id}><button type="button" className="case-image-button" aria-label={`查看图集图片 ${index + 1}`} onClick={() => openImage({ url: asset.url, fileName: asset.file_name, alt: `${work.title} · 作品图片 ${index + 1}` })}><img loading="lazy" src={asset.url} alt={`${work.title} · 作品图片 ${index + 1}`} /></button></figure>)}</div></section>}
    {!!story.steps?.length && <section><h3>创作过程</h3>{story.steps.map((step,index) => <article className="case-step" key={index}>
      <span>STEP {String(index + 1).padStart(2,'0')}</span><h4>{step.title}</h4>
      {step.description && <p>{step.description}</p>}
      {step.tool && <p>工具／模型：{step.tool}</p>}
      {step.parameters && <p>参数：{step.parameters}</p>}
      {step.prompt && <details><summary>查看输入提示词</summary><pre>{step.prompt}</pre></details>}
      {step.outcome && <><h5>结果与调整</h5><p>{step.outcome}</p></>}
      <div className="case-gallery">{(step.assetIds ?? []).map(id => assets.find(a => a.id === id && a.asset_type === "image")).filter(Boolean).map(a => <button className="case-image-button" key={a.id} onClick={() => openImage({ url: a.url, fileName: a.file_name, alt: `${step.title}配图` })}><img loading="lazy" src={a.url} alt={`${step.title}配图`} /></button>)}</div>
    </article>)}</section>}
    {story.reflection && <section><h3>经验与反思</h3><p>{story.reflection}</p></section>}
    {!!relatedAssets.length && <section><h3>相关内容</h3><div className="case-related-assets">{relatedAssets.map(asset => <article key={asset.id}>
      {asset.asset_type !== "video" && <header className="case-attachment__header"><strong>{asset.file_name}</strong><span>附件</span></header>}
      {asset.asset_type === "video" && <video controls preload="metadata" className="case-attachment__video" playsInline poster={exhibition ? work.previewUrl : undefined} src={asset.url} aria-label={`${work.title} · 作品视频`} />}
      <footer className="case-attachment__actions">{asset.canDownload ? <a href={asset.url} download>下载文件</a> : <em>作者未开放下载</em>}</footer>
    </article>)}</div></section>}
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
