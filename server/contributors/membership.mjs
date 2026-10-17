import {createPublicClient,http,isAddress} from 'viem';
import {mainnet} from 'viem/chains';
import {MEMBERSHIP,researchMembershipBalance} from '../research-membership.mjs';
/** Admission only: existing records remain readable, and no role or credential is granted. */
export async function requireApplicantMembership(wallet,{env=process.env,client}={}){
 if(!isAddress(wallet))throw Object.assign(Error('A verified applicant wallet is required.'),{status:403});
 try{
  client ||= createPublicClient({chain:mainnet,transport:http(env.MAINNET_RPC_URL||env.ETHEREUM_RPC_URL||'https://ethereum-rpc.publicnode.com',{timeout:8000,retryCount:0})});
  if(await client.getChainId()!==1)throw Error('Wrong chain');
  const balance=await researchMembershipBalance(client,MEMBERSHIP,wallet);
  if(balance===0n)throw Object.assign(Error('An active Research membership is required to apply. Mint or renew membership before importing this application.'),{status:403});
 }catch(e){if(e.status===403)throw e;throw Object.assign(Error('Membership verification unavailable. No application was saved; retry after verification recovers.'),{status:503});}
}
