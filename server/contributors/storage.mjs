import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {emptyState} from './core.mjs';
export function privateCodec(secret){
 if(!secret||secret.length<48)throw Object.assign(Error('Contributor private storage is not configured.'),{status:503});
 const key=createHash('sha256').update(secret).digest();
 return {seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('bittrees-contributors-v1'));const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')});},open(raw){const v=JSON.parse(raw);if(v.v!==1)throw Error('Unsupported private record');const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(v.iv,'base64'));decipher.setAAD(Buffer.from('bittrees-contributors-v1'));decipher.setAuthTag(Buffer.from(v.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(v.data,'base64')),decipher.final()]).toString());}};
}
export const compareAndSet=`local current=redis.call('GET',KEYS[1]); if (current or '')~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1`;
export function contributorStore(command,codec,project){
 const key=`bittrees:contributors:v1:${project}:state`;
 return {async read(){const raw=(await command(['GET',key])).result;return raw?codec.open(raw):emptyState();},async mutate(change){const raw=(await command(['GET',key])).result;const next=await change(raw?codec.open(raw):emptyState());const encoded=codec.seal(next);if(Buffer.byteLength(encoded)>4000000)throw Object.assign(Error('Contributor storage capacity requires review.'),{status:503});const result=await command(['EVAL',compareAndSet,1,key,raw||'',encoded]);if(Number(result.result)!==1)throw Object.assign(Error('Records changed. Reload before retrying.'),{status:409});return next;}};
}
