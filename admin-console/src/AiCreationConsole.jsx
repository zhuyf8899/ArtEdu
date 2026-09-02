import { useMemo, useState } from "react";
import {
  ArrowUpRight, Browser, ChatCircleDots, CirclesThreePlus, Code,
  ImageSquare, Paperclip, Sparkle,
} from "@phosphor-icons/react";

const CREATION_METHODS = [
  {
    id: "ui",
    label: "UI 创作",
    eyebrow: "界面 / 图标 / 设计系统",
    placeholder: "例如：为艺术教育平台设计一套高对比度课程卡片，并说明信息层级……",
    jobType: "image",
    Icon: Browser,
  },
  {
    id: "pattern",
    label: "图案生成",
    eyebrow: "纹样 / 材质 / 视觉实验",
    placeholder: "例如：将宋代花窗与海浪结构组合成可连续平铺的蓝绿色纹样……",
    jobType: "pattern",
    Icon: CirclesThreePlus,
  },
  {
    id: "vibe",
    label: "Vibe Coding",
    eyebrow: "网页 / 交互 / 可运行原型",
    placeholder: "例如：创建一个展示学生 AI 艺术作品的响应式画廊，支持分类筛选……",
    jobType: "webpage",
    Icon: Code,
  },
];

const MODELS = [
  { id: "gpt-4o", name: "GPT-4o", note: "策划与视觉理解" },
  { id: "claude-4", name: "Claude 4", note: "长文本与代码" },
  { id: "flux-1", name: "FLUX.1", note: "图像生成" },
  { id: "qwen-image", name: "Qwen Image", note: "中文视觉创作" },
];

export function AiCreationConsole({ account, onCreate }) {
  const [methodId, setMethodId] = useState("ui");
  const [modelId, setModelId] = useState("gpt-4o");
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reply, setReply] = useState("先选择创作方法与模型，再描述你的想法。我会把它整理成可继续执行的创作任务。");

  const method = useMemo(() => CREATION_METHODS.find((item) => item.id === methodId) ?? CREATION_METHODS[0], [methodId]);
  const model = useMemo(() => MODELS.find((item) => item.id === modelId) ?? MODELS[0], [modelId]);

  const submit = async (event) => {
    event.preventDefault();
    const content = prompt.trim();
    if (!content || sending) return;
    setSending(true);
    setFailed(false);
    setReply(`正在用 ${model.name} 整理“${method.label}”任务，并写入生成队列……`);
    const result = await onCreate({
      jobType: method.jobType,
      prompt: content,
      parameters: { method: method.id, methodLabel: method.label, model: model.id },
    });
    setReply(result
      ? `任务 ${result.id.slice(0, 8)} 已创建。你可以继续补充风格、受众或输出尺寸。`
      : "创作请求已记录为演示状态；连接生成服务后即可执行完整任务。");
    setFailed(!result);
    setSending(false);
  };

  return <section className="ai-creation" aria-labelledby="ai-creation-title">
    <div className="ai-creation__intro">
      <span><Sparkle size={14} weight="fill" /> 多模型免费体验 · 校内账号直接使用</span>
      <h2 id="ai-creation-title">今天想<span>创作</span>什么？</h2>
      <p>选择方法与大模型，把灵感变成可以执行、学习和复用的艺术工作流。</p>
    </div>

    <form className="ai-composer" onSubmit={submit}>
      <div className="ai-methods" role="tablist" aria-label="AI 使用方法">
        {CREATION_METHODS.map(({ id, label, eyebrow, Icon }) => <button
          type="button"
          role="tab"
          aria-selected={methodId === id}
          className={methodId === id ? "is-active" : ""}
          key={id}
          onClick={() => setMethodId(id)}
        ><Icon size={17} weight="bold" /><span><strong>{label}</strong><small>{eyebrow}</small></span></button>)}
      </div>

      <div className="ai-conversation">
        <div className="ai-message ai-message--assistant">
          <span><ChatCircleDots size={17} weight="bold" /></span>
          <div><p>{reply}</p>{failed && <img className="ai-failure-image" src="/assets/generation-failure.png" alt="生成失败占位图" />}</div>
        </div>
        <label htmlFor="artedu-ai-prompt" className="sr-only">描述你的创作想法</label>
        <textarea
          id="artedu-ai-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={method.placeholder}
          rows={4}
        />
      </div>

      <div className="ai-composer__footer">
        <div className="model-picker">
          <span>模型接口</span>
          <div role="radiogroup" aria-label="选择大模型">
            {MODELS.map((item) => <button
              type="button"
              role="radio"
              aria-checked={modelId === item.id}
              title={item.note}
              className={modelId === item.id ? "is-active" : ""}
              key={item.id}
              onClick={() => setModelId(item.id)}
            >{item.name}</button>)}
          </div>
        </div>
        <div className="ai-composer__actions">
          <button type="button" className="ai-attach" aria-label="添加参考文件" title="添加参考文件"><Paperclip size={18} weight="bold" /></button>
          <button type="submit" className="ai-submit" disabled={!prompt.trim() || sending}>
            {sending ? "创建中" : `开始${method.label}`} <ArrowUpRight size={18} weight="bold" />
          </button>
        </div>
      </div>
      <div className="ai-composer__status"><ImageSquare size={14} /> 当前身份：{account.shortName} · {method.label} · {model.name}</div>
    </form>
  </section>;
}
