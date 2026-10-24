// One atom counts once across courses and versions. Preserve the latest learned version as evidence.
export function portraitAtoms(rows=[]) {
 const groups=new Map();
 for(const row of rows){const prev=groups.get(row.id);if(!prev||Boolean(row.stage)>Boolean(prev.stage)||Boolean(row.stage)===Boolean(prev.stage)&&row.revision>prev.revision)groups.set(row.id,row);}
 return [...groups.values()].map(row=>({...row,history:rows.filter(item=>item.id===row.id&&item.stage).sort((a,b)=>b.revision-a.revision),title:row.payload?.title||'未命名原子',summary:row.payload?.summary||'',knowledge:row.payload?.knowledge||[],direction:row.payload?.direction||'待标注',completion:row.payload?.completion,minutes:row.payload?.minutes||0}));
}
