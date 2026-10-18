import {createHmac} from 'node:crypto';
import {createPublicClient,http} from 'viem';
import {mainnet} from 'viem/chains';
import {contributorStore} from './storage.mjs';
import {contributorAuth} from './auth.mjs';

// Research member features and contributor records share wallet ownership proof.
// Each endpoint still checks its own membership, role and action authorization.
export function contributorWalletAuth({command,codec,project,origin,env,send,verifyWallet}){
 return contributorAuth({command,codec,project,origin,env,send,
  ...(project==='research'?{loginTitle:'Bittrees Research sign-in',loginPurpose:'Verify wallet ownership for Research member features and contributor records. This does not approve a transaction, application, memorandum or administrative action.'}:{}),
  identityForWallet:async wallet=>{
   const state=await contributorStore(command,codec,project).read();
   const identities=[...new Set(state.applications.filter(a=>a.wallet===wallet&&a.walletVerification==='verified').map(a=>a.identity))];
   if(identities.length>1)throw Object.assign(Error('This wallet needs account reconciliation. Contact a Partner.'),{status:409});
   return identities[0]||'wallet:'+createHmac('sha256',env.CONTRIBUTOR_IDENTITY_SECRET).update(wallet).digest('hex');
  },
  verifyWallet:verifyWallet||((args)=>createPublicClient({chain:mainnet,transport:http(env.ETHEREUM_RPC_URL||'https://ethereum-rpc.publicnode.com',{timeout:8000,retryCount:0})}).verifyMessage(args))
 });
}
