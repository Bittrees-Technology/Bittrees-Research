import {authorityDecision} from '../server/authority-client.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const actor=new URL(req.url,'https://local.invalid').searchParams.get('address')?.toLowerCase();
 if(!/^0x[a-f0-9]{40}$/.test(actor||''))return res.status(400).json({error:'Wallet required'});
 if(!['root-policy','root-policy-auto'].includes(process.env.REGISTRY_AUTHORITY_MODE))return res.status(200).json({configured:false,permissions:[]});
 try{const actions=['community.roles.manage','community.moderation.manage','rooms.manage','rooms.propose'];const decisions=await Promise.all(actions.map(a=>authorityDecision(actor,a)));return res.status(200).json({configured:process.env.REGISTRY_AUTHORITY_MODE==='root-policy'||decisions.some(d=>d.configured),permissions:actions.filter((_,i)=>decisions[i].allowed),checkedAt:new Date().toISOString()});}catch{return res.status(503).json({error:'Controller authority unavailable'});}
}
