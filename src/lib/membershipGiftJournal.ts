import {useSyncExternalStore} from 'react';
import {isAddress} from 'viem';
export type GiftRecord={sender:string;recipient:string;hash:`0x${string}`;status:'pending'|'confirmed'|'unconfirmed';id?:string;expiry?:number};
const key='research.gift-receipt.v1';
// Purchase history only. This record is never used to establish membership access.
function load():GiftRecord|null{
 try{const r=JSON.parse(sessionStorage.getItem(key)||'null');
  return r&&isAddress(r.sender)&&isAddress(r.recipient)&&/^0x[\da-f]{64}$/i.test(r.hash)?{sender:r.sender,recipient:r.recipient,hash:r.hash,status:'pending'}:null;
 }catch{return null;}
}
let record=load();const listeners=new Set<()=>void>();
export function saveGift(value:GiftRecord|null){record=value;try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}catch{/* In-memory tracking remains available. */}listeners.forEach(fn=>fn());}
export function useGiftRecord(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>record);}
