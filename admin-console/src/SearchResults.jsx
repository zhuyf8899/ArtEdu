import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpenText, CirclesThreePlus, Funnel, ImageSquare,
  MagnifyingGlass, SpinnerGap, X,
} from "@phosphor-icons/react";
import { searchPortal } from "./services/adminApi.js";

const TYPE_FILTERS = [
  ["all", "全部"],
  ["course", "教学资源"],
  ["workflow", "工作流"],
  ["work", "案例社区"],
];

const TYPE_META = {
  course: { label: "教学资源", Icon: BookOpenText, route: "/learning" },
  workflow: { label: "工作流", Icon: CirclesThreePlus, route: "/studio" },
  work: { label: "案例社区", Icon: ImageSquare, route: "/community" },
};

export function SearchResults({ initialQuery, fallbackData, onSearch, onNavigate }) {
  const [draft, setDraft] = useState(initialQuery);
  const [payload, setPayload] = useState(() => fallbackSearch(initialQuery, fallbackData));
  const [type, setType] = useState("all");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setDraft(initialQuery);
    setType("all");
    setTag("");
    if (!initialQuery.trim()) {
      setPayload(fallbackSearch("", fallbackData));
      return;
    }
    let active = true;
    setLoading(true);
    searchPortal(initialQuery).then((result) => {
      if (!active) return;
      setPayload(result);
      setOffline(false);
    }).catch(() => {
      if (!active) return;
      setPayload(fallbackSearch(initialQuery, fallbackData));
      setOffline(true);
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [initialQuery, fallbackData, retryKey]);

  const visibleItems = useMemo(() => payload.items.filter((item) => {
    const matchesType = type === "all" || item.type === type;
    const matchesTag = !tag || item.tags.includes(tag);
    return matchesType && matchesTag;
  }), [payload.items, tag, type]);

  const counts = useMemo(() => ({
    all: payload.items.length,
    course: payload.items.filter((item) => item.type === "course").length,
    workflow: payload.items.filter((item) => item.type === "workflow").length,
    work: payload.items.filter((item) => item.type === "work").length,
  }), [payload.items]);

  const submit = (event) => {
    event.preventDefault();
    const query = draft.trim();
    if (query) onSearch(query);
  };

  return <section className="search-page" aria-labelledby="search-page-title">
    <header className="search-page__hero">
      <div><p className="eyebrow">// SEARCH EVERYTHING</p><h1 id="search-page-title">探索知识与<span>创作</span></h1><p>一次搜索教学资源、可复用工作流与师生案例。</p></div>
      <form onSubmit={submit}><MagnifyingGlass size={22} weight="bold" /><input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="搜索平台内容" placeholder="搜索课程、工作流、案例或标签" /><button disabled={!draft.trim()}>搜索 <ArrowRight size={17} weight="bold" /></button></form>
    </header>

    <div className="search-summary">
      <div><span>搜索关键词</span><strong>“{initialQuery || "输入关键词开始探索"}”</strong></div>
      <div><span>找到内容</span><strong>{visibleItems.length}<small> 项结果</small></strong></div>
      <div><span>内容范围</span><strong>{Object.values(counts).slice(1).filter(Boolean).length}<small> 个业务区</small></strong></div>
      {offline && <div className="search-offline"><em>当前使用本地展示数据</em><button onClick={() => setRetryKey((value) => value + 1)}>重新连接</button></div>}
    </div>

    <div className="search-layout">
      <aside className="search-filters">
        <header><Funnel size={18} weight="bold" /><div><strong>筛选结果</strong><span>按内容类型与标签</span></div></header>
        <div className="search-filter-group"><span>内容类型</span>{TYPE_FILTERS.map(([value, label]) => <button key={value} className={type === value ? "is-active" : ""} onClick={() => setType(value)}><i />{label}<b>{counts[value]}</b></button>)}</div>
        <div className="search-filter-group search-filter-group--tags"><span>相关标签</span><div>{payload.availableTags.map((item) => <button key={item} className={tag === item ? "is-active" : ""} onClick={() => setTag(tag === item ? "" : item)}>{item}</button>)}</div></div>
        {(type !== "all" || tag) && <button className="search-clear" onClick={() => { setType("all"); setTag(""); }}><X size={14} weight="bold" /> 清除筛选</button>}
      </aside>

      <div className="search-results">
        <header><div><span>// RESULTS</span><h2>{loading ? "正在整理结果…" : `${visibleItems.length} 项匹配内容`}</h2></div>{tag && <button onClick={() => setTag("")}>{tag} <X size={13} /></button>}</header>
        {loading ? <div className="search-state"><SpinnerGap className="spin" size={34} /><strong>正在搜索 ArtEdu</strong><p>正在汇总课程、工作流与案例内容。</p></div> : visibleItems.length ? <div className="search-result-list">{visibleItems.map((item, index) => <SearchCard key={`${item.type}-${item.id}`} item={item} index={index} onOpen={() => onNavigate(item.route ?? TYPE_META[item.type].route)} />)}</div> : <div className="search-state"><MagnifyingGlass size={38} weight="thin" /><strong>没有找到匹配内容</strong><p>尝试减少筛选标签，或搜索“AI 设计”“传统纹样”“网页”等关键词。</p><button onClick={() => { setType("all"); setTag(""); setDraft(""); }}>重新搜索</button></div>}
      </div>
    </div>
  </section>;
}

function SearchCard({ item, index, onOpen }) {
  const { Icon, label } = TYPE_META[item.type];
  return <article className={`search-card search-card--${index % 3}`}>
    <div className="search-card__visual"><Icon size={33} weight="thin" /><span>{String(index + 1).padStart(2, "0")}</span></div>
    <div className="search-card__body"><div className="search-card__type"><b>{label}</b><span>{item.category}</span></div><h3>{item.title}</h3><p>{item.summary || "该内容暂未填写简介。"}</p><div className="search-card__tags">{item.tags.slice(0, 5).map((itemTag) => <span key={itemTag}>{itemTag}</span>)}</div><footer><small>作者 / {item.author}</small><button onClick={onOpen}>进入{label} <ArrowRight size={16} weight="bold" /></button></footer></div>
  </article>;
}

function fallbackSearch(query, data) {
  const keyword = query.trim().toLowerCase();
  const candidates = [
    ...(data.courses ?? []).map((item) => ({ id: item.id, type: "course", title: item.title, summary: item.summary, category: item.category ?? "课程", author: item.author ?? "ArtEdu 教学团队", tags: ["教学资源", item.method, item.category, ...(item.tools ?? [])].filter(Boolean), route: "/learning" })),
    ...(data.workflows ?? []).map((item) => ({ id: item.id, type: "workflow", title: item.name, summary: item.description, category: item.category ?? "工作流", author: "ArtEdu 教学团队", tags: ["工作流", item.category].filter(Boolean), route: "/studio" })),
    ...(data.works ?? []).map((item) => ({ id: item.id, type: "work", title: item.title, summary: item.summary, category: item.discipline ?? "案例", author: item.author ?? "ArtEdu 用户", tags: ["案例社区", item.discipline].filter(Boolean), route: "/community" })),
  ];
  const items = keyword ? candidates.filter((item) => `${item.title}${item.summary}${item.category}${item.author}${item.tags.join("")}`.toLowerCase().includes(keyword)) : [];
  return { query, items, availableTags: [...new Set(items.flatMap((item) => item.tags))] };
}
