import { useId } from "react";
import { learningLabels } from "./learningBindings.js";
import "./LearningBindings.css";

export function LearningBindingFields({ value, onChange, knowledgeOnly = false, disabled = false }) {
  const id = useId();
  const fields = knowledgeOnly ? [["knowledgePoints", "知识点", "例如：纹样提取、色彩搭配、构图层级"]] : [
    ["knowledgePoints", "关联知识点", "例如：纹样提取、提示词迭代"],
    ["tools", "涉及的工具", "例如：DeepSeek、Figma"],
    ["abilityGoals", "能力目标", "例如：比较两种配色方案并解释取舍"],
  ];
  return <div className="learning-binding-fields">{fields.map(([key, label, placeholder]) => {
    const labels = learningLabels(value?.[key]);
    const invalid = labels.length > 20 || labels.some((item) => item.length > 80);
    return <label key={key} htmlFor={`${id}-${key}`}><span>{label}<small>{labels.length} / 20</small></span>
      <textarea id={`${id}-${key}`} disabled={disabled} aria-invalid={invalid} aria-describedby={`${id}-${key}-help`} maxLength={2000} rows={3}
        value={Array.isArray(value?.[key]) ? value[key].join("\n") : value?.[key] ?? ""} placeholder={placeholder}
        onChange={(event) => onChange(key, event.target.value)} />
      <small id={`${id}-${key}-help`} className={invalid ? "is-error" : ""}>{invalid ? "最多 20 项，每项不超过 80 字。" : "每行一项，也可用逗号分隔；留空表示尚未配置。"}</small>
    </label>;
  })}</div>;
}
