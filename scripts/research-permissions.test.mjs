import {test} from 'node:test';import assert from 'node:assert/strict';
import {researchPermissions} from '../shared/research-permissions.mjs';
const permissions=actions=>researchPermissions({authoritative:true,expiresAt:2000,actions},1000);
test('current Research role permissions are bounded',()=>{
 assert.deepEqual(permissions(['role.assistant']),['community.moderation.manage']);
 assert.deepEqual(permissions(['role.steward']),['research.credentials.define','community.moderation.manage','rooms.propose']);
 for(const actions of [['research.credentials.assign','community.moderation.manage'],['research.credentials.define','community.moderation.manage']]){
  assert.deepEqual(permissions(actions),['community.moderation.manage',actions[0]]);
  for(const denied of ['community.roles.manage','rooms.manage'])assert(!permissions(actions).includes(denied));
 }
 assert(permissions(['role.executive']).includes('community.roles.manage')); // Existing independent admin grant.
});
test('unavailable, unauthoritative and expired decisions grant nothing',()=>{
 for(const d of [null,{authoritative:false,expiresAt:2000,actions:['project.admin']},{authoritative:true,expiresAt:1000,actions:['project.admin']}])assert.deepEqual(researchPermissions(d,1000),[]);
});
