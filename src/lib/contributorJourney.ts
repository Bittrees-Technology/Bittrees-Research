export const journeySteps=['Submitted','Under review','Role assignment'];
/** Application acceptance never claims that a credential was issued. */
export function contributorStage(app:any){
 if(app?.state==='approved')return 2;
 return !app||app.state==='submitted'?0:1;
}
