import { createApiServer } from './api.js';
import { loadConfig } from './config.js';
const server=createApiServer({...loadConfig(),toolSheetGuard:true});
const port=Number(process.env.JTV_API_PORT??5174);
server.listen(port,'127.0.0.1',()=>console.log(`JTV local API listening on http://127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>server.close(()=>process.exit(0)));
