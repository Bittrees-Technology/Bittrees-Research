import {test} from 'node:test';import assert from 'node:assert/strict';
import {researchPermissions} from '../shared/research-permissions.mjs';
import {evidence,wallet} from '../tests/fixtures/research-native.mjs';
const permissions=(actions,proof)=>researchPermissions({authoritative:true,expiresAt:6000,actions},1000,proof,wallet);
test('generic admin and role labels cannot substitute for native credentials',()=>{
 for(const action of ['project.admin','role.executive','role.assistant','role.steward','community.roles.manage','research.credentials.assign','research.credentials.define','community.moderation.manage'])assert(permissions([action]).every(a=>a==='rooms.propose'));
 assert(permissions(['project.admin'],evidence('executive',1000)).includes('community.roles.manage'));
 assert.deepEqual(permissions(['role.assistant'],evidence('assistant',1000)),['community.moderation.manage']);
 assert.deepEqual(permissions(['role.steward'],evidence('steward',1000)),['research.credentials.define','community.moderation.manage','rooms.propose']);
 for(const role of ['assistant','steward'])for(const denied of ['community.roles.manage','rooms.manage','research.credentials.assign'])assert(!permissions(['project.admin'],evidence(role,1000)).includes(denied));
});
test('unavailable, unauthoritative, wrong wallet and expired proof grant no admin',()=>{
 for(const d of [null,{authoritative:false,expiresAt:2000,actions:['project.admin']},{authoritative:true,expiresAt:1000,actions:['project.admin']}])assert.deepEqual(researchPermissions(d,1000,evidence('executive',1000),wallet),[]);
 for(const patch of [{status:'unavailable'},{wallet:'0x'+'2'.repeat(40)},{validUntil:999},{chainId:8453},{credentials:[]}])assert.deepEqual(permissions(['community.roles.manage'],{...evidence('executive',1000),...patch}),[]);
});
