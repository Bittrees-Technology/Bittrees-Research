import {createPublicClient,http,parseAbi,decodeAbiParameters,keccak256,encodePacked} from 'viem';
import {base} from 'viem/chains';
import {xchacha20poly1305} from '@noble/ciphers/chacha.js';
import {hexToBytes} from '@noble/hashes/utils.js';
const EAS='0x4200000000000000000000000000000000000021';
const ZERO='0x'+'0'.repeat(64);
const schema=keccak256(encodePacked(['string','address','bool'],['string community,string title,string body','0x'+'0'.repeat(40),true]));
const abi=parseAbi(['function getAttestation(bytes32 uid) view returns ((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))']);
const fail=(m,status=409)=>Object.assign(Error(m),{status});
// Only a single application's random content key is supplied. Never accept a wallet
// signature-derived private key; it could expose every application for that wallet.
export async function readBaseApplication(project,session,{uid,contentKey},client,{reviewer=false}={}){
 if(!session.wallet||!session.walletVerifiedAt)throw fail('Sign in with the submitting wallet.',403);
 if(!/^0x[a-fA-F0-9]{64}$/.test(uid||'')||!/^[a-f0-9]{64}$/.test(contentKey||''))throw fail('Select and unlock an existing application.',400);
 client ||= createPublicClient({chain:base,transport:http(process.env.BASE_RPC_URL||undefined,{timeout:10000,retryCount:0})});
 if(await client.getChainId()!==8453)throw fail('Base verification unavailable.',503);
 const block=await client.getBlock({blockTag:'finalized'});
 const a=await client.readContract({address:EAS,abi,functionName:'getAttestation',args:[uid],blockNumber:block.number});
 if(a.uid.toLowerCase()!==uid.toLowerCase()||a.schema!==schema||a.refUID!==ZERO||(!reviewer&&a.attester.toLowerCase()!==session.wallet)||a.revocationTime!==0n||a.expirationTime!==0n&&a.expirationTime<=block.timestamp)throw fail('No valid finalized application from this wallet was found.');
 const [community,,body]=decodeAbiParameters([{type:'string'},{type:'string'},{type:'string'}],a.data);
 if(community!==(project==='gov'?'bittrees-contributors':'bittrees-research-contributors'))throw fail('This application belongs to another project.');
 let application;
 try{
  const envelope=JSON.parse(body);
  if(envelope.v!==1||envelope.alg!=='x25519-xchacha20poly1305')throw Error();
  if(reviewer&&!envelope.recipients?.some(r=>r.addr?.toLowerCase()===session.wallet))throw Error();
  const plaintext=xchacha20poly1305(hexToBytes(contentKey),hexToBytes(envelope.nonce)).decrypt(hexToBytes(envelope.ciphertext));
  application=JSON.parse(new TextDecoder().decode(plaintext));
 }catch{throw fail('The selected application could not be decrypted.',400);}
 // Research's original form called requestedRoles "roles" and had no expertise field.
 if(project==='research'){application.requestedRoles=application.roles;delete application.roles;application.expertise ||= ['Research'];}
 return {application,source:{kind:'base-eas',chainId:8453,contract:EAS,uid:a.uid.toLowerCase(),attester:a.attester.toLowerCase(),submittedAt:Number(a.time),verifiedBlock:String(block.number),dataHash:keccak256(a.data)}};
}
