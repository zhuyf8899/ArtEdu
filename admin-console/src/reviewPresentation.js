export const reviewStatusLabels = { pending: "待审核", approved: "已通过", rejected: "已驳回" };

export function reviewDate(value) {
  if (!value) return "暂无提交时间";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "暂无提交时间" : new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

// 未加载完整正文、状态不一致或已处理时，不能直接发起审核。
export function canDecideReview(review, work) {
  return Boolean(review?.status === "pending" && work?.status === "pending" && review.id === work.id);
}
