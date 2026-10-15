import {createPublicKey, verify, createHmac} from 'node:crypto';
import {canonical} from './signed-action.mjs';

export const ECOSYSTEM_ENDPOINT='https://roles.bittrees.org/api/authority/ecosystem-decision';
export const MAX_DECISION_AGE=5000;
export const ecosystemSources={
 workflow:{host:'workflow.bittrees.org',roles:[]},
 gov:{host:'gov.bittrees.org',roles:['admin','moderator','operations']},
 research:{host:'research.bittrees.org',roles:['executive','assistant','researcher','steward']},
 capital:{host:'capital.bittrees.org',roles:[]},
 news:{host:'news.bittrees.org',roles:['moderator','editor','admin','super_admin']},
 crm:{host:'crm.bittrees.org',roles:[]},autonote:{host:'autonote.bittrees.org',roles:[]},
 insights:{host:'insights.bittrees.org',roles:['administrator']},
 mercado:{host:'mercado.bittrees.org',roles:['owner','admin','dealer_manager','support','catalog_manager','offer_manager','vendor_manager']},
 mail:{host:'mail.bittrees.org',roles:['super_admin','mail_admin','auditor']},
 tld:{host:'bittrees-tld.vercel.app',roles:[]},mcp:{host:'mcp.bittrees.org',roles:[]},
 ai:{host:'ai.bittrees.org',roles:[]},roles:{host:'roles.bittrees.org',roles:['directory-viewer']},
 bounties:{host:'bounties.bittrees.org',roles:['moderator']},
};
export const scopeFor=project=>'ecosystem.'+project;
export const resourceFor=project=>'project:'+project;
const legacyActions={gov:['community.roles.manage','community.moderation.manage','rooms.manage','rooms.propose'],research:['community.roles.manage','community.moderation.manage','rooms.manage','rooms.propose'],capital:['snapshot.refresh'],roles:['directory.read']};
export const actionsFor=project=>[...(legacyActions[project]||[]),'project.admin','tier.partner','tier.junior-partner','tier.associate',...ecosystemSources[project].roles.map(role=>'role.'+role.replaceAll('_','-'))];
export const ecosystemRequestMessage=r=>'Bittrees ecosystem authority request v1\n'+canonical(r);
export const ecosystemDecisionMessage=d=>'Bittrees ecosystem authority decision v1\n'+canonical(d);
export function verifyEcosystemSignature(message,signature,pem){
 try{const key=createPublicKey(pem);return key.asymmetricKeyType==='ed25519'&&typeof signature==='string'&&signature.length<=128&&verify(null,Buffer.from(message),key,Buffer.from(signature,'base64'));}catch{return false;}
}
// Use the same source-bound opaque identity as the signed assignment feed.
export function ecosystemSubject(project,kind,value,secret){
 if(kind==='wallet'){
  if(!/^0x[a-fA-F0-9]{40}$/.test(value))throw Error('Invalid verified wallet');
  return value.toLowerCase();
 }
 if(!['email','account'].includes(kind)||typeof value!=='string'||!value||value.length>512||!secret||secret.length<32)throw Error('Source identity unavailable');
 return 'subject:'+createHmac('sha256',secret).update(JSON.stringify([ecosystemSources[project].host,kind,value])).digest('hex');
}
export function verifyEcosystemDecision(envelope,request,pem,now=Date.now()){
 const d=envelope?.decision;
 if(!d||d.version!==1||d.issuer!=='https://roles.bittrees.org'||d.audience!==request.source||canonical(d.request)!==canonical(request)||!verifyEcosystemSignature(ecosystemDecisionMessage(d),envelope.signature,pem)||!Number.isSafeInteger(d.checkedAt)||!Number.isSafeInteger(d.expiresAt)||d.checkedAt>now+1000||d.expiresAt<=now||d.expiresAt<=d.checkedAt||d.expiresAt-d.checkedAt>MAX_DECISION_AGE||d.requiresPrivateOwnership!==true||typeof d.authoritative!=='boolean'||typeof d.enrolled!=='boolean'||!Array.isArray(d.actions)||new Set(d.actions).size!==d.actions.length||d.actions.some(a=>!actionsFor(request.project).includes(a))||(!d.authoritative&&d.actions.length))throw Error('Roles ecosystem decision rejected');
 if(d.unavailableTiers!==undefined&&(!Array.isArray(d.unavailableTiers)||new Set(d.unavailableTiers).size!==d.unavailableTiers.length||d.unavailableTiers.some(a=>!['tier.partner','tier.junior-partner','tier.associate'].includes(a)||d.actions.includes(a))))throw Error('Invalid tier availability');
 if(request.reviewerCandidates&&(!Array.isArray(d.reviewers)||new Set(d.reviewers).size!==d.reviewers.length||d.reviewers.some(w=>!request.reviewerCandidates.includes(w))||(!d.authoritative&&d.reviewers.length)))throw Error('Invalid reviewer routing');
 if(!request.reviewerCandidates&&d.reviewers!==undefined)throw Error('Unrequested reviewer routing');
 return d;
}
