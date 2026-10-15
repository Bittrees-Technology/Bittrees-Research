export const SITES={gov:{lane:'inc-ops-governance',name:'Bittrees Governance',host:'gov.bittrees.org'},research:{lane:'research',name:'Bittrees Research',host:'research.bittrees.org'}};
export const EXPERTISE=['Business','Technology','Community','Research'];
export const RESEARCH_ROLES=['Researcher','Contributor','Assistant','Steward'];
const fail=m=>{throw Object.assign(Error(m),{status:400})};
const string=(x,name,max=2000,required=false)=>{if(x===undefined||x===null)x='';if(typeof x!=='string'||x.length>max||(required&&!x.trim()))fail(`Check ${name}.`);return x.trim()};
const list=(x,name,allowed,required=false)=>{if(x===undefined)x=[];if(!Array.isArray(x)||x.length>20||x.some(v=>typeof v!=='string'||!v.trim()||v.length>100||(allowed&&!allowed.includes(v)))||(required&&!x.length))fail(`Check ${name}.`);return [...new Set(x.map(v=>v.trim()))]};
export function normalizeInterest(input,site,actor){
 if(!SITES[site])fail('Unknown project.');
 const allowed=['name','email','twitter','telegram','expertise','requestedRoles','specialty','expertField','region','languages','heardFrom','referrer','wallet'];
 for(const k of Object.keys(input))if(!allowed.includes(k))fail(`Unexpected application field: ${k}`);
 const email=string(input.email,'email',160,true);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Enter a valid email.');
 const wallet=string(input.wallet,'preferred wallet',64)||null;
 if(wallet&&!/^0x[a-fA-F0-9]{40}$/.test(wallet||''))fail('Enter a full ETH address. ENS names must be resolved and verified before issuance.');
 const requestedRoles=list(input.requestedRoles,'requested roles',RESEARCH_ROLES,site==='research');if(site==='gov'&&requestedRoles.length)fail('Research roles belong to a Research application.');
 return {name:string(input.name,'name',120,true),email,twitter:string(input.twitter,'X / Twitter',160),telegram:string(input.telegram,'Telegram',160),expertise:list(input.expertise,'expertise',EXPERTISE,true),requestedRoles,specialty:string(input.specialty,'contribution interests',2000,true),expertField:string(input.expertField,'expert field',1000),region:list(input.region,'region',['EMEA','APAC','LATAM','NORAM'],true),languages:list(input.languages,'languages'),heardFrom:string(input.heardFrom,'discovery source',160,true),referrer:string(input.referrer,'referrer',120),wallet:wallet?.toLowerCase()||null,walletVerification:!wallet?'not_connected':wallet.toLowerCase()===actor.wallet?.toLowerCase()?'verified':'unverified',source:'contributor-portal',schemaVersion:2};
}
export function emptyDirectory(id){return {contributorId:id,ens:'',sector:'',groupLeader:false,groups:[],title:'',specialty1:'',specialty2:'',otherPositions:'',notes:'',followUp:'',legacyRateLabel:'',legacyMemoReference:'',legacyStatus:'',legacyValidationDate:'',startDate:null};}
