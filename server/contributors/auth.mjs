import {randomBytes,randomInt,createHash,createHmac,timingSafeEqual} from 'node:crypto';
const digest=v=>createHash('sha256').update(v).digest('hex');
const fail=(m,status=400)=>Object.assign(Error(m),{status});
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export const consume=`if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end; redis.call('DEL',KEYS[1]); return 1`;
const limited=`local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n`;
export function contributorAuth({command,codec,project,origin,env=process.env,send=fetch,now=()=>Date.now(),verifyWallet}){
 const prefix=`bittrees:contributors:v1:${project}:`,cookieName='__Host-bittrees-contributor';
 const cookie=req=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
 const key=req=>prefix+'session:'+digest(cookie(req));
 async function limit(suffix,max,seconds){const n=Number((await command(['EVAL',limited,1,prefix+suffix,seconds])).result);if(n>max)throw fail('Too many attempts. Please try again later.',429);}
 async function read(req){const token=cookie(req);if(!/^[a-f0-9]{64}$/.test(token))return null;const raw=(await command(['GET',key(req)])).result;if(!raw)return null;const s=codec.open(raw);return s.expiresAt>now()?s:null;}
 return {read,async start(req,email){
  if(typeof email!=='string'||email.length>160||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('Enter a valid email.');email=email.trim().toLowerCase();
  if(!env.RESEND_API_KEY)throw fail('Contributor email sign-in is not configured.',503);
  await limit('email-rate:'+digest(email),4,900);await limit('ip-rate:'+digest(String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0]),15,900);
  const id=randomBytes(32).toString('hex'),code=String(randomInt(100000,1000000));
  const raw=codec.seal({email,codeHash:digest(id+code),expiresAt:now()+600000});await command(['SET',prefix+'login:'+id,raw,'EX',600]);
  const r=await send('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json'},body:JSON.stringify({from:env.CONTRIBUTOR_EMAIL_FROM||'Bittrees Contributors <contributors@bittrees.org>',to:[email],subject:'Your Bittrees contributor sign-in code',text:`Your sign-in code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`}),signal:AbortSignal.timeout(10000)});
  if(!r.ok){await command(['DEL',prefix+'login:'+id]);throw fail('Email could not be sent. Please try again later.',503);}return {challenge:id};
 },async finish(req,res,id,code){
  if(!/^[a-f0-9]{64}$/.test(id||'')||!/^\d{6}$/.test(code||''))throw fail('Check the code.');await limit('attempts:'+id,5,600);
  const challengeKey=prefix+'login:'+id,raw=(await command(['GET',challengeKey])).result;if(!raw)throw fail('This code has expired. Request another.');const challenge=codec.open(raw);
  if(challenge.expiresAt<=now()||!equal(challenge.codeHash,digest(id+code)))throw fail('Incorrect or expired code.');
  if(Number((await command(['EVAL',consume,1,challengeKey,raw])).result)!==1)throw fail('This code has already been used.');
  const token=randomBytes(32).toString('hex'),session={identity:'email:'+createHmac('sha256',env.CONTRIBUTOR_IDENTITY_SECRET).update(challenge.email).digest('hex'),email:challenge.email,wallet:null,csrf:randomBytes(32).toString('hex'),expiresAt:now()+86400000};
  await command(['SET',prefix+'session:'+digest(token),codec.seal(session),'EX',86400]);res.setHeader('Set-Cookie',`${cookieName}=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);return {ok:true};
 },async signOut(req,res){await command(['DEL',key(req)]);res.setHeader('Set-Cookie',`${cookieName}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);return {ok:true};},
 async walletChallenge(req,session,address){
  if(!/^0x[a-fA-F0-9]{40}$/.test(address||''))throw fail('Connect an Ethereum wallet.');
  const message=`Bittrees contributor wallet link\nOrigin: ${origin}\nAccount: ${session.identity}\nWallet: ${address.toLowerCase()}\nNonce: ${randomBytes(32).toString('hex')}\nExpires: ${new Date(now()+300000).toISOString()}\nThis links your wallet to your signed-in contributor account. It does not authorize a transaction.`;
  await command(['SET',key(req)+':wallet',codec.seal({message,address:address.toLowerCase(),expiresAt:now()+300000}),'EX',300]);return {message};
 },async walletVerify(req,session,signature){
  if(typeof signature!=='string'||signature.length>8192)throw fail('Invalid wallet signature.');const challengeKey=key(req)+':wallet',raw=(await command(['GET',challengeKey])).result;if(!raw)throw fail('Wallet request expired.');const c=codec.open(raw);
  if(c.expiresAt<=now()||!await verifyWallet({address:c.address,message:c.message,signature}))throw fail('Wallet ownership could not be verified.',403);
  if(Number((await command(['EVAL',consume,1,challengeKey,raw])).result)!==1)throw fail('Wallet request already used.');
  const updated={...session,wallet:c.address,walletVerifiedAt:now()};await command(['SET',key(req),codec.seal(updated),'EX',Math.max(1,Math.floor((session.expiresAt-now())/1000))]);return {wallet:c.address};
 }};
}
