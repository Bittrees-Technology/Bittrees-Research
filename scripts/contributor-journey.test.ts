import test from 'node:test';
import assert from 'node:assert/strict';
import {contributorStage,journeySteps} from '../src/lib/contributorJourney.ts';
test('Research acceptance moves to separate role assignment, never implies issuance',()=>{
 const app:any={state:'submitted'};assert.equal(contributorStage(app),0);
 app.state='in_review';assert.equal(contributorStage(app),1);
 app.state='approved';assert.equal(contributorStage(app),2);
 app.memos=[{status:'issued',consent:{}}];app.credential={tokenId:'1',standing:'active'};
 assert.equal(contributorStage(app),2);assert.deepEqual(journeySteps,['Submitted','Under review','Role assignment']);
});
