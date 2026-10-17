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
 await expect(page.getByRole('region',{name:'Prepared credential transaction'})).toContainText('Revoke credential #9');
 await expect(page.getByRole('link',{name:'Manage and verify roles in Roles ↗'})).toHaveAttribute('href','https://roles.bittrees.org/role-management?project=research');
});

test('an outer Safe receipt without the credential event is not shown as completion',async({page})=>{
 await form(page);await page.evaluate(()=>(window as any).__membershipFixture('safe'));
 await page.getByRole('button',{name:'Prepare credential issuance'}).click();
 await page.getByRole('button',{name:'Submit with connected Safe'}).click();
 await expect(page.getByRole('status')).toContainText('Execution was not confirmed');
 await expect(page.getByText(/Transaction confirmed. Current chain/)).toHaveCount(0);
});

test('creation saves a definition separately; assignment selects its exact type',async({page})=>{
 await page.goto('/?manage');await page.getByRole('button',{name:'Create a role credential',exact:true}).click();
 await expect(page.getByLabel('Member wallet')).toHaveCount(0);
 await page.getByLabel('Credential name',{exact:true}).fill('Editor');await page.getByLabel('Credential identifier',{exact:true}).fill('research.role.editor.v1');await page.getByLabel('Definition metadata URL').fill('https://example.org/editor.json');
 await page.getByRole('button',{name:'Create credential definition',exact:true}).click();
 await expect(page.getByRole('combobox',{name:/Role credential/})).toBeVisible();await page.getByRole('combobox',{name:/Role credential/}).selectOption('research.role.editor.v1');
 await expect(page.getByText(/This type has no approved Roles permission mapping/)).toBeVisible();
 await expect(page.getByLabel('Public credential metadata URL')).toHaveValue('https://example.org/editor.json');
 await expect(page.getByRole('region',{name:'Prepared credential transaction'})).toHaveCount(0);
 await page.getByLabel('Member wallet').fill('0x1111111111111111111111111111111111111111');await page.getByLabel('Active membership token ID').fill('7');await page.getByRole('button',{name:'Prepare credential issuance'}).click();
 await expect(page.getByRole('region',{name:'Prepared credential transaction'})).toContainText('Issue 0x');
 await page.getByRole('button',{name:'Create a role credential',exact:true}).click();await expect(page.getByRole('region',{name:'Prepared credential transaction'})).toHaveCount(0);
});

test('five built-in definitions are available and unrelated credentials have no role actions',async({page})=>{
 await page.goto('/?manage');await expect(page.getByRole('combobox',{name:/Role credential/}).locator('option')).toHaveText(['Researcher','Contributor','Assistant','Steward','Executive']);
 await page.evaluate(()=>(window as any).__unknownCredential=true);await page.getByLabel('Member wallet').fill('0x1111111111111111111111111111111111111111');
 await expect(page.getByText(/Read at block 100/)).toBeVisible();await expect(page.getByRole('button',{name:'Prepare revocation'})).toHaveCount(0);
});
