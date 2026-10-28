/** Keep historical Governance-shaped fields in storage, outside Research's product flow. */
export function researchApplicationView(view){
 return {...view,applications:view.applications.map(({memos,memoEdits,credential,chainOperation,workflowPlan,proposals,validations,directory,...app})=>app),policy:{version:'research-membership-roles-v1',issuer:'Active Executive credential or primary admin Safe',roles:['Researcher','Contributor','Assistant','Steward','Executive'],executiveIssuer:'Primary admin Safes only'}};
}
