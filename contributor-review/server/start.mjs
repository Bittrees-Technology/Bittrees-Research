import {createServer} from 'node:http';
import {createServer as createViteServer} from 'vite';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {PERSONAS,view,transition,seed,submitInterest} from './service.mjs';
import {SITES} from './interest.mjs';
import {createStore} from './store.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const port=Number(process.env.REVIEW_PORT||4348),origin=`http://127.0.0.1:${port}`;
const sessions=new Map(),store=createStore(process.env.REVIEW_STATE_FILE||resolve(root,'.state/review-v2.json'));
const vite=await createViteServer({root,configFile:resolve(root,'vite.config.mjs'),server:{middlewareMode:true,hmr:{host:"127.0.0.1",port:port+10000}},appType:'spa'});
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const server=createServer(async(req,res)=>{
 if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);return res.end('Loopback review only');}
 const url=new URL(req.url,origin),path=url.pathname,site=url.searchParams.get('site')||process.env.REVIEW_SITE||'gov';
 if(path==='/'){res.writeHead(302,{Location:`/${process.env.REVIEW_SITE||'gov'}/admin/contributors`});return res.end();}
 if(!path.startsWith('/api/'))return vite.middlewares(req,res);
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  const sid=(req.headers.cookie||'').match(/(?:^|; )review_session=([a-f0-9]+)/)?.[1];let session=sessions.get(sid);
  if(req.method==='GET'&&path==='/api/session'){
   if(!session){const id=randomBytes(24).toString('hex');session={persona:'operations',csrf:randomBytes(24).toString('hex')};sessions.set(id,session);res.setHeader('Set-Cookie',`review_session=${id}; HttpOnly; SameSite=Strict; Path=/`);}
   return res.end(JSON.stringify({csrf:session.csrf,persona:session.persona,personas:Object.fromEntries(Object.entries(PERSONAS).map(([k,v])=>[k,v.name])),mode:'local-fixture'}));
  }
  if(!session)throw Object.assign(Error('Review session required.'),{status:401});
  let body={};
  if(req.method!=='GET'){
   if(req.headers.origin!==origin||!equal(req.headers['x-review-csrf'],session.csrf))throw Object.assign(Error('Invalid review request origin or token.'),{status:403});
   if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('JSON required.'),{status:415});
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16384)throw Object.assign(Error('Request too large.'),{status:413});}body=JSON.parse(raw||'{}');
  }
  if(req.method==='POST'&&path==='/api/fixture/persona'){
   if(!Object.hasOwn(PERSONAS,body.persona))throw Error('Unknown fixture persona.');session.persona=body.persona;return res.end(JSON.stringify({ok:true}));
  }
  if(req.method==='POST'&&path==='/api/fixture/reset'){if(session.persona!=='operations')throw Object.assign(Error('Only the fixture operator may reset.'),{status:403});await store.mutate(()=>seed());return res.end(JSON.stringify({ok:true}));}
  const actor=PERSONAS[session.persona];
  if(!SITES[site])throw Error('Unknown project.');
  if(req.method==='POST'&&path==='/api/role-applications'){const next=await store.mutate(s=>submitInterest(s,actor,site,body));return res.end(JSON.stringify(view(next,actor,site)));}
  if(req.method==='GET'&&path==='/api/admin/role-applications')return res.end(JSON.stringify(view(await store.read(),actor,site)));
  const match=path.match(/^\/api\/admin\/role-applications\/([a-z0-9-]+)\/review$/);
  if(req.method==='PATCH'&&match){const next=await store.mutate(s=>{if(!s.applications.some(a=>a.id===match[1]&&a.lane===SITES[site].lane))throw Error('Application does not belong to this project.');return transition(s,actor,match[1],body);});return res.end(JSON.stringify(view(next,actor,site)));}
  res.statusCode=404;res.end(JSON.stringify({error:'Review route not found.'}));
 }catch(e){res.statusCode=e.status||400;res.end(JSON.stringify({error:e.message}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`Contributor review: ${origin} (sample records only)`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close();vite.close().then(()=>process.exit());});
