/* promote-agent.mjs: copy the TESTED local (dev) agent's instructions, systemPrompt and tools to the PRODUCTION agent.
 * This is the standing path for every future agent change: edit and test on the temp agent, then promote with this script.
 *   NODE_USE_SYSTEM_CA=1 node promote-agent.mjs                                  preflight, READ-ONLY, prints the exact diff
 *   NODE_USE_SYSTEM_CA=1 node promote-agent.mjs --execute --expect-prod=<instr8>:<sys8>:<tools8> --expect-temp=<instr8>:<sys8>:<tools8>
 *   NODE_USE_SYSTEM_CA=1 node promote-agent.mjs --rollback=<snapshot.json> --execute
 * Copies: instructions, systemPrompt, tools. Never copies name, description, model, provider, status.
 * Config is NOT copied (production's guardrail text is newer than temp's). Optional: --set-max-iterations=N.
 * Safety: refuses unless live production and temp hashes equal the --expect values (so exactly what was tested ships),
 * writes a full production snapshot first, sends ONE PATCH, reads back and proves each field, and proves temp unchanged.
 * Production writes only with --execute. Needs Arijit's explicit go for that moment (mandate: production change).
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {loadSettings} from './settings.mjs';
const S=loadSettings();
const TEMP=S.devAgentId, PROD=S.productionAgentId, appId=S.appId, readKey=S.searchKey, editKey=S.editKey, root=S.root;
const arg=n=>{const a=process.argv.find(x=>x.startsWith('--'+n+'='));return a?a.split('=').slice(1).join('='):null;};
const execute=process.argv.includes('--execute'), rollbackFile=arg('rollback'), expProd=arg('expect-prod'), expTemp=arg('expect-temp'), setIter=arg('set-max-iterations');
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const s8=v=>sha(v).slice(0,8);
const url=id=>`https://${appId}.algolia.net/agent-studio/1/agents/${id}`;
const get=async id=>{const r=await fetch(url(id),{headers:{'x-algolia-application-id':appId,'x-algolia-api-key':readKey},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`GET ${id} ${r.status}`);return r.json();};
const omit=(o,k)=>Object.fromEntries(Object.entries(o).filter(([key])=>key!==k));
const stripNulls=v=>Array.isArray(v)?v.map(stripNulls):(v&&typeof v==='object')?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==null).map(([k,x])=>[k,stripNulls(x)])):v;
// What the platform keeps: indices without the auto-generated enhancedDescription, no tool-level description on the search tool.
const normTools=tools=>stripNulls((tools??[]).map(t=>({...t,description:t.type==='algolia_search_index'?undefined:t.description,indices:(t.indices??[]).map(r=>omit(r,'enhancedDescription'))})));
const hash3=a=>[s8(a.instructions),s8(a.systemPrompt),s8(normTools(a.tools))].join(':');
const patchBody=src=>({instructions:src.instructions,systemPrompt:src.systemPrompt,tools:normTools(src.tools).map(t=>t.type==='algolia_search_index'?omit(t,'description'):t)});

const prod=await get(PROD), temp=await get(TEMP);
if(prod.id!==PROD||TEMP===PROD)throw new Error('Refusing: production target is not the live agent');
if(temp.id!==TEMP)throw new Error('Refusing: source is not the dev agent');
if(prod.model!==temp.model||prod.providerId!==temp.providerId)throw new Error('Refusing: model or provider differs; switching needs Arijit explicitly');
console.log(JSON.stringify({phase:rollbackFile?'rollback-preflight':'preflight',execute,production:{hash3:hash3(prod),instr:prod.instructions.length,sys:prod.systemPrompt.length,tools:prod.tools.map(t=>t.name)},temp:{hash3:hash3(temp),instr:temp.instructions.length,sys:temp.systemPrompt.length,tools:temp.tools.map(t=>t.name)},modelSame:true},null,1));

if(rollbackFile){
  const snap=JSON.parse(readFileSync(resolve(rollbackFile),'utf8'));
  if(snap.agentId!==PROD)throw new Error('Snapshot is not for the production agent');
  const body=patchBody(snap.agent);
  console.log('would restore production from',rollbackFile,'-> hash3',hash3(snap.agent));
  if(!execute)process.exit(0);
  if(!editKey)throw new Error('Missing edit credential');
  const r=await fetch(url(PROD),{method:'PATCH',headers:{'x-algolia-application-id':appId,'x-algolia-api-key':editKey,accept:'application/json','content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error(`rollback PATCH failed ${r.status}: ${(await r.text()).slice(0,500)}`);
  let after;for(let i=0;i<8;i++){after=await get(PROD);if(hash3(after)===hash3(snap.agent))break;await new Promise(w=>setTimeout(w,700));}
  console.log(JSON.stringify({rolledBack:hash3(after)===hash3(snap.agent),hash3Now:hash3(after),status:after.status}));
  if(hash3(after)!==hash3(snap.agent))throw new Error('Rollback proof FAILED');
  process.exit(0);
}

const lines=(a)=>a.split('\n').length;
console.log(`\nWHAT WOULD CHANGE ON PRODUCTION\n  instructions: ${prod.instructions.length} -> ${temp.instructions.length} chars (${lines(prod.instructions)} -> ${lines(temp.instructions)} lines)\n  systemPrompt: ${prod.systemPrompt.length} -> ${temp.systemPrompt.length} chars\n  tools: [${prod.tools.map(t=>t.name)}] -> [${temp.tools.map(t=>t.name)}]\n  config: NOT copied. Differences left alone: ${Object.keys(temp.config).filter(k=>JSON.stringify(temp.config[k])!==JSON.stringify(prod.config[k])).join(', ')||'none'}${setIter?`\n  config.max_iterations: ${prod.config.max_iterations} -> ${setIter} (explicit flag)`:''}`);
if(!execute){console.log('\nPREFLIGHT ONLY. Nothing written.');process.exit(0);}
if(expProd!==hash3(prod))throw new Error(`Refusing: live production ${hash3(prod)} != --expect-prod ${expProd}. Someone changed production; re-read, re-decide.`);
if(expTemp!==hash3(temp))throw new Error(`Refusing: live temp ${hash3(temp)} != --expect-temp ${expTemp}. The tested agent changed since the test.`);
if(!editKey)throw new Error('Missing edit credential');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const outDir=resolve(root,'app/evidence/baseline');mkdirSync(outDir,{recursive:true});
const snapPath=resolve(outDir,`${stamp}-PRODUCTION-rollback.snapshot.json`);
writeFileSync(snapPath,JSON.stringify({kind:'production-agent-snapshot',takenAt:new Date().toISOString(),agentId:PROD,hash3:hash3(prod),agent:prod},null,1)+'\n');
console.log('production snapshot written:',snapPath);
const body=patchBody(temp); if(setIter!==null)body.config={...prod.config,max_iterations:Number(setIter)};
const r=await fetch(url(PROD),{method:'PATCH',headers:{'x-algolia-application-id':appId,'x-algolia-api-key':editKey,accept:'application/json','content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});
if(!r.ok)throw new Error(`PATCH failed ${r.status}: ${(await r.text()).slice(0,600)} (snapshot ${snapPath})`);
let after;for(let i=0;i<8;i++){after=await get(PROD);if(hash3(after)===hash3(temp))break;await new Promise(w=>setTimeout(w,700));}
const tempAfter=await get(TEMP);
const receipt={at:new Date().toISOString(),prodNowEqualsTemp:hash3(after)===hash3(temp),hash3Now:hash3(after),instructionsExact:after.instructions===temp.instructions,systemPromptExact:after.systemPrompt===temp.systemPrompt,toolsMatch:s8(normTools(after.tools))===s8(normTools(temp.tools)),configUntouched:setIter!==null?'only max_iterations by flag':sha(after.config)===sha(prod.config),nameUnchanged:after.name===prod.name,modelUnchanged:after.model===prod.model,guardrailUnchanged:sha(after.config.guardrail)===sha(prod.config.guardrail),tempUnchanged:hash3(tempAfter)===hash3(temp),status:after.status,snapshot:snapPath};
writeFileSync(resolve(outDir,`${stamp}-PRODUCTION-promote-receipt.json`),JSON.stringify(receipt,null,1)+'\n');
console.log(JSON.stringify(receipt,null,1));
if(!receipt.prodNowEqualsTemp||!receipt.instructionsExact||!receipt.systemPromptExact||!receipt.toolsMatch||!receipt.nameUnchanged||!receipt.modelUnchanged||!receipt.guardrailUnchanged||!receipt.tempUnchanged||after.status!=='published')throw new Error('Promotion proof FAILED: restore with --rollback='+snapPath);
