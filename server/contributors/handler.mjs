import {stageIntake,settleIntakes,intakeView,intakeVault} from './intake.mjs';
import {requireApplicantMembership} from './membership.mjs';
import {readBaseApplication} from './base-application.mjs';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {chainContext,prepareConsent,acceptConsent,prepareExecution,reconcile,refreshCredential,expireBootstrap,verifyExpiredMemoConsent} from './chain.mjs';
import {redisCommand} from '../signed-registry.mjs';
import {contributorService} from './core.mjs';
import {privateCodec,contributorStore} from './storage.mjs';
import {contributorActor} from './authority.mjs';
import {contributorWalletAuth} from './wallet-auth.mjs';
export function createContributorHandler(project,{env=process.env,command=redisCommand,actorFor=contributorActor,verifyWallet,send,baseReader=readBaseApplication,membershipCheck=requireApplicantMembership}={}){
 const origin=`https://${project==='gov'?'gov':'research'}.bittrees.org`;
 return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(env.CONTRIBUTORS_ENABLED!=='1'||!env.CONTRIBUTOR_IDENTITY_SECRET||env.CONTRIBUTOR_IDENTITY_SECRET.length<48)return res.status(503).json({error:'Contributor administration is being configured. Existing applications remain available through the legacy form.',configured:false});
  const codec=privateCodec(env.CONTRIBUTOR_STORAGE_SECRET),auth=contributorWalletAuth({command,codec,project,origin,env,send,verifyWallet});
  const savedSession=await auth.read(req),session=savedSession?.wallet&&savedSession.walletVerifiedAt?savedSession:null;
  if(req.method==='GET')return res.status(200).json({configured:true,session:session?{email:session.email,wallet:session.wallet,csrf:session.csrf,expiresAt:session.expiresAt}:null});
  if(req.headers.origin!==origin)return res.status(403).json({error:'Use the contributor page to submit this request.'});
  if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'Use JSON'});
  const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});if(Buffer.byteLength(raw)>24000)return res.status(413).json({error:'Request too large'});const body=JSON.parse(raw);
  if(body.action==='wallet_login_start')return res.status(200).json(await auth.walletLoginStart(req,res,body.address));
  if(body.action==='wallet_login_finish')return res.status(200).json(await auth.walletLoginFinish(req,res,body.challenge,body.signature));
  if(['email_start','email_finish'].includes(body.action))return res.status(410).json({error:'Contributor access uses a wallet signature. Email sign-in is no longer available.'});
  if(!session)return res.status(401).json({error:'Sign in to continue.'});
  if(req.headers['x-contributor-csrf']!==session.csrf)return res.status(403).json({error:'Refresh this page before continuing.'});
  if(body.action==='sign_out')return res.status(200).json(await auth.signOut(req,res));
  if(body.action==='wallet_challenge')return res.status(200).json(await auth.walletChallenge(req,session,body.address));
  if(body.action==='wallet_verify')return res.status(200).json(await auth.walletVerify(req,session,body.signature));
  let actor=await actorFor(session,project);const store=contributorStore(command,codec,project),service=contributorService(),vault=intakeVault(command,codec,project);
  const intakeReader=async(...args)=>{const verified=await baseReader(...args);if(project==='research')await membershipCheck(verified.source.attester,{env});return verified;};
  if(body.action==='list'){
   let state=await store.read();
   if(state.pendingIntakes?.some(p=>p.project===project&&((p.identity===actor.id)||actor.review.includes(project==='gov'?'inc-ops-governance':'research'))&&(p.expiresAt<=Date.now()&&p.status==='waiting_finality'||p.status==='waiting_finality'&&p.nextCheckAt<=Date.now()))){
    const before=state.pendingIntakes;
    state=await store.mutate(s=>settleIntakes(s,actor,project,{read:intakeReader,service,vault}));
    await Promise.all(before.filter(p=>!state.pendingIntakes.some(q=>q.uid===p.uid)||state.pendingIntakes.find(q=>q.uid===p.uid)?.status==='unlock_needed').map(p=>vault.remove(p.uid).catch(()=>{})));
    if(actor.authorityExpiresAt<=Date.now())actor=await actorFor(session,project);
   }
   const visible=state.applications.filter(a=>a.identity===actor.id||actor.review.includes(a.lane));
   if(visible.some(a=>a.credential)){const ctx=await chainContext(env);await Promise.all(visible.filter(a=>a.credential).map(a=>refreshCredential(a,ctx)));}
   if(actor.authorityExpiresAt<=Date.now())actor=await actorFor(session,project);
   return res.status(200).json({...service.view(state,actor,project),intakes:intakeView(state,actor,project)});
  }
  if(body.action==='stage_base'){
   const next=await store.mutate(async s=>{if(actor.authorityExpiresAt<=Date.now())throw Object.assign(Error('Authority expired. Retry.'),{status:503});return stageIntake(s,session,project,body,{read:intakeReader,vault});});
   if(actor.authorityExpiresAt<=Date.now())actor=await actorFor(session,project);
   return res.status(200).json({...service.view(next,actor,project),intakes:intakeView(next,actor,project)});
  }
  if(['chain_consent_prepare','chain_consent_save','chain_execute_prepare','chain_reconcile','chain_expire_bootstrap'].includes(body.action)){
   const ctx=await chainContext(env);let result;
   const next=await store.mutate(async state=>{
    const app=state.applications.find(a=>a.id===body.id&&a.project===(project==='gov'?'Bittrees Governance':'Bittrees Research'));
    if(!app||app.identity!==actor.id&&!actor.review.includes(app.lane))throw Object.assign(Error('Application access denied.'),{status:403});
    if(app.version!==body.expectedVersion)throw Object.assign(Error('This record changed. Reload it.'),{status:409});
    if(actor.authorityExpiresAt<=Date.now())throw Object.assign(Error('Authority expired. Retry.'),{status:503});
    if(body.action==='chain_consent_prepare'){result=await prepareConsent(app,session,project,ctx);return state;}
    if(body.action==='chain_consent_save')await acceptConsent(app,session,project,ctx,body);
    if(body.action==='chain_execute_prepare')result=await prepareExecution(app,actor,session,project,ctx,body,{env});
    if(body.action==='chain_expire_bootstrap')await expireBootstrap(app,actor,ctx);
    if(body.action==='chain_reconcile')await reconcile(app,ctx,body.transactionHash);
    app.version++;state.revision++;
    const entry={id:randomUUID(),sequence:state.audit.length+1,at:new Date().toISOString(),actor:actor.id,applicationId:app.id,action:body.action,detail:{memoVersion:app.memos.at(-1)?.version,operationId:app.chainOperation?.id||null,transactionHash:body.transactionHash||null},policy:'contributor-policy-v1',previousHash:state.audit.at(-1)?.hash||null};
    entry.hash=createHash('sha256').update(JSON.stringify(entry)).digest('hex');state.audit.push(entry);return state;
   });
   return res.status(200).json({result,...service.view(next,actor,project)});
  }
  if(body.action==='import_base_review'){
   const lane=project==='gov'?'inc-ops-governance':'research';
   if(!actor.review.includes(lane)||!session.wallet) return res.status(403).json({error:'A verified contributor reviewer wallet is required.'});
   const verified=await baseReader(project,session,body,undefined,{reviewer:true});
   const wallet=verified.source.attester.toLowerCase();
   if(project==='research')await membershipCheck(wallet,{env});
   const next=await store.mutate(async s=>{
    if(actor.authorityExpiresAt<=Date.now())throw Object.assign(Error('Authority expired. Retry.'),{status:503});
    const linked=s.applications.find(a=>a.wallet===wallet&&a.walletVerification==='verified');
    const owner={id:linked?.identity||'wallet:'+createHmac('sha256',env.CONTRIBUTOR_IDENTITY_SECRET).update(wallet).digest('hex'),applicant:true,wallet};
    const next=service.importBaseForReview(s,actor,owner,project,verified);next.pendingIntakes=(next.pendingIntakes||[]).filter(p=>p.uid!==verified.source.uid);return next;
   });
   await vault.remove(verified.source.uid).catch(()=>{});
   return res.status(200).json(service.view(next,actor,project));
  }
  if(body.action==='import_base'){
   const verified=await baseReader(project,session,body);
   if(project==='research')await membershipCheck(verified.source.attester,{env});
   const next=await store.mutate(async s=>{if(actor.authorityExpiresAt<=Date.now())throw Object.assign(Error('Authority expired. Retry.'),{status:503});const next=service.importBase(s,actor,project,verified);next.pendingIntakes=(next.pendingIntakes||[]).filter(p=>p.uid!==verified.source.uid);return next;});
   await vault.remove(verified.source.uid).catch(()=>{});
   return res.status(200).json(service.view(next,actor,project));
  }
  if(body.action==='apply')return res.status(409).json({error:'Submit the wallet-signed Base application, then unlock it here to continue.'});
  if(body.action==='review'){
   if(body.change?.action==='link_wallet'&&(!session.walletVerifiedAt||Date.now()-session.walletVerifiedAt>300000))return res.status(403).json({error:'Verify the wallet again before linking.'});
   const next=await store.mutate(async s=>{if(actor.authorityExpiresAt<=Date.now())throw Object.assign(Error('Role verification expired. Try again.'),{status:503});if(!s.applications.some(a=>a.id===body.id&&a.project===(project==='gov'?'Bittrees Governance':'Bittrees Research')))throw Object.assign(Error('Application not found.'),{status:404});if(body.change?.action==='validate_month'){const app=s.applications.find(a=>a.id===body.id);if(app?.credential){await refreshCredential(app,await chainContext(env));if(!app.credential.termActive)throw Object.assign(Error('The credential term is not currently active.'),{status:409});}}if(actor.authorityExpiresAt<=Date.now())throw Object.assign(Error('Role verification expired. Try again.'),{status:503});const app=s.applications.find(a=>a.id===body.id),change=body.change;
    const revises=change?.action==='draft_memo'||change?.action==='review_memo_edit'&&change.decision==='approve'||change?.action==='review_proposal'&&change.decision==='approve'&&app.proposals.find(p=>p.id===change.proposalId)?.kind==='terms';
    let expiredConsentVerified=false;
    if(revises&&app.memos.at(-1)?.status==='draft'&&app.memos.at(-1)?.consent){
     if(!actor.issue||!actor.decide.includes(app.lane))throw Object.assign(Error('Partner approval is required.'),{status:403});
     expiredConsentVerified=await verifyExpiredMemoConsent(app,await chainContext(env));
    }
    if(actor.authorityExpiresAt<=Date.now())throw Object.assign(Error('Authority expired. Retry.'),{status:503});
    return service.transition(s,actor,body.id,change,{expiredConsentVerified});});return res.status(200).json(service.view(next,actor,project));
  }
  return res.status(400).json({error:'Unknown contributor action.'});
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Contributor service unavailable. No success has been confirmed; reload records before retrying.'});}
 };
}
