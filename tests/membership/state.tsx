import {decodeFunctionData,encodeEventTopics,encodeAbiParameters,parseAbi} from 'viem';
import { useEffect, useSyncExternalStore } from 'react';
import {createMembershipMintReceipts} from '../../src/lib/membershipMintReceipt';
const first=`0x${'1'.repeat(40)}`,second=`0x${'2'.repeat(40)}`,hash=`0x${'1'.repeat(64)}`;
let state = {address:first, connected:true, chain:1, verified:false, receipt:'', submitted:false, revision:0, version:0, checking:false,error:false,verifiedAt:0,tokens:[] as {tokenId:string;expiresAt:number;isExpired:boolean;version?:string}[]};
const session=()=>({scope:state.connected?`${state.address}:${state.chain}:test`:null,revision:state.revision});
const receipts=createMembershipMintReceipts(session);
const listeners = new Set<() => void>();
const set = (update: Partial<typeof state>) => { state = {...state, ...update, version: state.version + 1}; receipts.observe(); listeners.forEach(fn => fn()); };
(window as any).__membershipFixture = (change: string) => {
  if (change === 'active-v2') set({tokens:[{tokenId:'7',version:'v2',expiresAt:1793448000,isExpired:false}]});
  if (change === 'safe') set({address:'0x2F8f86e6E1Ff118861BEB7E583DE90f0449A264f',revision:state.revision+1});
  if (change === 'v2') set({tokens:[{tokenId:'7',version:'v2',expiresAt:1,isExpired:true}]});
  if (change === 'receipt' || change === 'late_receipt') set({receipt:'success'});
  if (['reverted','cancelled','repriced'].includes(change)) set({receipt:change});
  if (change === 'empty') set({checking:false,error:false,verified:false,tokens:[]});
  if (change === 'error') set({checking:false,error:true,verified:false,tokens:[]});
  if (change === 'verified') set({verified:true,checking:false,error:false,verifiedAt:Date.now()+1,tokens:[{tokenId:'2',expiresAt:Math.floor(Date.now()/1000)+3600,isExpired:false}]});
  if (['switch','chain','disconnect','reconnect'].includes(change)) set({address:change==='switch'?second:first,connected:change!=='disconnect',chain:change==='chain'?8453:1,verified:false,receipt:'',submitted:false,checking:false,error:false,tokens:[],revision:state.revision+1});
  if (change === 'render') set({});
};
(window as any).__verificationRequests = 0;
function useState() { return useSyncExternalStore(fn => { listeners.add(fn); return () => {listeners.delete(fn)}; }, () => state); }
export function useAccount() { const s=useState(); return {address:s.connected?s.address:undefined,isConnected:s.connected,isConnecting:false}; }
export function useChainId() { return useState().chain; }
export function useSwitchChain() { return {switchChain:()=>{},isPending:false}; }
export function useReadContract({functionName}:any) { return {data:functionName==='bitPricePerDay'?2n*10n**18n:functionName==='mintPrice'?1n:360n*86400n,refetch:async()=>{}}; }
export function useSimulateContract() { return {data:{request:{}},error:null}; }
export function useWriteContract() { const s=useState(); return {writeContractAsync:async(request:any)=>{if(location.search==='?gift'){(window as any).__giftWrite={...request,value:String(request.value)};return hash;}(window as any).__renewWrites.push({functionName:request.functionName,args:request.args.map(String)});return hash;},data:s.submitted?hash:undefined,writeContract:()=>set({submitted:true}),reset:()=>set({submitted:false,receipt:''}),isPending:false}; }
export function useWaitForTransactionReceipt({chainId,onReplaced}:any) {
 if(chainId!==1) throw Error('Membership receipt must use mainnet'); const s=useState();
 const replaced=['cancelled','repriced'].includes(s.receipt);
 const transactionHash=replaced?`0x${'4'.repeat(64)}`:hash;
 useEffect(()=>{if(replaced)onReplaced?.({reason:s.receipt,transactionReceipt:{transactionHash}})},[s.receipt]);
 return {isLoading:s.submitted&&!s.receipt,isSuccess:!!s.receipt,data:s.receipt?{status:s.receipt==='reverted'?'reverted':'success',transactionHash}:undefined};
}
export function ConnectButton() { return <span>Synthetic wallet</span>; }
export function useMembershipStatus() {
 const s=useState(),captured=session();
 const saved=useSyncExternalStore(receipts.subscribe,receipts.getSnapshot);
 const pendingMint=saved?.scope===captured.scope&&saved.revision===captured.revision?saved:null;
 useEffect(()=>{if(s.verified)receipts.verified(captured,s.verifiedAt,s.tokens)},[s,pendingMint]);
 return {hasValidMembership:s.verified,isLoading:s.checking,tokens:s.tokens,error:s.error?new Error('Synthetic unavailable verification'):null,sessionRevision:s.revision,pendingMint,isChecking:s.checking,
  confirmMint:(hash:string)=>receipts.record(captured,hash,s.tokens),
  refetch:()=>{(window as any).__verificationRequests++;set({checking:true,error:false});}};
}

(window as any).__renewWrites=[];
export function usePublicClient(){return {
 readContract:async({functionName}:any)=>location.search==='?gift'?(functionName==='mintPrice'?BigInt((window as any).__giftPrice??1):360n*86400n):0n,
 simulateContract:async(request:any)=>{if((window as any).__giftHold)await new Promise(r=>(window as any).__giftRelease=r);return {request};},
 waitForTransactionReceipt:async({onReplaced}:any)=>{
 if(location.hash.includes('executive')&&(window as any).__credentialWrite){
  const abi=parseAbi(['function issueCredentialAsExecutive(uint256,address,uint256,bytes32,string,uint64) returns(uint256)','event CredentialIssued(uint256 indexed credentialId,address indexed member,uint256 indexed membershipTokenId,bytes32 credentialType,string metadataURI,uint64 validUntil,address administrator)']);
  const [,member,parent,type,uri,expiry]=decodeFunctionData({abi,data:(window as any).__credentialWrite.data}).args!;
  return {status:'success',logs:[{address:'0x335708826d76302E5014E6Ca41564482e38AA8B2',topics:encodeEventTopics({abi,eventName:'CredentialIssued',args:{credentialId:13n,member,membershipTokenId:parent}}),data:encodeAbiParameters([{type:'bytes32'},{type:'string'},{type:'uint64'},{type:'address'}],[type,uri,expiry,state.address as `0x${string}`])}]};
 }
 if(location.search!=='?gift')return {status:'success',logs:[]};
 if((window as any).__giftReceiptHold)await new Promise(r=>{((window as any).__giftReceiptReleases??=[]).push(r);});
 const mode=(window as any).__giftReceipt;
 if(mode==='cancelled')onReplaced?.({reason:'cancelled'});
 return {status:mode==='reverted'?'reverted':'success',transactionHash:hash,logs:mode==='missing'?[]:[{
 address:'0xCecD807193Cf79B59e9C849b9CCCbA10DD6f8335',
 topics:encodeEventTopics({abi:parseAbi(['event MemberJoined(address indexed member,uint256 indexed tokenId,uint256 expiry)']),eventName:'MemberJoined',args:{member:mode==='wrong'?first:((window as any).__giftWrite?.args[0]??JSON.parse(sessionStorage.getItem('research.gift-receipt.v1')!).recipient),tokenId:9n}}),
 data:encodeAbiParameters([{type:'uint256'}],[1800000000n]),
 }]};
 },
};}

export function useSendTransaction(){return {sendTransactionAsync:async(request:any)=>{if(location.hash.includes('executive')){(window as any).__credentialWrite=request;return hash;}if(state.address==='0x2F8f86e6E1Ff118861BEB7E583DE90f0449A264f')return hash;throw Error('Synthetic signer cannot execute a Safe transaction');}};}

export function useWalletClient(){return {data:{signMessage:async()=>"0x"}};}
