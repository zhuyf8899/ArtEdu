// Private draft/workflow outages must not blank an otherwise healthy public gallery.
// Authentication failures still propagate; no permission checks are bypassed.
export async function loadCommunityCatalog({ catalog, mine, workflows }) {
  const results = await Promise.allSettled([catalog(), mine(), workflows()]);
  const [published, drafts, paths] = results;
  if(published.status === 'rejected') throw published.reason;
  const authFailure = results.find(result => result.status === 'rejected' && [401,403].includes(result.reason?.status));
  if(authFailure) throw authFailure.reason;
  return {
    works: published.value.items ?? [],
    myWorks: drafts.status === 'fulfilled' ? drafts.value.items ?? [] : [],
    workflows: paths.status === 'fulfilled' ? paths.value.items ?? [] : [],
    supportError: [drafts.status === 'rejected' && '我的草稿暂时无法同步', paths.status === 'rejected' && '关联工作流暂时无法同步'].filter(Boolean).join('；'),
  };
}
export function mergeWorkRecord(items, work) {
  return items.map(item => item.id === work.id ? { ...item, ...work } : item);
}
