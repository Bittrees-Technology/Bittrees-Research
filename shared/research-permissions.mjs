import {keccak256,toBytes} from 'viem';
export const RESEARCH_PERMISSIONS=['community.roles.manage','community.moderation.manage','rooms.manage','rooms.propose','research.credentials.define','research.credentials.assign'];
const types=Object.fromEntries(['executive','steward','assistant'].map(role=>[role,keccak256(toBytes(`research.role.${role}.v1`))]));
/** Evidence is produced server-side, never accepted from a browser or a role label. */
export function nativeRoles(evidence,wallet,now=Date.now()){
 if(!wallet||evidence?.status!=='current'||evidence.wallet?.toLowerCase()!==wallet.toLowerCase()||evidence.chainId!==1||evidence.registry?.toLowerCase()!=='0x335708826d76302e5014e6ca41564482e38aa8b2'||evidence.membership?.toLowerCase()!=='0xcecd807193cf79b59e9c849b9cccba10dd6f8335'||!Number.isFinite(evidence.validUntil)||evidence.validUntil<=now)return [];
 return Object.entries(types).filter(([,type])=>evidence.credentials?.some(c=>c.type===type&&c.valid===true&&c.burned===false&&c.revoked===false)).map(([role])=>role);
}
/** Roles policy and current native credentials must both permit protected actions. */
export function researchPermissions(decision,now=Date.now(),evidence,wallet){
 if(!decision?.authoritative||!Number.isFinite(decision.expiresAt)||decision.expiresAt<=now)return [];
 const actions=new Set(decision.actions||[]),out=new Set(RESEARCH_PERMISSIONS.filter(a=>actions.has(a)));
 if(actions.has('project.admin')||actions.has('role.executive'))for(const a of RESEARCH_PERMISSIONS)out.add(a);
 if(actions.has('community.roles.manage')){out.add('research.credentials.define');out.add('research.credentials.assign');}
 if(actions.has('role.steward'))out.add('research.credentials.define');
 if(['role.assistant','role.steward','role.executive'].some(a=>actions.has(a)))out.add('community.moderation.manage');
 if(['role.operations','role.researcher','role.steward','tier.partner','tier.junior-partner','tier.associate'].some(a=>actions.has(a)))out.add('rooms.propose');
 const roles=nativeRoles(evidence,wallet,now),executive=roles.includes('executive');
 for(const action of out){
  if(action==='rooms.propose')continue;
  const allowed=executive||(action==='research.credentials.define'&&roles.includes('steward'))||(action==='community.moderation.manage'&&roles.some(r=>['assistant','steward'].includes(r)));
  if(!allowed)out.delete(action);
 }
 return [...out];
}

/** Review is scoped to Research; it does not confer Partner issuance or payment rights. */
export function researchReviewer(decision,evidence,wallet,now=Date.now()){
 return decision?.authoritative===true&&Number.isFinite(decision.expiresAt)&&decision.expiresAt>now&&nativeRoles(evidence,wallet,now).includes('executive')&&(decision.actions||[]).some(a=>['project.admin','role.executive','tier.partner','tier.junior-partner','tier.associate'].includes(a));
}
