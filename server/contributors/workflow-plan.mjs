import {createHash} from 'node:crypto';
export function workflowPlan(app){
 const memo=app.memos.find(m=>m.version===app.credential?.memoVersion)||[...app.memos].reverse().find(m=>m.consent&&m.status!=='superseded');
 if(app.state!=='approved'||!memo)return null;
 const title=app.directory?.title||'',scope=memo.scope||'';
 const suggestions=[{id:'contribution',name:'Deliver agreed contributions',description:scope.slice(0,600)}];
 if(/metaverse/i.test(scope))suggestions.push({id:'metaverse',name:'Metaverse strategy review',description:'Review metaverse priorities, delivery progress and next decisions against the signed responsibilities.'});
 if(/talent|recruit|onboard/i.test(scope))suggestions.push({id:'talent',name:'Talent and contributor onboarding',description:'Review recruiting priorities, contributor onboarding and support needs within the agreed responsibilities.'});
 if(/steward|governance/i.test(scope))suggestions.push({id:'stewardship',name:'Bittrees stewardship review',description:'Record stewardship decisions, project coordination and progress for Partner review.'});
 const fingerprint=createHash('sha256').update(JSON.stringify({version:1,memoHash:memo.hash,title,rank:memo.rank,level:memo.level,suggestions})).digest('hex');
 const decision=app.workflowDecision?.fingerprint===fingerprint?app.workflowDecision:null;
 return {fingerprint,memoVersion:memo.version,title,rank:memo.rank,level:memo.level,suggestions,status:decision?.decision||'pending',reviewedBy:decision?.reviewedBy||null,reviewedAt:decision?.reviewedAt||null,reason:decision?.reason||null};
}
