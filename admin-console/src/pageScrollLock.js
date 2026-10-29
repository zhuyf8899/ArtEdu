// Multiple dialogs can share the page (for example review -> document -> confirm).
// Restore the original inline style only after the last participating dialog closes.
const locks=new WeakMap();
export function lockPageScroll(ownerDocument=document){
 const body=ownerDocument.body;
 let state=locks.get(body);
 if(!state){state={count:0,overflow:body.style.overflow};locks.set(body,state);}
 state.count++;body.style.overflow='hidden';let released=false;
 return()=>{if(released)return;released=true;if(--state.count===0){body.style.overflow=state.overflow;locks.delete(body);}};
}
