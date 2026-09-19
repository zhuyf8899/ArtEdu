export function CaseStoryView({ work, onOpenImage }) {
  const story = work.story ?? {};
  const assets = work.assets ?? [];
  const images = assets.filter(asset => asset.asset_type === "image");
  const relatedAssets = assets.filter(asset => asset.asset_type !== "image");
  return <div className="case-story">
    <div className="case-meta"><span>{({ collected: "收集案例 · 外部创作", platform: "ArtEdu 创作", unspecified: "创作来源待补充" })[story.origin] ?? "创作来源待补充"}</span><span>原作者：{story.creators?.join("、") || "待补充"}</span><span>上传者：{work.author}</span><span>工具：{story.tools?.join("、") || "待补充"}</span><span>方式：{story.methods?.join("、") || "待补充"}</span></div>
    {!!images.length && <section><h3>成果与过程图集</h3><div className="case-gallery">{images.map(asset => <figure key={asset.id}><button className="case-image-button" onClick={() => onOpenImage?.({ url: asset.url, fileName: asset.file_name, alt: asset.alt_text })}><img loading="lazy" src={asset.url} alt={asset.alt_text || asset.file_name} /></button><figcaption>{asset.file_name}</figcaption></figure>)}</div></section>}
    {!!story.steps?.length && <section><h3>创作过程</h3>{story.steps.map((step,index) => <article className="case-step" key={index}>
      <span>STEP {String(index + 1).padStart(2,'0')}</span><h4>{step.title}</h4>
      {step.description && <p>{step.description}</p>}
      {step.tool && <p>工具／模型：{step.tool}</p>}
      {step.parameters && <p>参数：{step.parameters}</p>}
      {step.prompt && <details><summary>查看输入提示词</summary><pre>{step.prompt}</pre></details>}
      {step.outcome && <><h5>结果与调整</h5><p>{step.outcome}</p></>}
      <div className="case-gallery">{(step.assetIds ?? []).map(id => assets.find(a => a.id === id && a.asset_type === "image")).filter(Boolean).map(a => <button className="case-image-button" key={a.id} onClick={() => onOpenImage?.({ url: a.url, fileName: a.file_name, alt: `${step.title}配图` })}><img loading="lazy" src={a.url} alt={`${step.title}配图`} /></button>)}</div>
    </article>)}</section>}
    {story.reflection && <section><h3>经验与反思</h3><p>{story.reflection}</p></section>}
    {!!relatedAssets.length && <section><h3>相关内容</h3><div className="case-related-assets">{relatedAssets.map(asset => <article key={asset.id}>
      <header className="case-attachment__header"><strong>{asset.file_name}</strong><span>{asset.asset_type === "video" ? "视频文件" : "附件"}</span></header>
      {asset.asset_type === "video" && <video controls preload="metadata" className="case-attachment__video" src={asset.url} aria-label={asset.file_name} />}
      <footer className="case-attachment__actions">{asset.canDownload ? <a href={asset.url} download>下载文件</a> : <em>作者未开放下载</em>}</footer>
    </article>)}</div></section>}
    {work.status !== "approved" && <p className="case-draft-note">当前为{work.status === "pending" ? "审核中" : "未发布"}案例，仅本人和审核人员可查看。</p>}
  </div>;
}
