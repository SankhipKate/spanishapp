// Keep the newest state (including removals) for each flag independently.
export function mergeFlagMaps(local={},remote={}){
 const merged=structuredClone(local||{});
 for(const [id,flags] of Object.entries(remote||{})){
  merged[id]??={};
  for(const tag of ['fix','repeat','mastered']){
   const candidate=flags?.[tag];
   if(candidate&&(!merged[id][tag]||candidate.at>merged[id][tag].at))merged[id][tag]=candidate;
  }
  if(flags?.snapshot&&!merged[id].snapshot)merged[id].snapshot=flags.snapshot;
 }
 return merged;
}
