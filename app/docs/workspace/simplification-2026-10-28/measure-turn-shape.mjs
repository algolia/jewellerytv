/* Turn shape with and without the display tool: total time, how many steps,
 * how many searches, whether searches repeat, and when the first hits land.
 *
 * Written to judge removing `algolia_grouped_results` from the agent. Caching
 * is off. Run it against both configurations; the numbers that matter are the
 * step count and the error rate, not the total, which is noisy.
 */
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync(new URL('../../../.env', import.meta.url),'utf8').split('\n')
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {VITE_ALGOLIA_APP_ID:a,VITE_ALGOLIA_SEARCH_API_KEY:k,VITE_JTV_AGENT_ID:g}=env;
const QS=['Show me opal jewelry','I need a gift for my mom under $200','What was shown on Jewel School this week?',
 'What did Misty feature this week?','Show me engagement rings','Something bold in sterling silver',
 'Compare tanzanite and amethyst rings','Show me clearance'];
const rows=[];
for(const q of QS){
 const t0=Date.now();
 const res=await fetch(`https://${a}.algolia.net/agent-studio/1/agents/${g}/completions?compatibilityMode=ai-sdk-5&cache=false`,{
  method:'POST',headers:{'content-type':'application/json','x-algolia-application-id':a,'x-algolia-api-key':k},
  body:JSON.stringify({messages:[{id:'u1',role:'user',parts:[{type:'text',text:q}]}]})});
 const rd=res.body.getReader(),dec=new TextDecoder();let buf='';
 let steps=0,searches=0,firstHitsAt,totalHits=0,err,ids=new Set();
 while(true){const{done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});
  let i;while((i=buf.indexOf('\n\n'))!==-1){const c=buf.slice(0,i);buf=buf.slice(i+2);
   const l=c.split('\n').find(x=>x.startsWith('data: '));if(!l)continue;
   let e;try{e=JSON.parse(l.slice(6));}catch{continue;}
   if(e.type==='start-step')steps++;
   if(e.type==='tool-output-available'&&Array.isArray(e.output?.hits)){searches++;totalHits+=e.output.hits.length;
    for(const h of e.output.hits) if(h?.objectID) ids.add(h.objectID);
    firstHitsAt??=Date.now()-t0;}
   if(e.type==='error')err=e.errorText;
  }}
 const total=Date.now()-t0;
 rows.push({q,total,steps,searches,firstHitsAt,totalHits,unique:ids.size,err});
 console.log(`${String(total).padStart(6)}ms  steps=${steps} searches=${searches} hits=${totalHits} unique=${ids.size} first@${firstHitsAt}ms  "${q}"${err?'  ERROR: '+err.slice(0,60):''}`);
}
const med=v=>[...v].sort((x,y)=>x-y)[Math.floor(v.length/2)];
console.log(`\nmedian total ${med(rows.map(r=>r.total))}ms   median first hits ${med(rows.map(r=>r.firstHitsAt))}ms`);
console.log(`turns with >1 search: ${rows.filter(r=>r.searches>1).length}/${rows.length}   duplicate hits across searches: ${rows.filter(r=>r.totalHits>r.unique).length}`);
