// Common display-only profile for verified wallet identities. No permissions or private fields.
export function safeProfileUrl(value) {
 try {const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||value.length>2048||/[\x00-\x20\x7f]/.test(value)||!u.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname))return null;return u.href;}catch{return null;}
}
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(value)?value.trim()||null:null;
export async function readEnsProfile(wallet,client) {
 if(typeof wallet!=='string'||!/^0x[a-f0-9]{40}$/.test(wallet))throw Error('Verified wallet required');
 const empty={wallet,name:null,avatar:null,bio:null,website:null,source:'ens',status:'absent'};
 const [chainId,block]=await Promise.all([client.getChainId(),client.getBlock({blockTag:'latest'})]);
 if(chainId!==1||block.number===null||Math.abs(Date.now()/1000-Number(block.timestamp))>300)throw Error('Current Ethereum mainnet data required');
 const options={blockNumber:block.number};
 const name=await client.getEnsName({address:wallet,...options});
 if(!name)return empty;
 if(typeof name!=='string'||name.length>255||/[\x00-\x20\x7f]/.test(name))return {...empty,status:'unverified'};
 const address=await client.getEnsAddress({name,...options});
 if(address?.toLowerCase()!==wallet)return {...empty,status:'unverified'};
 const [bio,website,avatar]=await Promise.all(['description','url','avatar'].map(key=>client.getEnsText({name,key,...options})));
 return {wallet,name,avatar:text(avatar,2048)?'https://metadata.ens.domains/mainnet/avatar/'+encodeURIComponent(name):null,bio:text(bio,1000),website:safeProfileUrl(website),source:'ens',status:'current',checkedAt:new Date().toISOString(),editUrl:'https://app.ens.domains/'+encodeURIComponent(name)};
}
