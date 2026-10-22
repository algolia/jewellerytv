/* verify-baseline.mjs: is everything still the baseline? Read-only.
 *   node scripts/baseline/verify-baseline.mjs                 compare live dev + production agents and the live site with baseline.json
 *   node scripts/baseline/verify-baseline.mjs --write-manifest   after a deliberate, tested, promoted change: record the live production agent as the new baseline
 * Exit code 0 only when nothing differs. Needs ALGOLIA_APP_ID, ALGOLIA_SEARCH_API_KEY in the gitignored .env.local; no agent is written. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url));
const root=execSync('git rev-parse --show-toplevel',{cwd:here,encoding:'utf8'}).trim();
const primary=execSync('git worktree list --porcelain',{cwd:root,encoding:'utf8'}).split('\n').find(l=>l.startsWith('worktree '))?.slice(9)??root;
const readEnv=p=>{const v={};if(!existsSync(p))return v;for(const l of readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(m)v[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2');}return v;};
const env={...readEnv(resolve(primary,'.env.local')),...readEnv(resolve(root,'.env.local')),...process.env};
const {dev:DEV,production:PROD}=JSON.parse(readFileSync(resolve(here,'agents.json'),'utf8'));
const manifestPath=resolve(here,'baseline.json'); const write=process.argv.includes('--write-manifest');
const site=(process.argv.find(a=>a.startsWith('--site='))||'--site=https://jewellerytv.vercel.app').slice(7);
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex').slice(0,8);
const canon=v=>Array.isArray(v)?v.map(canon):(v&&typeof v==='object')?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
const omit=(o,k)=>Object.fromEntries(Object.entries(o).filter(([key])=>key!==k));
const sc=v=>Array.isArray(v)?v.map(sc):(v&&typeof v==='object')?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==null).map(([k,x])=>[k,sc(x)])):v;
const normTools=t=>sc((t??[]).map(x=>({...x,description:x.type==='algolia_search_index'?undefined:x.description,indices:(x.indices??[]).map(r=>omit(r,'enhancedDescription'))})));
const get=async id=>{const r=await fetch(`https://${env.ALGOLIA_APP_ID}.algolia.net/agent-studio/1/agents/${id}`,{headers:{'x-algolia-application-id':env.ALGOLIA_APP_ID,'x-algolia-api-key':env.ALGOLIA_SEARCH_API_KEY}});if(!r.ok)throw new Error(`agent ${id} HTTP ${r.status}`);return r.json();};
const fingerprint=a=>({instructions:sha(a.instructions),systemPrompt:sha(a.systemPrompt),tools:sha(normTools(a.tools)),config:sha(canon(a.config)),toolNames:a.tools.map(t=>t.name),model:a.model});
const [dev,prod]=await Promise.all([get(DEV),get(PROD)]); const fd=fingerprint(dev), fp=fingerprint(prod);
if(write){ if(JSON.stringify(fd)!==JSON.stringify(fp)){console.error('REFUSING: dev and production differ; promote first, then record the baseline.');process.exit(2);}
  writeFileSync(manifestPath,JSON.stringify({recordedAt:new Date().toISOString(),agents:{dev:DEV,production:PROD},fingerprint:fp},null,2)+'\n');console.log('baseline.json written from the live production agent:',JSON.stringify(fp));process.exit(0);}
const base=JSON.parse(readFileSync(manifestPath,'utf8')); let fails=0;
const chk=(name,ok,detail='')=>{if(!ok)fails++;console.log((ok?'PASS ':'FAIL ')+name+(detail?' | '+detail:''));};
for(const k of ['instructions','systemPrompt','tools','config'])chk(`${k}: dev == production == baseline`,fd[k]===fp[k]&&fp[k]===base.fingerprint[k],`dev ${fd[k]} | prod ${fp[k]} | baseline ${base.fingerprint[k]}`);
chk('tool names',fp.toolNames.join()===base.fingerprint.toolNames.join(),fp.toolNames.join(', ')); chk('model equal',fd.model===fp.model&&fp.model===base.fingerprint.model,fp.model);
chk('both agents published',dev.status==='published'&&prod.status==='published');
const hz=await (await fetch(site+'/api/health')).json(); chk(`${site} health is production`,hz.ok===true&&hz.environment==='production',JSON.stringify(hz));
if(hz.toolSheet)chk('app answers every tool the agent declares (tool-sheet guard)',hz.toolSheet.status==='match',hz.toolSheet.status); else console.log('INFO  live app does not report toolSheet yet (release the guard to see it)');
console.log(fails?`\n${fails} DIFFERENCE(S) FROM THE BASELINE`:'\nEverything matches the baseline.'); process.exit(fails?1:0);
