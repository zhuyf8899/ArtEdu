export const CASE_COLLECTIONS = { "art-selection": "精选艺术案例", community: "社区案例" };

export function caseCollectionLabel(work) {
  return CASE_COLLECTIONS[work.collection === "art-selection" ? "art-selection" : "community"];
}
