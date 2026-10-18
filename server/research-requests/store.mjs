import {compareAndSet} from '../contributors/storage.mjs';
import {emptyState} from './core.mjs';
const key='bittrees:research:requests:v1';
export function requestStore(command,codec){
 const decode=raw=>{const state=raw?codec.open(raw):emptyState();if(!Number.isInteger(state.revision)||!Array.isArray(state.requests))throw Error('Invalid research board');return state;};
 return {async read(){return decode((await command(['GET',key])).result);},async mutate(change){const raw=(await command(['GET',key])).result;const next=await change(decode(raw)),encoded=codec.seal(next);if(Buffer.byteLength(encoded)>4000000)throw Object.assign(Error('Research storage capacity reached.'),{status:503});if(Number((await command(['EVAL',compareAndSet,1,key,raw||'',encoded])).result)!==1)throw Object.assign(Error('The board changed. Refresh and try again.'),{status:409});return next;}};
}
