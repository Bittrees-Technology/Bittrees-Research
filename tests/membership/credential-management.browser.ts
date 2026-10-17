import {test,expect} from '@playwright/test';
async function form(page:any){await page.goto('/?manage');await page.getByLabel('Member wallet').fill('0x1111111111111111111111111111111111111111');await page.getByLabel('Active membership token ID').fill('7');}
test('credential preparation preserves Safe approvals and does not grant an independent role',async({page})=>{
 await form(page);await page.getByRole('button',{name:'Prepare credential issuance'}).click();
 await expect(page.getByRole('region',{name:'Prepared credential transaction'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Submit with connected Safe'})).toHaveCount(0);
 await expect(page.getByText(/Role eligibility changes only after Safe execution/)).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download Safe transaction'}).click();
 const file=await download,stream=await file.createReadStream(),chunks=[];for await(const chunk of stream!)chunks.push(chunk);
 const batch=JSON.parse(Buffer.concat(chunks).toString());expect(batch.chainId).toBe('1');expect(batch.transactions[0].value).toBe('0');expect(batch.meta.createdFromSafeAddress).toBe('0x2F8f86e6E1Ff118861BEB7E583DE90f0449A264f');
});
test('changing target invalidates prepared calldata',async({page})=>{
 await form(page);await page.getByRole('button',{name:'Prepare credential issuance'}).click();await expect(page.getByRole('region',{name:'Prepared credential transaction'})).toBeVisible();
 await page.getByLabel('Member wallet').fill('0x2222222222222222222222222222222222222222');await expect(page.getByRole('region',{name:'Prepared credential transaction'})).toHaveCount(0);
});
test('wallet change rejects a late preparation result',async({page})=>{
 await form(page);await page.evaluate(()=>(window as any).__holdCredential=true);await page.getByRole('button',{name:'Prepare credential issuance'}).click();
 await page.evaluate(()=>{(window as any).__membershipFixture('switch');(window as any).__releaseCredential();});
 await expect(page.getByRole('region',{name:'Prepared credential transaction'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Prepare credential issuance'})).toBeEnabled();
});
test('existing credential revocation prepares the existing ID and exposes Roles refresh handoff',async({page})=>{
 await form(page);await page.getByRole('button',{name:'Prepare revocation'}).click();
 await expect(page.getByRole('region',{name:'Prepared credential transaction'})).toContainText('Revoke Researcher credential #9');
 await expect(page.getByRole('link',{name:'Manage and verify roles in Roles ↗'})).toHaveAttribute('href','https://roles.bittrees.org/role-management?project=research');
});
