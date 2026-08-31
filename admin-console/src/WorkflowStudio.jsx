import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, Clock, Path, Play, SpinnerGap } from "@phosphor-icons/react";
import { getWorkflow, getWorkflows, startWorkflowRun, updateWorkflowRun } from "./services/adminApi.js";

export function WorkflowStudio({ fallbackWorkflows, onNotice }) {
  const [workflows, setWorkflows] = useState(fallbackWorkflows);
  const [selected, setSelected] = useState(null);
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getWorkflows().then((payload) => {
      if (payload.items?.length) setWorkflows(payload.items);
    }).catch(() => {});
  }, []);

  const open = async (workflow) => {
    setLoading(true);
    try {
      setSelected(await getWorkflow(workflow.id));
      setRun(null);
    } catch (error) {
      onNotice(error.message);
    } finally {
      setLoading(false);
    }
  };

  const start = async () => {
    setLoading(true);
    try {
      const next = await startWorkflowRun(selected.id, { source: "web-studio" });
      setRun(next);
      onNotice("工作流已开始，系统会保存每一步学习记录");
    } catch (error) {
      onNotice(error.message);
    } finally {
      setLoading(false);
    }
  };

  const completeStep = async () => {
    setLoading(true);
    try {
      const next = await updateWorkflowRun(run.id, { stepIndex: run.currentStep, action: "complete" });
      setRun(next);
      onNotice(next.status === "completed" ? "工作流已完成" : "步骤已完成，进入下一步");
    } catch (error) {
      onNotice(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (selected) {
    const activeStep = run?.steps?.[run.currentStep] ?? selected.steps?.[run?.currentStep ?? 0];
    const progress = run?.totalSteps ? Math.round((run.currentStep / run.totalSteps) * 100) : 0;
    return <section className="workflow-player">
      <button className="learning-back" onClick={() => { setSelected(null); setRun(null); }}><ArrowLeft size={16} weight="bold" /> 返回工作流</button>
      <header><div><span>{selected.category} · V{selected.versionNumber ?? 1}</span><h2>{selected.name}</h2><p>{selected.description}</p></div><aside><strong>{selected.stepCount ?? selected.steps?.length ?? 0}</strong><span>个步骤</span></aside></header>
      <div className="workflow-player__progress"><i><b style={{ width: `${run?.status === "completed" ? 100 : progress}%` }} /></i><span>{run?.status === "completed" ? "全部完成" : `${progress}%`}</span></div>
      {!run && <div className="workflow-start"><Path size={48} weight="thin" /><strong>准备开始这条创作路径</strong><p>每一步都可以独立完成，不需要真实模型接口；需要生成内容的步骤会保留输入和参数。</p><button disabled={loading || !selected.versionId} onClick={start}><Play size={18} weight="fill" /> 开始工作流</button>{!selected.versionId && <small>该工作流还没有发布教学版本</small>}</div>}
      {run?.status === "in_progress" && activeStep && <article className="workflow-step"><span>STEP {String(run.currentStep + 1).padStart(2, "0")} / {run.totalSteps}</span><h3>{activeStep.title}</h3><p>{activeStep.description}</p>{activeStep.instruction && <div><small>// 操作说明</small>{activeStep.instruction}</div>}<footer><em><Clock size={16} /> 约 {activeStep.estimatedMinutes ?? 10} 分钟</em><button disabled={loading} onClick={completeStep}>{loading ? <SpinnerGap className="spin" /> : <CheckCircle size={18} weight="fill" />} 完成这一步</button></footer></article>}
      {run?.status === "completed" && <div className="workflow-complete"><CheckCircle size={54} weight="fill" /><strong>创作路径已完成</strong><p>本次步骤记录已保存，可以把成果整理后发布到案例社区。</p></div>}
      <div className="workflow-outline">{selected.steps?.map((step, index) => <div key={step.id ?? index} className={run && index < run.currentStep ? "is-complete" : run && index === run.currentStep ? "is-current" : ""}><span>{index + 1}</span><strong>{step.title}</strong><ArrowRight size={15} /></div>)}</div>
    </section>;
  }

  return <section className="workflow-catalog">{workflows.map((workflow, index) => <article key={workflow.id}>
    <div className={`workflow-catalog__cover workflow-catalog__cover--${index % 3}`}><Path size={36} weight="thin" /><span>{workflow.stepCount ?? "—"} STEPS</span></div>
    <div><small>{workflow.category}</small><h3>{workflow.name}</h3><p>{workflow.description}</p><button disabled={loading} onClick={() => open(workflow)}>查看并开始 <ArrowRight size={16} weight="bold" /></button></div>
  </article>)}</section>;
}
