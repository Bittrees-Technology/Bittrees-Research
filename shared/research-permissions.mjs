export const RESEARCH_PERMISSIONS=['community.roles.manage','community.moderation.manage','rooms.manage','rooms.propose','research.credentials.define','research.credentials.assign'];
/** Only verified, current Roles decisions can produce application capabilities. */
export function researchPermissions(decision,now=Date.now()){
 if(!decision?.authoritative||!Number.isFinite(decision.expiresAt)||decision.expiresAt<=now)return [];
 const actions=new Set(decision.actions||[]),out=new Set(RESEARCH_PERMISSIONS.filter(a=>actions.has(a)));
 const admin=actions.has('project.admin')||actions.has('role.executive');
 // Preserve separately approved admin grants. Credential mappings use bounded actions instead.
 if(admin)for(const a of RESEARCH_PERMISSIONS)out.add(a);
 if(actions.has('community.roles.manage')){out.add('research.credentials.define');out.add('research.credentials.assign');}
 if(actions.has('role.steward'))out.add('research.credentials.define');
 if(['role.assistant','role.steward','role.executive'].some(a=>actions.has(a)))out.add('community.moderation.manage');
 if(['role.operations','role.researcher','role.steward','tier.partner','tier.junior-partner','tier.associate'].some(a=>actions.has(a)))out.add('rooms.propose');
 return [...out];
}
