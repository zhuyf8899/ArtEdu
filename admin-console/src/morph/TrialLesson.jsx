import './content-catalog.css';

/** Structured plain text, not arbitrary HTML from imported documents. */
export function TrialLesson({teaching}) {
  if(!teaching?.sections?.length)return null;
  return <section className="trial-lesson" aria-label="试学讲义">
    <p className="catalog-notice">{teaching.notice}</p>
    <div className="trial-lesson-sections">{teaching.sections.map((s,i)=><section key={i}><h4>{s.heading}</h4><p>{s.text}</p></section>)}</div>
    {teaching.visual==='color'&&<figure className="trial-example"><div className="trial-swatches">{['#243c62','#4f79ae','#bbd4ee'].map(color=><span key={color} style={{background:color}}><code>{color}</code></span>)}</div><figcaption>观察示例：比较同一色相倾向的明暗与鲜艳程度。色值仅为练习参考。</figcaption></figure>}
    {teaching.visual==='type'&&<figure className="trial-example trial-type-example"><div><strong>艺术与日常 Art & Life</strong><span>展览介绍 · 2026</span><p>用同一内容观察文字形态、信息层级与留白。</p></div><figcaption>排版示例：标题、辅助信息、正文三档层级；请在自己的字体环境中复核效果。</figcaption></figure>}
    {teaching.visual==='grid'&&<figure className="trial-example"><div className="trial-grid-example">{Array.from({length:12},(_,i)=><span key={i}>{i+1}</span>)}</div><figcaption>12 栏示意图；边距和栏间距应按自己的画布尺寸计算，不将示意图当作尺寸标尺。</figcaption></figure>}
  </section>;
}
