/**
 * 流式正文的合帧缓冲。
 *
 * 为什么要它：SSE 增量是按网络分片到达的，长回复往往一秒几十上百帧。每一帧都
 * 直接 setState 会让整个对话区从头渲染一遍，正文越长越卡——这是"Agent 输出时
 * 前端发卡"的主因。这里把增量攒起来，每帧只交付一次，渲染次数从"按帧"降到
 * "按刷新率"，而且不会丢字：收尾前调用 flush()／take() 就能拿到剩余部分。
 *
 * 逻辑与渲染无关，独立成模块以便直接跑单元测试。
 */

/** 浏览器里用 requestAnimationFrame；没有它（测试、极老环境）退回 16ms 定时器。 */
export function createFrameScheduler() {
  if (typeof requestAnimationFrame === "function" && typeof cancelAnimationFrame === "function") {
    return { schedule: (run) => requestAnimationFrame(run), cancel: (handle) => cancelAnimationFrame(handle) };
  }
  return { schedule: (run) => setTimeout(run, 16), cancel: (handle) => clearTimeout(handle) };
}

export function createDeltaBuffer({ onFlush, scheduler = createFrameScheduler() }) {
  let pending = "";
  let handle = null;

  const cancelFrame = () => {
    if (handle === null) return;
    scheduler.cancel(handle);
    handle = null;
  };

  /** 交付已攒下的增量；没有内容时不触发回调（避免空渲染）。 */
  const flush = () => {
    cancelFrame();
    if (!pending) return "";
    const text = pending;
    pending = "";
    onFlush(text);
    return text;
  };

  return {
    push(text) {
      const piece = String(text ?? "");
      if (!piece) return;
      pending += piece;
      // 同一帧内多次到达只排一次交付。
      if (handle === null) handle = scheduler.schedule(flush);
    },
    /** 取消已排队的那一帧，但内容仍留在缓冲里，等 flush()/take() 处理。 */
    cancelFrame,
    flush,
    /** 取走尚未交付的内容且不触发回调；收尾时用它把最后一段并进最终结果。 */
    take() {
      cancelFrame();
      const text = pending;
      pending = "";
      return text;
    },
    get pending() {
      return pending;
    },
  };
}
