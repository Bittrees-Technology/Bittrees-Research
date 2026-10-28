export const journeySteps=['Submitted','Under review','Review memorandum','Sign','Credential issued'];
export function contributorStage(app:any){
 if(!app)return 0;
 const memo=app.memos?.at(-1);
 if(memo?.status==='issued'&&app.credential)return 4;
 if(memo?.consent||app.chainOperation?.status==='prepared')return 3;
 if(app.state==='approved')return 2;
 return app.state==='submitted'?0:1;
}
export function credentialLabel(app:any){
 const c=app.credential;
 if(!c)return 'Awaiting credential';
 if(c.standing!=='active')return ({suspended:'Suspended',ended:'Ended',revoked:'Revoked'} as Record<string,string>)[c.standing]||'Validity unavailable';
 return c.termActive===false?'Outside valid term':c.termActive===true?'Active credential':'Validity awaiting verification';
}
export function needsMemoAction(app:any,actor:any){
 if(app.state!=='approved')return false;
 const memo=app.memos?.at(-1);
 if(app.chainOperation?.status==='prepared')return !!actor.canIssue;
 if(app.memoEdits?.some((e:any)=>e.state==='pending'))return !!actor.canIssue;
 if(memo?.status==='issued')return false;
 if(!memo)return !!actor.canIssue;
 return memo.consent?!!actor.canIssue:app.identity===actor.id;
}
export function memoDefaults(app:any,today:string){
 return {level:'Part Time',rank:'Contributor',start:today,end:null,historicalServiceStart:'',scope:app.specialty||''};
}
