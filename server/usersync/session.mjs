import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {recoverMessageAddress} from 'viem';
const hash=v=>createHash('sha256').update(v).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const address=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v)?v.toLowerCase():null;
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const readCookie=(req,name)=>{const rows=String(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));return rows.length===1?rows[0].slice(name.length+1):'';};
const SESSION='__Host-bittrees-usersync',FLOW=SESSION+'-flow';
const cookie=(name,value,ttl)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ttl}`;
import {syncConnectionMessage as message} from '../../shared/usersync-message.mjs';
/** Existing ciphertext keys and cipher stay unchanged. Authentication is a separate, bounded session. */
export function createUserSyncHandler({origin,prefix,fallbackPrefix=null,command,now=Date.now,configured=true}){
 const authPrefix=prefix+'auth:';
 const get=async key=>{const v=await command(['GET',key]);return v?JSON.parse(v):null;};
 const set=(key,value,ttl)=>command(['SET',key,JSON.stringify(value),...(ttl?['EX',ttl]:[])]);
 async function session(req){const raw=readCookie(req,SESSION);if(!/^[\w-]{43}$/.test(raw))return null;const s=await get(authPrefix+'session:'+hash(raw));return s&&s.origin===origin&&s.expires>now()&&s.expires<=now()+3600000&&address(s.address)?s:null;}
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Pragma','no-cache');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status,data)=>res.status(status).json(data);
  try{
   if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return send(405,{error:'Method not allowed'});}
   if(!configured)return send(503,{error:'Sync storage is not configured'});
   const body=req.body||{},action=req.method==='GET'?req.query?.action:body.action;
   if(req.method==='POST'&&(req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'))return send(403,{error:'Request origin rejected'});
   if(req.method==='POST'&&action==='logout'){
    const raw=readCookie(req,SESSION);if(/^[\w-]{43}$/.test(raw))await command(['DEL',authPrefix+'session:'+hash(raw)]);
    res.setHeader('Set-Cookie',[cookie(SESSION,'',0),cookie(FLOW,'',0)]);return send(200,{ok:true});
   }
   const addr=address(req.method==='GET'?req.query?.address:body.address);if(!addr)return send(400,{error:'Invalid wallet address'});
   if(req.method==='GET'){
    if(action==='session'){const s=await session(req);return send(s?.address===addr?200:401,s?.address===addr?{connected:true,expiresAt:s.expires}:{error:'Reconnect Messenger sync'});}
    if(action)return send(400,{error:'Unknown action'});
    let data=await get(prefix+addr);
    if(!data?.blob&&fallbackPrefix){const fallback=await get(fallbackPrefix+addr);if(fallback?.blob)data={...fallback,source:'gov'};}
    return send(200,data||{blob:null,updatedAt:0});
   }
   if(['challenge','connect'].includes(action)){
    const bucket=Math.floor(now()/600000),source=String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim().slice(0,128);
    const limitKey=authPrefix+'limit:'+hash(JSON.stringify([action,source,bucket]));
    await command(['SET',limitKey,'0','NX','EX',600]);
    if(Number(await command(['INCR',limitKey]))>(action==='challenge'?10:20)){res.setHeader('Retry-After','600');return send(429,{error:'Please try again later'});}
   }
   if(action==='challenge'){
    const nonce=token(),browser=token(),issued=now(),expires=issued+300000;
    await set(authPrefix+'challenge:'+hash(nonce),{address:addr,origin,browserHash:hash(browser),issued,expires},300);
    res.setHeader('Set-Cookie',cookie(FLOW,browser,300));return send(200,{nonce,message:message(origin,addr,nonce,issued,expires),issuedAt:issued,expiresAt:expires});
   }
   if(action==='connect'){
    if(!/^[\w-]{43}$/.test(body.nonce||'')||!/^0x[0-9a-f]{128,130}$/i.test(body.signature||''))return send(400,{error:'Invalid connection proof'});
    const browser=readCookie(req,FLOW);if(!browser)return send(401,{error:'Connection proof expired'});
    // Atomic one-use consumption; browser, site, wallet and exact message are bound.
    const encoded=await command(['GETDEL',authPrefix+'challenge:'+hash(body.nonce)]),proof=encoded?JSON.parse(encoded):null;
    if(!proof||proof.origin!==origin||proof.address!==addr||proof.expires<=now()||proof.expires>now()+300000||!equal(proof.browserHash,hash(browser)))return send(401,{error:'Connection proof expired'});
    let signer;try{signer=await recoverMessageAddress({message:message(origin,addr,body.nonce,proof.issued,proof.expires),signature:body.signature});}catch{return send(401,{error:'Invalid wallet signature'});}
    if(address(signer)!==addr)return send(403,{error:'Wallet does not match'});
    const raw=token(),expires=now()+3600000;
    await set(authPrefix+'session:'+hash(raw),{address:addr,origin,expires},3600);
    res.setHeader('Set-Cookie',[cookie(SESSION,raw,3600),cookie(FLOW,'',0)]);return send(200,{connected:true,expiresAt:expires});
   }
   if(action)return send(400,{error:'Unknown action'});
   const s=await session(req);if(!s||s.address!==addr)return send(401,{error:'Reconnect Messenger sync'});
   if(typeof body.blob!=='string'||body.blob.length>400000||!/^([0-9a-f]{48}):([0-9a-f]{32,})$/i.test(body.blob))return send(400,{error:'Invalid encrypted sync data'});
   if(body.signature!==undefined)return send(400,{error:'Encryption signatures are not write credentials'});
   await set(prefix+addr,{blob:body.blob,updatedAt:now()});return send(200,{ok:true});
  }catch{return send(503,{error:'Messenger sync is temporarily unavailable'});}
 };
}
export function kvTransport(env=process.env,fetcher=fetch){
 const url=env.KV_REST_API_URL||env.UPSTASH_REDIS_REST_URL,secret=env.KV_REST_API_TOKEN||env.UPSTASH_REDIS_REST_TOKEN;
 return {configured:!!url&&!!secret,async command(value){const r=await fetcher(url,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.timeout(5000),redirect:'error'});if(!r.ok)throw Error('Sync storage unavailable');const data=await r.json();if(data.error)throw Error('Sync storage unavailable');return data.result;}};
}
