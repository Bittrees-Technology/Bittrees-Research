import {syncConnectionMessage} from '../../shared/usersync-message.mjs';
/** Tab-memory encryption proof. The separate server credential is HttpOnly. */
export function createSyncVault({message,validate,endpoint='/api/usersync',fetcher=(...a)=>fetch(...a),origin=()=>location.origin,storage=()=>localStorage,now=Date.now}={}){
 const entries=new Map(),listeners=new Set(),timers=new Map();
 const key=a=>'bittrees.sync.sig.'+a.toLowerCase();
 const emit=()=>{for(const f of listeners)f();};
 const legacy=a=>{try{return storage().getItem(key(a));}catch{return null;}};
 function lock(addr){const a=addr.toLowerCase();entries.delete(a);clearTimeout(timers.get(a));timers.delete(a);emit();}
 async function request(path,body){const response=await fetcher(path,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(7000),...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!response.ok)throw Error(response.status===401?'Reconnect Messenger sync. Your encrypted data is unchanged.':'Messenger sync is unavailable. Your encrypted data is unchanged.');return response.json();}
 const api={
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  signature(addr){if(!addr)return null;const a=addr.toLowerCase(),entry=entries.get(a);if(!entry||entry.expires<=now())return null;return entry.signature;},
  hasLegacy(addr){return !!addr&&!!legacy(addr);},
  lock,
  async disconnect(addr){lock(addr);try{await request(endpoint,{action:'logout'});}catch{/* Memory is cleared even while offline; server session retains its bounded expiry. */}},
  async connect(address,signMessage){
   const addr=address.toLowerCase();if(!/^0x[0-9a-f]{40}$/.test(addr))throw Error('Connect the original wallet.');
   const signature=await signMessage(message);if(!/^0x[0-9a-f]{128,130}$/i.test(signature))throw Error('Invalid wallet proof.');
   const previous=legacy(addr);
   // Never replace a key that the current wallet cannot reproduce.
   if(previous&&previous.toLowerCase()!==signature.toLowerCase())throw Error('This wallet returned a different encryption key. The existing credential and encrypted messages were preserved. Reconnect the original wallet.');
   const remote=await request(endpoint+'?address='+encodeURIComponent(addr));
   if(remote.blob!==null&&typeof remote.blob!=='string')throw Error('Sync data could not be verified. Nothing was changed.');
   const decoded=remote.blob?validate(signature,remote.blob):null;
   const challenge=await request(endpoint,{action:'challenge',address:addr});
   if(!/^[\w-]{43}$/.test(challenge.nonce||'')||!Number.isSafeInteger(challenge.issuedAt)||!Number.isSafeInteger(challenge.expiresAt)||challenge.issuedAt>now()+30000||challenge.issuedAt<now()-300000||challenge.expiresAt<=now()||challenge.expiresAt-challenge.issuedAt!==300000||challenge.message!==syncConnectionMessage(origin(),addr,challenge.nonce,challenge.issuedAt,challenge.expiresAt))throw Error('Unexpected Messenger connection request. Nothing was changed.');
   const signed=await signMessage(challenge.message);
   const connected=await request(endpoint,{action:'connect',address:addr,nonce:challenge.nonce,signature:signed});
   if(connected.connected!==true||!Number.isSafeInteger(connected.expiresAt)||connected.expiresAt<=now()||connected.expiresAt>now()+3630000)throw Error('Sync connection could not be verified.');
   clearTimeout(timers.get(addr));entries.set(addr,{signature,expires:Math.min(connected.expiresAt,now()+3600000)});
   const timer=setTimeout(()=>lock(addr),Math.min(connected.expiresAt-now(),3600000));timer.unref?.();timers.set(addr,timer);
   // Only after fresh wallet proof, successful decryption and bounded server auth.
   let legacyCleared=true;if(previous){try{storage().removeItem(key(addr));legacyCleared=!legacy(addr);}catch{legacyCleared=false;}}
   emit();return {remote:decoded,legacyCleared};
  },
  async read(addr){const signature=api.signature(addr);if(!signature)return null;const remote=await request(endpoint+'?address='+encodeURIComponent(addr));if(remote.blob!==null&&typeof remote.blob!=='string')throw Error('Invalid sync data');return remote.blob?validate(signature,remote.blob):null;},
  async write(addr,blob){if(!api.signature(addr))return false;try{await request(endpoint,{address:addr,blob});return true;}catch(e){lock(addr);throw e;}}
 };
 return api;
}
