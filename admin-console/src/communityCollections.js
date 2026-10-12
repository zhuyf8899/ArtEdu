export const CASE_COLLECTIONS = { "art-selection": "精选艺术案例", community: "社区案例" };
// 缺少归属的旧案例留在社区区；收藏/热度和外部来源不等于平台精选。
export function splitCommunityCollections(works) {
  return {
    "art-selection": works.filter(work => work.collection === "art-selection"),
    community: works.filter(work => work.collection !== "art-selection"),
  };
}
