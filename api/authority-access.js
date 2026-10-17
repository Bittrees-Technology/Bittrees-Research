import {researchPermissions} from '../shared/research-permissions.mjs';
import {ecosystemAccess} from '../server/ecosystem-client.mjs';
import {authorityDecision} from '../server/authority-client.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const actor=new URL(req.url,'https://local.invalid').searchParams.get('address')?.toLowerCase();
 if(!/^0x[a-f0-9]{40}$/.test(actor||''))return res.status(400).json({error:'Wallet required'});

 try{const shared=await ecosystemAccess('research',[actor],{authenticatedWallet:actor});if(shared.enrolled){const permissions=researchPermissions(shared);const labels={'tier.partner':'Partner','tier.junior-partner':'Junior Partner','tier.associate':'Associate'};return res.status(200).json({configured:true,permissions:[...new Set(permissions)],roles:shared.actions.filter(a=>a.startsWith('tier.')||a.startsWith('role.')).map(a=>({label:labels[a]||a.slice(5)})),expiresAt:shared.expiresAt});}const actions=['community.roles.manage','community.moderation.manage','rooms.manage','rooms.propose'];const decisions=await Promise.all(actions.map(a=>authorityDecision(actor,a)));return res.status(200).json({configured:process.env.REGISTRY_AUTHORITY_MODE==='root-policy'||decisions.some(d=>d.configured),permissions:actions.filter((_,i)=>decisions[i].allowed),expiresAt:Math.min(...decisions.filter(d=>d.allowed).map(d=>Date.parse(d.expiresAt)||0),Date.now()+30000),checkedAt:new Date().toISOString()});}catch{return res.status(503).json({error:'Controller authority unavailable'});}
}
