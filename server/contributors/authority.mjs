import {ecosystemAccess,ecosystemSubject} from '../ecosystem-client.mjs';
const lanes=['inc-ops-governance','research'];
export async function contributorActor(session,project,{access=ecosystemAccess,secret=process.env.CONTRIBUTOR_IDENTITY_SECRET}={}){
 const subject=session.email?ecosystemSubject(project,'email',session.email,secret):null;
 const decision=await access(project,[...(subject?[subject]:[]),...(session.wallet?[session.wallet]:[])],{authenticatedWallet:session.wallet||null,verifiedEmails:subject?[{subject,email:session.email}]:[]});
 if(!decision.enrolled||!decision.authoritative)throw Object.assign(Error('Contributor authority is unavailable. No changes were made.'),{status:503});
 const partner=decision.actions.includes('tier.partner'),junior=decision.actions.includes('tier.junior-partner'),associate=decision.actions.includes('tier.associate'),staff=partner||junior||associate;
 return {authorityExpiresAt:decision.expiresAt,id:session.identity,name:partner?'Partner':junior?'Junior Partner':associate?'Associate':'Contributor',wallet:session.wallet||null,applicant:true,review:staff?lanes:[],decide:partner?lanes:[],issue:partner,validate:staff,changeStatus:partner?lanes:[],proposeStatus:!partner&&staff?lanes:[]};
}
