import {createHash,randomUUID,sign} from 'node:crypto';
import {createPublicClient,http,keccak256,encodeFunctionData,decodeEventLog,parseAbi} from 'viem';
import {mainnet} from 'viem/chains';
import {canonical} from '../../shared/signed-action.mjs';
import {ROOT_AUTHORITY,credentialAbi,credentialDomain,consentTypes,operationHash,actionTypes} from '../../shared/contributor-chain.mjs';
import {ECOSYSTEM_ENDPOINT,ecosystemSources,ecosystemRequestMessage,ecosystemSubject} from '../../shared/ecosystem-authority.mjs';
const fail=(m,status=409)=>Object.assign(Error(m),{status});
const hash=x=>'0x'+createHash('sha256').update(x).digest('hex');
const json=v=>JSON.parse(JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x));
const levels=['Advisor','Part Time','Half Time','Full Time'],ranks=['Contributor','Senior contributor','Lead contributor'],standings=['active','suspended','ended','revoked'];
export function termsFor(app,memo,project){return {subject:hash(project+':'+app.id),memoHash:'0x'+memo.hash,policyHash:hash(memo.policyVersion),level:levels.indexOf(memo.level),rank:ranks.indexOf(memo.rank),validFrom:Math.floor(Date.parse(memo.start+'T00:00:00Z')/1000),validUntil:memo.end===null?0:Math.floor(Date.parse(memo.end+'T00:00:00Z')/1000)+86400};}
export async function chainContext(env=process.env,client){
 const contract=env.CONTRIBUTOR_CONTRACT_ADDRESS?.toLowerCase();
 if(!/^0x[a-f0-9]{40}$/.test(contract||'')||!/^0x[a-f0-9]{64}$/.test(env.CONTRIBUTOR_CONTRACT_CODE_HASH||''))throw fail('The credential contract is awaiting deployment and verification.',503);
 client ||= createPublicClient({chain:mainnet,transport:http(env.ETHEREUM_RPC_URL,{timeout:10000,retryCount:0})});
 if(await client.getChainId()!==1)throw fail('Ethereum mainnet is required.',503);
 const code=await client.getCode({address:contract});if(!code||keccak256(code)!==env.CONTRIBUTOR_CONTRACT_CODE_HASH)throw fail('Contract verification failed.',503);
 const read=(functionName,args=[],blockNumber)=>client.readContract({address:contract,abi:credentialAbi,functionName,args,...(blockNumber===undefined?{}:{blockNumber})});
 if((await read('rootAuthority')).toLowerCase()!==ROOT_AUTHORITY.toLowerCase())throw fail('Unexpected root authority.',503);
 return {client,contract,read};
}
function currentMemo(app){const memo=app.memos.at(-1);if(app.state!=='approved'||app.walletVerification!=='verified'||memo?.status!=='draft'||memo.wallet!==app.wallet)throw fail('An accepted application, verified wallet and current memorandum are required.');return memo;}
export async function prepareConsent(app,session,project,ctx){
 if(app.identity!==session.identity||session.wallet!==app.wallet)throw fail('Sign in and verify the contributor wallet.',403);
 const memo=currentMemo(app),deadline=Math.floor(Date.now()/1000)+86400;
 return json({domain:credentialDomain(ctx.contract),types:consentTypes,primaryType:'Consent',message:{recipient:app.wallet,...termsFor(app,memo,project),nonce:await ctx.read('nonces',[app.wallet]),deadline}});
}
export async function acceptConsent(app,session,project,ctx,{typedData,signature}){
 if(app.identity!==session.identity||session.wallet!==app.wallet)throw fail('Only this contributor can sign their memorandum.',403);
 const memo=currentMemo(app),nonce=await ctx.read('nonces',[app.wallet]);
 const expected={domain:credentialDomain(ctx.contract),types:consentTypes,primaryType:'Consent',message:{recipient:app.wallet,...termsFor(app,memo,project),nonce:String(nonce),deadline:typedData?.message?.deadline}};
 const deadline=Number(expected.message.deadline),now=Math.floor(Date.now()/1000);
 if(!Number.isSafeInteger(deadline)||deadline<=now||deadline>now+86400||canonical(json(expected))!==canonical(typedData)||!await ctx.client.verifyTypedData({...expected,address:app.wallet,signature}))throw fail('The signed memorandum does not match the current terms.',403);
 memo.consent={typedData,signature};memo.acknowledgedAt=new Date().toISOString();memo.acknowledgedBy=session.identity;
}
export async function requestPermit(ctx,session,project,actionHash,{env=process.env,fetcher=fetch}={}){
 const subject=session.email?ecosystemSubject(project,'email',session.email,env.CONTRIBUTOR_IDENTITY_SECRET):null,issuedAt=Date.now(),requestId=randomUUID();
 const request={version:1,project,source:ecosystemSources[project].host,audience:ECOSYSTEM_ENDPOINT,subjects:[...(subject?[subject]:[]),session.wallet],authenticatedWallet:session.wallet,verifiedEmails:subject?[{subject,email:session.email}]:[],issuedAt,requestId};
 const operation={version:1,project,actor:session.wallet,contract:ctx.contract,actionHash,issuedAt,requestId};
 const signature=message=>sign(null,Buffer.from(message),env.ROLES_ECOSYSTEM_REQUEST_PRIVATE_KEY).toString('base64');
 const r=await fetcher('https://roles.bittrees.org/api/authority/contributor-permit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation,signature:signature('Bittrees contributor operation permit v1\n'+canonical(operation)),authority:{request,signature:signature(ecosystemRequestMessage(request))}}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw fail('Roles could not authorize this transaction. Refresh your Partner access and retry.',503);
 const result=await r.json(),m=result.message,signer=await ctx.read('rolesSigner');
 if(result.contract!==ctx.contract||result.chainId!==1||m?.actor!==session.wallet||m?.actionHash!==actionHash||Number(m.deadline)<=Date.now()/1000||Number(m.deadline)>Date.now()/1000+120||!await ctx.client.verifyTypedData({address:signer,domain:credentialDomain(ctx.contract),types:actionTypes,primaryType:'ContributorAction',message:m,signature:result.signature}))throw fail('Roles transaction authorization rejected.',503);
 return result;
}
export async function prepareExecution(app,actor,session,project,ctx,input,options){
 if(!actor.issue||!actor.decide.includes(app.lane)||!session.wallet)throw fail('A verified Partner wallet is required.',403);
 if(app.chainOperation?.status==='prepared'){
  const old=app.chainOperation;const block=await ctx.client.getBlock({blockTag:'latest'});
  if(old.actor===session.wallet&&input.kind===(old.kind==='bootstrap'?'issue':old.kind)&&(old.kind!=='standing'||(input.standing===old.standing&&input.reason?.trim()===old.reason))&&Number(block.timestamp)<=Number(old.deadline))return {to:old.kind==='bootstrap'?ROOT_AUTHORITY:old.contract,data:old.data,chainId:1,value:'0',operationId:old.id,expiresAt:Number(old.deadline)*1000};
  if(old.kind==='bootstrap'){if(String(await ctx.read('nextId'))!=='1')throw fail('Reconcile the root issuance before preparing another transaction.');}
  const nonce=old.kind==='bootstrap'?null:await ctx.read('actionNonces',[old.actor]);
  if(Number(block.timestamp)<=Number(old.deadline)||(old.kind!=='bootstrap'&&String(nonce)!==old.permitNonce))throw fail('Reconcile the prepared transaction before creating another.');
  app.chainHistory=[...(app.chainHistory||[]),{...old,status:'expired'}];
 }
 let kind=input.kind,args,memo;
 if(['issue','amend','replace'].includes(kind)){
  memo=currentMemo(app);const consent=memo.consent;
  if(!consent||Number(consent.typedData.message.deadline)<=Date.now()/1000||String(await ctx.read('nonces',[app.wallet]))!==String(consent.typedData.message.nonce))throw fail('The contributor must sign the current memorandum again.');
  const t=termsFor(app,memo,project),tail=[t,consent.typedData.message.deadline,consent.signature];
  if(kind==='issue'){if(app.credential)throw fail('A credential already exists.');args=[app.wallet,...tail];}
  else {if(!app.credential)throw fail('No credential exists.');if(kind==='amend'&&app.credential.standing!=='active')throw fail('Only an active credential can be amended.');args=kind==='amend'?[app.credential.tokenId,...tail]:[app.credential.tokenId,app.wallet,...tail];}
 }else if(kind==='standing'){
  if(!app.credential||['ended','revoked'].includes(app.credential.standing)||!standings.includes(input.standing)||input.standing===app.credential.standing||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>2000)throw fail('Choose an available standing and contributor-facing reason.');
  if(input.proposalId){const p=app.proposals.find(p=>p.id===input.proposalId);if(!p||p.state!=='approved'||p.execution!=='awaiting_chain'||p.change.standing!==input.standing||p.baseCredentialRevision!==app.credential.revision)throw fail('This proposal is not approved for the current credential.');}
  args=[app.credential.tokenId,standings.indexOf(input.standing),hash(input.reason.trim())];
 }else throw fail('Unsupported credential operation.');
 if(kind==='issue'&&String(await ctx.read('nextId'))==='1'){
  if(app.wallet!=='0xe5350d96fc3161bf5c385843ec5ee24e8b465b2f'||memo.level!=='Full Time'||memo.rank!=='Lead contributor'||memo.end!==null)throw fail('Credential #1 is reserved for raging.eth: Full Time, Lead contributor, ongoing term.');
  const safeAbi=parseAbi(['function isOwner(address owner) view returns(bool)','function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns(bool)']);
  if(!await ctx.client.readContract({address:ROOT_AUTHORITY,abi:safeAbi,functionName:'isOwner',args:[session.wallet]}))throw fail('An owner of bittrees.eth must sign the first issuance.');
  const inner=encodeFunctionData({abi:credentialAbi,functionName:'bootstrapContributor',args}),zero='0x'+'0'.repeat(40),ownerSignature='0x'+session.wallet.slice(2).padStart(64,'0')+'0'.repeat(64)+'01';
  const data=encodeFunctionData({abi:safeAbi,functionName:'execTransaction',args:[ctx.contract,0n,inner,0,0n,0n,0n,zero,zero,ownerSignature]});
  app.chainOperation=json({id:randomUUID(),kind:'bootstrap',actor:session.wallet,contract:ctx.contract,chainId:1,memoVersion:memo.version,args,data,deadline:args[2],createdAt:new Date().toISOString(),status:'prepared'});
  return {to:ROOT_AUTHORITY,data,chainId:1,value:'0',operationId:app.chainOperation.id,expiresAt:Number(args[2])*1000};
 }
 const actionHash=operationHash(kind,args),permit=await requestPermit(ctx,session,project,actionHash,options);
 const functionName={issue:'issueAuthorized',amend:'amendAuthorized',standing:'standingAuthorized',replace:'replaceAuthorized'}[kind];
 const data=encodeFunctionData({abi:credentialAbi,functionName,args:[...args,permit.message.deadline,permit.signature]});
 const operation=json({id:randomUUID(),kind,proposalId:input.proposalId||null,actor:session.wallet,actionHash,contract:ctx.contract,chainId:1,memoVersion:memo?.version||app.credential.memoVersion,args,data,deadline:permit.message.deadline,permitNonce:permit.message.nonce,standing:input.standing||null,reason:input.reason?.trim()||null,createdAt:new Date().toISOString(),status:'prepared'});
 app.chainOperation=operation;return {to:ctx.contract,data,chainId:1,value:'0',operationId:operation.id,expiresAt:Number(operation.deadline)*1000};
}
export async function reconcile(app,ctx,txHash){
 const op=app.chainOperation;if(!op||op.status!=='prepared'||op.contract!==ctx.contract||!/^0x[a-fA-F0-9]{64}$/.test(txHash||''))throw fail('Choose the prepared transaction.');
 const receipt=await ctx.client.getTransactionReceipt({hash:txHash});if(receipt.status!=='success')throw fail('Transaction reverted. No credential change was recorded.');
 const finalized=await ctx.client.getBlock({blockTag:'finalized'});if(receipt.blockNumber>finalized.number)throw fail('Transaction is awaiting Ethereum finality. Check again shortly.');
 const block=await ctx.client.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash)throw fail('Transaction block changed; retry later.');
 const events=receipt.logs.filter(l=>l.address.toLowerCase()===ctx.contract).flatMap(l=>{try{return [decodeEventLog({abi:credentialAbi,data:l.data,topics:l.topics})];}catch{return []}});
 if(op.kind!=='bootstrap'&&!events.some(e=>e.eventName==='AuthorizedAction'&&e.args.actor.toLowerCase()===op.actor&&e.args.actionHash===op.actionHash))throw fail('This receipt does not match the authorized operation.');
 const memo=app.memos.find(m=>m.version===op.memoVersion);
 if(op.kind==='standing'){
  if(!events.some(e=>e.eventName==='StandingChanged'&&String(e.args.tokenId)===String(app.credential.tokenId)&&Number(e.args.standing)===op.args[1]&&e.args.reasonHash===op.args[2]))throw fail('Standing change was not confirmed.');
  app.credential.standing=op.standing;app.credential.revision++;app.credential.history.push({action:'standing',standing:op.standing,reason:op.reason,transactionHash:txHash,at:new Date().toISOString()});
 }else{
  const event=events.find(e=>e.eventName==='MemorandumAccepted'&&e.args.memoHash==='0x'+memo.hash&&e.args.policyHash===hash(memo.policyVersion));if(!event||(op.kind==='bootstrap'&&String(event.args.tokenId)!=='1'))throw fail('Memorandum issuance was not confirmed.');
  const id=event.args.tokenId,[record,owner]=await Promise.all([ctx.read('records',[id],receipt.blockNumber),ctx.read('ownerOf',[id],receipt.blockNumber)]);
  const expected=op.args[op.kind==='replace'?2:1];
  if(owner.toLowerCase()!==app.wallet||record[0].subject!==expected.subject||record[0].memoHash!==expected.memoHash||record[0].policyHash!==expected.policyHash||Number(record[0].level)!==expected.level||Number(record[0].rank)!==expected.rank||Number(record[0].validFrom)!==expected.validFrom||Number(record[0].validUntil)!==expected.validUntil)throw fail('The credential does not match the signed terms.');
  for(const m of app.memos)if(m.status==='issued')m.status='superseded';memo.status='issued';
  if(app.directory&&!app.directory.startDate)app.directory.startDate=memo.start;
  const previous=app.credential;app.credential={tokenId:String(id),chainId:1,contract:ctx.contract,transactionHash:txHash,blockHash:receipt.blockHash,blockNumber:String(receipt.blockNumber),memoVersion:memo.version,level:memo.level,rank:memo.rank,standing:standings[Number(record[1])],revision:(previous?.revision||0)+1,history:[...(previous?.history||[]),{action:op.kind,at:new Date().toISOString(),transactionHash:txHash}]};
 }
 if(op.proposalId){const p=app.proposals.find(p=>p.id===op.proposalId);if(p)p.execution='finalized';}
 op.status='finalized';op.transactionHash=txHash;op.blockHash=receipt.blockHash;
}

export async function refreshCredential(app,ctx){
 if(!app.credential)return;
 const c=app.credential;if(c.contract!==ctx.contract)throw fail('Credential deployment does not match.',503);
 const block=await ctx.client.getBlock({blockTag:'latest'});
 if(Math.abs(Date.now()/1000-Number(block.timestamp))>90)throw fail('Credential chain data is stale.',503);
 const [record,current]=await Promise.all([ctx.read('records',[c.tokenId],block.number),ctx.read('currentCredential',[termsFor(app,app.memos.find(m=>m.version===c.memoVersion),app.project==='Bittrees Governance'?'gov':'research').subject],block.number)]);
 const memo=app.memos.find(m=>m.version===c.memoVersion);
 if(record[0].memoHash!=='0x'+memo.hash||record[0].policyHash!==hash(memo.policyVersion))throw fail('The on-chain memorandum changed. Reconcile its transaction before continuing.');
 c.standing=String(current)!==String(c.tokenId)?'revoked':standings[Number(record[1])];
 c.chainCheckedAt=new Date().toISOString();c.termActive=Number(record[0].validFrom)<=Number(block.timestamp)&&(Number(record[0].validUntil)===0||Number(block.timestamp)<Number(record[0].validUntil));
}
