import {readFileSync} from 'node:fs';
import {normalize} from 'viem/ens';
import {chainContext} from './chain.mjs';
import {renderContributorCard} from '../../shared/contributor-card.mjs';
const logoBase64=readFileSync(new URL('../../public/bittrees_logo_tree.png',import.meta.url)).toString('base64');
// Public image contains public chain data only, never application or contact data.
export async function credentialCard(ctx,id){
 const block=await ctx.client.getBlock({blockTag:'latest'});
 if(Math.abs(Date.now()/1000-Number(block.timestamp))>90)throw Error('Stale chain data');
 const [owner,record,current]=await Promise.all([ctx.read('ownerOf',[id],block.number),ctx.read('records',[id],block.number)]).then(async([owner,record])=>[owner,record,await ctx.read('currentCredential',[record[0].subject],block.number)]);
 let verifiedDisplayName='';
 try {const name=await ctx.client.getEnsName({address:owner,blockNumber:block.number});if(name&&name.length<=64&&(await ctx.client.getEnsAddress({name:normalize(name),blockNumber:block.number}))?.toLowerCase()===owner.toLowerCase())verifiedDisplayName=name;}catch{/* Wallet remains the identity if ENS is unavailable. */}
 const t=record[0],standing=String(current)===String(id)?Number(record[1]):3;
 const status=standing!==0?standing:Number(block.timestamp)<Number(t.validFrom)?4:Number(t.validUntil)!==0&&Number(block.timestamp)>=Number(t.validUntil)?5:0;
 return renderContributorCard({owner,verifiedDisplayName,level:Number(t.level),rank:Number(t.rank),status,logoBase64});
}
export function createArtworkHandler({env=process.env,context=chainContext}={}){
 return async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).end();
  if(typeof req.query?.contract!=='string'||req.query.contract.toLowerCase()!==env.CONTRIBUTOR_CONTRACT_ADDRESS?.toLowerCase()||!/^\d{1,78}$/.test(req.query?.tokenId||''))return res.status(404).end();
  try{const ctx=await context(env);const svg=await credentialCard(ctx,BigInt(req.query.tokenId));res.setHeader('Content-Type','image/svg+xml; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox");return res.status(200).send(svg);}catch{return res.status(503).end();}
 };
}
