/**
 * 「建议提问内容」：解析模型输出，并把结果挂到正确的那条回复上。
 *
 * 这里刻意做成纯函数模块：建议提问是"先显示回复、再补上后续提问"的两段式流程，
 * 定位逻辑出错时界面只会静默地少一块内容（不报错），必须能被单元测试直接盯住。
 */

/** 模型偶尔会把 JSON 包在解释文字或代码围栏里，只取第一个数组字面量。 */
export function parseFollowupQuestions(raw) {
  const text = String(raw ?? "").trim();
  const arrayText = text.match(/\[[\s\S]*\]/)?.[0];
  if (!arrayText) return [];
  try {
    const parsed = JSON.parse(arrayText);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length >= 4 && item.length <= 100))].slice(0, 3);
  } catch {
    return [];
  }
}

/** 模型没给出可用建议时的兜底提问，保证这一块永远不是空的。 */
export function fallbackFollowupQuestions() {
  return ["能结合一个具体例子再解释一下吗？", "这一步有哪些常见错误需要避免？", "接下来我可以做什么练习来巩固？"];
}

/** 模型建议 + 兜底建议合并去重，最多三条。 */
export function mergeFollowupQuestions(questions, fallback = fallbackFollowupQuestions(), limit = 3) {
  return [...new Set([...(questions ?? []), ...fallback])].slice(0, limit);
}

/**
 * 找出这条回复在当前消息列表中的位置。
 *
 * 不能用"数组长度"或"最后一条"来判断：会话在长对话里会被自动压缩，历史条数会变；
 * 用户也可能在建议回来之前就已经发了新消息。只有按"助手回复 + 正文相同"从后往前
 * 找，才能在两种情况下都把建议挂到对的那一条上（找不到就返回 -1，宁可不显示）。
 */
export function findReplyIndex(messages, content) {
  if (!Array.isArray(messages) || !content) return -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && message.content === content) return index;
  }
  return -1;
}

/** 把建议写进指定回复，返回新的消息数组；索引无效时原样返回。 */
export function withSuggestions(messages, index, suggestions) {
  if (!Array.isArray(messages) || index < 0 || index >= messages.length) return messages;
  return messages.map((message, current) => (current === index ? { ...message, suggestions } : message));
}
