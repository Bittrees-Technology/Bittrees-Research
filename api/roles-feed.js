import { createHash, createPrivateKey, sign } from 'node:crypto';
const SOURCE = 'research.bittrees.org';
const PREFIX = 'bittrees:research:';
export async function readFeed({ fetcher=fetch, env=process.env, now=Date.now() }={}) {
  const url=env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token=env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if(!url || !token || !env.ROLES_FEED_PRIVATE_KEY) throw Error('Role feed not configured');
  const response=await fetcher(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(['MGET',PREFIX+'roles',PREFIX+'roledefs']),signal:AbortSignal.timeout(8000)});
  if(!response.ok) throw Error('Role storage unavailable');
  const value=await response.json();
  if(value.error || !Array.isArray(value.result) || value.result.length!==2) throw Error('Invalid role storage response');
  const roles=value.result[0]===null?{}:JSON.parse(value.result[0]);
  const roledefs=value.result[1]===null?[]:JSON.parse(value.result[1]);
  if(!roles || Array.isArray(roles) || typeof roles!=='object' || Object.keys(roles).length>1000 || !Array.isArray(roledefs)) throw Error('Invalid role records');
  for(const [wallet,entries] of Object.entries(roles)) if(!/^0x[0-9a-f]{40}$/i.test(wallet) || !Array.isArray(entries) || entries.length>100 || entries.some(r=>typeof r.label!=='string' || !r.label.trim() || r.label.length>100)) throw Error('Invalid role assignment');
  const records=Object.fromEntries(Object.entries(roles).sort(([a],[b])=>a.localeCompare(b)).map(([wallet,entries])=>[wallet,entries.map(r=>({label:r.label,color:r.color||''}))]));
  const data={schemaVersion:1,source:SOURCE,audience:'https://roles.bittrees.org',generatedAt:new Date(now).toISOString(),revision:createHash('sha256').update(JSON.stringify({roles:records,roledefs})).digest('hex'),roles:records,roledefs};
  const key=createPrivateKey(env.ROLES_FEED_PRIVATE_KEY);
  if(key.asymmetricKeyType!=='ed25519') throw Error('Invalid feed key');
  return {data,signature:sign(null,Buffer.from(JSON.stringify(data)),key).toString('base64')};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try{return res.status(200).json(await readFeed());}catch{return res.status(503).json({error:'Role source unavailable'});}
}
