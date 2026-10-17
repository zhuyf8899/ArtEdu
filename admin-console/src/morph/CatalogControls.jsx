import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { useState } from 'react';

/** A single desktop filter language; callers retain their own taxonomy and query state. */
export function CatalogControls({ label, options, value, onChange, query, onQueryChange, searchLabel, placeholder, resultLabel, selected = [], onClear, dimensions, extra, actions, loading = false, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  // Keep an active category visible even after collapsing a long taxonomy.
  const shownOptions = expanded ? options : options.filter((option, index) => index < 8 || option.value === value);
  return <section className={`morph-discovery${compact ? ' morph-discovery--compact' : ''}`} aria-label={label} aria-busy={loading || undefined}>
    {dimensions && <div className="morph-discovery__dimensions">{dimensions}</div>}
    <div className="morph-discovery__main">
      <div className="morph-category-list" role="group" aria-label={`${label}分类`}>
        {shownOptions.map(option => <button type="button" key={option.value} className="morph-category" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.value !== options[0]?.value && <span className="morph-category__dot" aria-hidden="true"/>}
          <span>{option.label}</span>{option.count != null && <small>{option.count}</small>}
        </button>)}
        {options.length > 8 && <button type="button" className="morph-category-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '收起分类' : `更多分类（${options.length - shownOptions.length}）`}</button>}
      </div>
      <label className="morph-catalog-search"><MagnifyingGlass size={18} aria-hidden="true"/>
        <input type="search" value={query} onChange={event => onQueryChange(event.target.value)} aria-label={searchLabel} placeholder={placeholder}/>
        {query && <button type="button" onClick={() => onQueryChange('')} aria-label={`清除${searchLabel}`}><X size={16}/></button>}
      </label>
    </div>
    {extra && <div className="morph-discovery__extra">{extra}</div>}
    <div className={`morph-discovery__bottom${compact && !selected.length && !actions ? ' sr-only' : ''}`}>
      <span className="morph-discovery__result" role="status" aria-live="polite">{loading ? '正在加载…' : resultLabel}</span>
      <div className="morph-selected-filters">{selected.map((item, index) => <button type="button" key={`${item.label}-${index}`} onClick={item.onRemove} aria-label={`移除筛选：${item.label}`}>{item.label}<X size={13} aria-hidden="true"/></button>)}
        {selected.length > 0 && <button type="button" className="morph-clear-filters" onClick={onClear}>清除筛选</button>}
      </div>
      {actions && <div className="morph-discovery__actions">{actions}</div>}
    </div>
  </section>;
}
