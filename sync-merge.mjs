export function mergeReviewMaps(oldMap,newMap){
 const result={...(oldMap||{})};
 for(const [id,review] of Object.entries(newMap||{}))if(review&&Number.isFinite(review.updated)&&(!result[id]||!Number.isFinite(result[id].updated)||review.updated>result[id].updated))result[id]=review;
 return result;
}
export function mergeHistoryEvents(oldEvents,newEvents,eventUUID){
 const byId=new Map();
 for(const e of [...(oldEvents||[]),...(newEvents||[])])if(e&&Number.isFinite(e.at)&&e.id)byId.set(eventUUID(e),e);
 return [...byId.values()].sort((a,b)=>a.at-b.at);
}
