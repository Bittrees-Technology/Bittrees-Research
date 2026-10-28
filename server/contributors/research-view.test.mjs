import test from 'node:test';
import assert from 'node:assert/strict';
import {researchApplicationView} from './research-view.mjs';
test('Research projection preserves review and source without exposing Governance issuance or allocation state',()=>{
 const app={id:'1',state:'approved',requestedRoles:['Executive'],sourceAttestation:{uid:'source'},reviews:[{reason:'Accepted'}],memos:[{status:'issued'}],credential:{tokenId:'99'},chainOperation:{data:'pending'},workflowPlan:{},proposals:[],validations:[],directory:{}};
 const view=researchApplicationView({applications:[app],policy:{issuer:'Partner'},persona:{canReview:true}});
 assert.deepEqual(view.applications,[{id:'1',state:'approved',requestedRoles:['Executive'],sourceAttestation:{uid:'source'},reviews:[{reason:'Accepted'}]}]);
 assert.equal(app.credential.tokenId,'99');assert.equal(app.chainOperation.data,'pending');
 assert.equal(view.policy.executiveIssuer,'Primary admin Safes only');assert.equal(view.policy.roles.length,5);
});
