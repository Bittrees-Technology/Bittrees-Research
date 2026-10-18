import {readResearchCredentials} from '../research-native-authority.mjs';
import {nativeRoles,researchReviewer} from '../../shared/research-permissions.mjs';
import {ecosystemAccess,ecosystemSubject} from '../ecosystem-client.mjs';
const lanes=['inc-ops-governance','research'];
export async function contributorActor(session,project,{access=ecosystemAccess,secret=process.env.CONTRIBUTOR_IDENTITY_SECRET,native=readResearchCredentials}={}){
 const subject=session.email?ecosystemSubject(project,'email',session.email,secret):null;
 const [decision,evidence]=await Promise.all([
  access(project,[...(subject?[subject]:[]),...(session.wallet?[session.wallet]:[])],{authenticatedWallet:session.wallet||null,verifiedEmails:subject?[{subject,email:session.email}]:[]}),
  project==='research'?native(session.wallet):null,
 ]);
 if(!decision.enrolled||!decision.authoritative)throw Object.assign(Error('Contributor authority is unavailable. No changes were made.'),{status:503});
 let nativeAllowed=true;
 if(project==='research'){
  if(!Number.isFinite(decision.expiresAt)||decision.expiresAt<=Date.now())throw Object.assign(Error('Research authority expired. Retry.'),{status:503});
  nativeAllowed=nativeRoles(evidence,session.wallet).includes('executive');
  if(nativeAllowed)decision.expiresAt=Math.min(decision.expiresAt,evidence.validUntil);
 }
 const partner=nativeAllowed&&decision.actions.includes('tier.partner'),junior=nativeAllowed&&decision.actions.includes('tier.junior-partner'),associate=nativeAllowed&&decision.actions.includes('tier.associate'),staff=partner||junior||associate;
 return {authorityExpiresAt:decision.expiresAt,id:session.identity,name:partner?'Partner':junior?'Junior Partner':associate?'Associate':'Contributor',wallet:session.wallet||null,applicant:true,review:staff?lanes:project==='research'&&researchReviewer(decision,evidence,session.wallet)?['research']:[],decide:partner?lanes:[],issue:partner,validate:staff,changeStatus:partner?lanes:[],proposeStatus:!partner&&staff?lanes:[]};
}
