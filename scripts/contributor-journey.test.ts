import test from 'node:test';
import assert from 'node:assert/strict';
import {contributorStage,credentialLabel,needsMemoAction,memoDefaults} from '../src/lib/contributorJourney.ts';
test('one applicant journey tracks review, signed consent and actual issuance as distinct states',()=>{
 const app:any={state:'submitted',memos:[],identity:'owner'};
 assert.equal(contributorStage(app),0);app.state='in_review';assert.equal(contributorStage(app),1);
 app.state='approved';assert.equal(contributorStage(app),2);app.memos=[{status:'draft',consent:{}}];assert.equal(contributorStage(app),3);
 app.memos[0].status='issued';assert.equal(contributorStage(app),3);app.credential={tokenId:'1',standing:'active',termActive:false};assert.equal(contributorStage(app),4);assert.equal(credentialLabel(app),'Outside valid term');
 app.credential.standing='suspended';assert.equal(credentialLabel(app),'Suspended');
});
test('memo queue distinguishes issuer work from applicant signatures and completed issuance',()=>{
 const app:any={state:'approved',identity:'owner',memos:[]};const reviewer={id:'partner',canIssue:true},owner={id:'owner',canIssue:false};
 assert.equal(needsMemoAction(app,reviewer),true);app.memos=[{status:'draft'}];assert.equal(needsMemoAction(app,reviewer),false);assert.equal(needsMemoAction(app,owner),true);
 app.memos[0].consent={};assert.equal(needsMemoAction(app,reviewer),true);assert.equal(needsMemoAction(app,owner),false);
 app.memos[0].status='issued';assert.equal(needsMemoAction(app,reviewer),false);
 assert.equal(memoDefaults({specialty:'Documentation'},'2026-10-28').scope,'Documentation');assert.equal(credentialLabel({}),'Awaiting credential');
});
