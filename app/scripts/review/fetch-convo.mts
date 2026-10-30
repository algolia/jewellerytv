import {loadCredentials} from '../conversation-reader/agentStudio.ts';
const c = await loadCredentials();
const base = 'https://'+c.appId+'.algolia.net/agent-studio/1/';
const h = {'x-algolia-application-id': c.appId, 'x-algolia-api-key': c.searchKey};
const r = await fetch(base+'conversations?limit=2', {headers:h});
const j = await r.json();
console.log(JSON.stringify(j, null, 1).slice(0, 900));
