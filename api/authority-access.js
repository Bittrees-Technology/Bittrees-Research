import {researchAccess} from '../server/authority-client.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const actor=new URL(req.url,'https://local.invalid').searchParams.get('address')?.toLowerCase();
 if(!/^0x[a-f0-9]{40}$/.test(actor||''))return res.status(400).json({error:'Wallet required'});
 try{return res.status(200).json(await researchAccess(actor));}catch{return res.status(503).json({error:'Research authority unavailable'});}
}
