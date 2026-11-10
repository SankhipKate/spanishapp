// Local review history is the durable outbox, including records from old versions.
// Cloud keys are deterministic and inserts use ignore-duplicates on (user_id,event_id).
export function missingCloudEvents(localHistory,cloudIds,eventUUID){
 const seen=new Set();
 const missing=[];
 for(const event of Array.isArray(localHistory)?localHistory:[]){
   if(!event||typeof event.id!=='string'||!Number.isFinite(event.at)||
      !['easy','hard','again'].includes(event.rating))continue;
   const key=eventUUID(event);
   if(cloudIds.has(key)||seen.has(key))continue;
   seen.add(key);
   missing.push(event);
 }
 return missing;
}
