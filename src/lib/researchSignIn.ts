export type ResearchSession = {wallet:string;csrf:string;expiresAt:number};

/** Recheck the shared server session before opening the wallet. A page may have
 * mounted before another page/tab completed sign-in. Never infer proof from a
 * connected wallet, cached UI state, or membership ownership. */
export async function ensureResearchSignIn(wallet:string, sign:(message:string)=>Promise<string>, isCurrent:()=>boolean) {
 const check=()=>{if(!isCurrent())throw Error('Wallet changed. Open the current wallet session again.');};
 check();
 const r=await fetch('/api/contributors',{cache:'no-store'}),data=await r.json();
 check();
 if(!r.ok)throw Error(data.error||'Research session could not be checked. Try again.');
 const session=data.session as ResearchSession|null;
 if(session?.wallet?.toLowerCase()===wallet.toLowerCase()&&session.expiresAt>Date.now())return;
 const post=async(body:unknown)=>{
  check();const r=await fetch('/api/contributors',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),data=await r.json();
  check();if(!r.ok)throw Error(data.error||'Research sign-in failed.');return data;
 };
 const challenge=await post({action:'wallet_login_start',address:wallet});
 const signature=await sign(challenge.message);check();
 await post({action:'wallet_login_finish',challenge:challenge.challenge,signature});
}
