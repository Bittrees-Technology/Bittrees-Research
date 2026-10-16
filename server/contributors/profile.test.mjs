import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync,sign} from 'node:crypto';import {projectContributors,createProfileHandler} from './profile.mjs';import {profileRequestMessage} from '../../shared/contributor-profile.mjs';
test('profile matches verified identities and excludes private notes, contact details and unverified wallets',()=>{const state={applications:[{id:'one',email:'one@example.org',wallet:'0x'+'1'.repeat(40),walletVerification:'unverified',state:'approved',memos:[],directory:{notes:'PRIVATE'},reviews:[{privateNote:'SECRET'}]}]};assert.equal(projectContributors(state,['0x'+'1'.repeat(40)],'gov').length,0);const rows=projectContributors(state,['one@example.org'],'gov');assert.equal(rows.length,1);assert.ok(!JSON.stringify(rows).includes('PRIVATE'));assert.ok(!JSON.stringify(rows).includes('example.org'));assert.equal(rows[0].credential,null);});
test('unsigned, wrong-audience and replayed profile requests fail closed',async()=>{const roles=generateKeyPairSync('ed25519'),site=generateKeyPairSync('ed25519');const env={CONTRIBUTORS_ENABLED:'1',ROLES_ECOSYSTEM_DECISION_PUBLIC_KEY:roles.publicKey,ROLES_ECOSYSTEM_REQUEST_PRIVATE_KEY:site.privateKey,CONTRIBUTOR_STORAGE_SECRET:'s'.repeat(48)};let used=false;const command=async c=>c[0]==='GET'?{result:null}:{result:used?null:(used=true,'OK')};const handler=createProfileHandler('gov',{env,command,now:()=>100000});const request={version:1,audience:'https://gov.bittrees.org',identities:['one@example.org'],issuedAt:100000,requestId:'00000000-0000-4000-8000-000000000000'};const signature=sign(null,Buffer.from(profileRequestMessage(request)),roles.privateKey).toString('base64');const res=()=>({setHeader(){},status(n){this.code=n;return this},json(v){this.body=v;return this}});let r=res();await handler({method:'POST',body:{request,signature:'invalid'}},r);assert.equal(r.code,401);r=res();await handler({method:'POST',body:{request,signature}},r);assert.equal(r.code,200);r=res();await handler({method:'POST',body:{request,signature}},r);assert.equal(r.code,409);r=res();await handler({method:'POST',body:{request:{...request,audience:'https://research.bittrees.org'},signature}},r);assert.equal(r.code,401);});

test('unverified email in imported application cannot claim its Roles profile',()=>{
 const wallet='0x'+'2'.repeat(40),app={id:'base-app',email:'unverified@example.invalid',emailVerified:false,wallet,walletVerification:'verified',state:'submitted',memos:[]};
 assert.equal(projectContributors({applications:[app]},['unverified@example.invalid'],'gov').length,0);
 assert.equal(projectContributors({applications:[app]},[wallet],'gov').length,1);
});

test('application profile updates automatically while unsigned drafts and staff details stay private',()=>{
 const wallet='0x'+'3'.repeat(40);
 const app={id:'profile',name:'Jonathan',wallet,walletVerification:'verified',state:'submitted',specialty:'Metaverse strategy',expertise:['Technology'],languages:['English'],requestedRoles:['Steward'],email:'private@example.org',twitter:'private-contact',directory:{title:'Founder and Steward',notes:'STAFF ONLY'},memos:[{version:1,scope:'Agreed responsibilities',consent:{signature:'private signature'}},{version:2,scope:'UNSIGNED REPLACEMENT',status:'draft'}]};
 const read=()=>projectContributors({applications:[app]},[wallet],'gov')[0];
 assert.equal(read().profile.name,'Jonathan');assert.equal(read().profile.interests,'Metaverse strategy');
 assert.equal(read().profile.title,'');assert.equal(read().profile.responsibilities,'Agreed responsibilities');
 app.state='approved';assert.equal(read().profile.title,'Founder and Steward');
 app.specialty='Talent acquisition';assert.equal(read().profile.interests,'Talent acquisition');
 app.credential={memoVersion:1,tokenId:1};assert.equal(read().profile.responsibilitiesMemoVersion,1);
 for(const secret of ['STAFF ONLY','private@example.org','private-contact','private signature','UNSIGNED REPLACEMENT'])assert.ok(!JSON.stringify(read()).includes(secret));
 assert.equal(projectContributors({applications:[app]},['0x'+'4'.repeat(40)],'gov').length,0);
});
