import deployment from './constants/research-deployment.json' with {type:'json'};
/** Fresh server-side mainnet check; mint receipts and legacy holdings never qualify. */
export async function verifyContributorMembership(wallet:string,fetcher:typeof fetch=fetch){
 if(!/^0x[a-fA-F0-9]{40}$/.test(wallet))throw Error('Connect the membership wallet before applying.');
 const response=await fetcher(`/api/gate/token/erc1155/${deployment.addresses.proxy}/1/${wallet}/checkAccess`,{cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(response.status===403)throw Error('An active Research membership is required to apply. Mint or renew your membership first.');
 if(!response.ok)throw Error('Membership verification unavailable. Retry before applying.');
 const result=await response.json();
 if(result.access!==true)throw Error('Membership verification unavailable. Retry before applying.');
}
