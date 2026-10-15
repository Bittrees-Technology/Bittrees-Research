import {createPublicClient,http} from 'viem';
import {mainnet} from 'viem/chains';
import {redisCommand} from '../signed-registry.mjs';
import {contributorService} from './core.mjs';
import {privateCodec,contributorStore} from './storage.mjs';
import {contributorActor} from './authority.mjs';
import {contributorAuth} from './auth.mjs';
export function createContributorHandler(project,{env=process.env,command=redisCommand,actorFor=contributorActor,verifyWallet,send}={}){
 const origin=`https://${project==='gov'?'gov':'research'}.bittrees.org`;
 return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(env.CONTRIBUTORS_ENABLED!=='1'||!env.CONTRIBUTOR_IDENTITY_SECRET||env.CONTRIBUTOR_IDENTITY_SECRET.length<48)return res.status(503).json({error:'Contributor administration is being configured. Existing applications remain available through the legacy form.',configured:false});
  const codec=privateCodec(env.CONTRIBUTOR_STORAGE_SECRET),auth=contributorAuth({command,codec,project,origin,env,send,verifyWallet:verifyWallet||((args)=>createPublicClient({chain:mainnet,transport:http(env.ETHEREUM_RPC_URL)}).verifyMessage(args))});
  const session=await auth.read(req);
  if(req.method==='GET')return res.status(200).json({configured:true,session:session?{email:session.email,wallet:session.wallet,csrf:session.csrf}:null});
  if(req.headers.origin!==origin)return res.status(403).json({error:'Use the contributor page to submit this request.'});
  if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'Use JSON'});
  const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});if(Buffer.byteLength(raw)>24000)return res.status(413).json({error:'Request too large'});const body=JSON.parse(raw);
  if(body.action==='email_start')return res.status(200).json(await auth.start(req,body.email));
  if(body.action==='email_finish')return res.status(200).json(await auth.finish(req,res,body.challenge,body.code));
  if(!session)return res.status(401).json({error:'Sign in to continue.'});
  if(req.headers['x-contributor-csrf']!==session.csrf)return res.status(403).json({error:'Refresh this page before continuing.'});
  if(body.action==='sign_out')return res.status(200).json(await auth.signOut(req,res));
  if(body.action==='wallet_challenge')return res.status(200).json(await auth.walletChallenge(req,session,body.address));
  if(body.action==='wallet_verify')return res.status(200).json(await auth.walletVerify(req,session,body.signature));
  const actor=await actorFor(session,project),store=contributorStore(command,codec,project),service=contributorService();
  if(body.action==='list')return res.status(200).json(service.view(await store.read(),actor,project));
  if(body.action==='apply'){
   if(body.application?.email?.trim().toLowerCase()!==session.email)return res.status(400).json({error:'Use your verified sign-in email.'});
   const next=await store.mutate(s=>{if(actor.authorityExpiresAt<=Date.now())throw Object.assign(Error('Role verification expired. Try again.'),{status:503});return service.submitInterest(s,actor,project,body.application);});return res.status(200).json(service.view(next,actor,project));
  }
  if(body.action==='review'){
   if(body.change?.action==='link_wallet'&&(!session.walletVerifiedAt||Date.now()-session.walletVerifiedAt>300000))return res.status(403).json({error:'Verify the wallet again before linking.'});
   const next=await store.mutate(s=>{if(actor.authorityExpiresAt<=Date.now())throw Object.assign(Error('Role verification expired. Try again.'),{status:503});if(!s.applications.some(a=>a.id===body.id&&a.project===(project==='gov'?'Bittrees Governance':'Bittrees Research')))throw Object.assign(Error('Application not found.'),{status:404});return service.transition(s,actor,body.id,body.change);});return res.status(200).json(service.view(next,actor,project));
  }
  return res.status(400).json({error:'Unknown contributor action.'});
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Contributor service unavailable. No success has been confirmed; reload records before retrying.'});}
 };
}
