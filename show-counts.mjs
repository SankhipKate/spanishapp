export const showCountKey=({day,source_id})=>`${day}:${source_id}`;

export function mergeShowCounts(target,rows){
 for(const row of rows){
  if(typeof row?.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.day)||
     typeof row.source_id!=='string'||!/^([a-f0-9]{8}-)([a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(row.source_id)||
     !Number.isInteger(row.count)||row.count<1||row.count>2147483647)continue;
  const date=new Date(row.day+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==row.day||row.day.startsWith('0000'))continue;
  const counter={day:row.day,source_id:row.source_id.toLowerCase(),count:row.count};
  const key=showCountKey(counter);
  if(counter.count>(target.get(key)?.count||0))target.set(key,counter);
 }
 return target;
}

export function showsByDay(counts){
 const days=new Map();
 for(const {day,count} of counts.values())days.set(day,(days.get(day)||0)+count);
 return days;
}
