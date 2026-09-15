export function CaseStoryView({ work }) {
  const story = work.story ?? {};
  const assets = work.assets ?? [];
  const media = assets.filter(asset => asset.asset_type !== "document");
  return <div className="case-story">
    <div className="case-meta"><span>{({ collected: "收集案例 · 外部创作", platform: "ArtEdu 创作", unspecified: "创作来源待补充" })[story.origin] ?? "创作来源待补充"}</span><span>原作者：{story.creators?.join("、") || "待补充"}</span><span>上传者：{work.author}</span><span>工具：{story.tools?.join("、") || "待补充"}</span><span>方式：{story.methods?.join("、") || "待补充"}</span></div>
    {!!media.length && <section><h3>成果与过程图集</h3><div className="case-gallery">{media.map(asset => <figure key={asset.id}>{asset.asset_type === "image" ? <img loading="lazy" src={asset.url} alt={asset.alt_text || asset.file_name} /> : <video controls preload="metadata" src={asset.url} />}<figcaption>{asset.file_name}</figcaption></figure>)}</div></section>}
    {!!story.steps?.length && <section><h3>创作过程</h3>{story.steps.map((step,index) => <article className="case-step" key={index}>
      <span>STEP {String(index + 1).padStart(2,'0')}</span><h4>{step.title}</h4>
      {step.description && <p>{step.description}</p>}
      {step.tool && <p>工具／模型：{step.tool}</p>}
      {step.parameters && <p>参数：{step.parameters}</p>}
      {step.prompt && <details><summary>查看输入提示词</summary><pre>{step.prompt}</pre></details>}
      {step.outcome && <><h5>结果与调整</h5><p>{step.outcome}</p></>}
      <div className="case-gallery">{(step.assetIds ?? []).map(id => assets.find(a => a.id === id && a.asset_type === "image")).filter(Boolean).map(a => <img key={a.id} loading="lazy" src={a.url} alt={`${step.title}配图`} />)}</div>
    </article>)}</section>}
    {story.reflection && <section><h3>经验与反思</h3><p>{story.reflection}</p></section>}
    {!!assets.filter(a => a.asset_type === "document").length && <section><h3>参考附件</h3>{assets.filter(a => a.asset_type === "document").map(a => <p key={a.id}>{a.canDownload ? <a href={a.url}>{a.file_name} · 下载原件</a> : <span>{a.file_name} · 未开放原件下载</span>}</p>)}</section>}
    {work.status !== "approved" && <p className="case-draft-note">当前为{work.status === "pending" ? "审核中" : "未发布"}案例，仅本人和审核人员可查看。</p>}
  </div>;
}
