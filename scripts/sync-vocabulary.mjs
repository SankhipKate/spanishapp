import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseCSV, toWords} from '../engine.mjs';

export const SHEET_ID='1-2iEgY-dPHprOXpMZ--IBFe2mvDp2Ji9EywGTpcg9Ns';
export const SHEET_GID='0';
export const OUTPUT='words.json';

export function makeSnapshot(csv, previous=null, now=new Date()) {
  if (/^\s*(?:<!doctype html|<html)/i.test(csv)) throw new Error('Google returned HTML instead of CSV');
  const rows=parseCSV(csv);
  const words=toWords(rows);
  if (words.length < 1) throw new Error('No valid vocabulary rows in Google Sheet');
  if (previous?.count >= 20 && words.length < previous.count * .7) {
    throw new Error(`Safety check: vocabulary decreased from ${previous.count} to ${words.length}; refusing to overwrite`);
  }
  return {source:'google-sheets', sheetId:SHEET_ID, gid:SHEET_GID, updatedAt:now.toISOString(), count:words.length, words:words.map(({ru,es})=>({ru,es}))};
}

export async function sync({fetcher=fetch, output=OUTPUT}={}) {
  const urls=[
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out%3Acsv&gid=${SHEET_GID}`
  ];
  let csv, lastError;
  for (const url of urls) {
    try {
      const response=await fetcher(url,{headers:{'User-Agent':'SpanishApp-Vocabulary-Sync/1.0'},signal:AbortSignal.timeout(20000),redirect:'follow'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body=await response.text();
      if (/^\s*(?:<!doctype html|<html)/i.test(body)) throw new Error('Google returned HTML');
      if (!body.trim()) throw new Error('Empty response');
      csv=body;break;
    } catch (error) {lastError=error;}
  }
  if (!csv) throw new Error(`Cannot download Google Sheet CSV: ${lastError?.message||'unknown error'}`);
  let previous=null;
  try {previous=JSON.parse(await readFile(output,'utf8'));} catch(e) {if(e.code!=='ENOENT')throw e;}
  const snapshot=makeSnapshot(csv,previous);
  // Preserve the timestamp when the words have not changed, avoiding pointless commits.
  if (previous && JSON.stringify(previous.words)===JSON.stringify(snapshot.words)) {
    console.log(`No changes: ${snapshot.count} words`);
    return {changed:false,count:snapshot.count};
  }
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(snapshot,null,2)+'\n','utf8');
  console.log(`Updated ${output}: ${snapshot.count} words`);
  return {changed:true,count:snapshot.count};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  sync().catch(error=>{console.error(error.message);process.exitCode=1;});
}
