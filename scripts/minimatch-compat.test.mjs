import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {ESLint} from 'eslint';

const corpus=JSON.parse(readFileSync(new URL('./fixtures/minimatch-compat.json',import.meta.url),'utf8'));
for(const profile of corpus.profiles)test(`reviewed minimatch APIs preserve ${profile.caller} matching`,()=>{
 const packageURL=new URL(`../node_modules/${profile.caller}/package.json`,import.meta.url);
 assert.equal(JSON.parse(readFileSync(packageURL,'utf8')).version,profile.version,'Review compatibility again when the caller changes.');
 const require=createRequire(packageURL),matcher=require('minimatch');
 assert.equal(require('minimatch/package.json').version,'11.0.1');
 for(const [i,c] of corpus.cases.entries()){
  assert.equal(new matcher.Minimatch(c.pattern,profile.options).match(c.path),profile.expected[i],JSON.stringify(c));
  assert.equal(matcher.minimatch(c.path,c.pattern,profile.options),profile.expected[i],JSON.stringify(c));
 }
});

test('the actual ESLint configuration still selects source files and enforces TS and hook rules',async()=>{
 const eslint=new ESLint();
 assert.equal(await eslint.isPathIgnored('dist/__compat.ts'),true);
 assert.equal(await eslint.isPathIgnored('src/__compat.ts'),false);
 const [ts]=await eslint.lintText('const value: any = 1; console.log(value);',{filePath:'src/__compat.ts'});
 assert(ts.messages.some(m=>m.ruleId==='@typescript-eslint/no-explicit-any'&&m.severity===2));
 const [hooks]=await eslint.lintText("import {useEffect} from 'react'; export default function Demo({ok}:{ok:boolean}){if(ok)useEffect(()=>{},[]);return null;}",{filePath:'src/__compat.tsx'});
 assert(hooks.messages.some(m=>m.ruleId==='react-hooks/rules-of-hooks'&&m.severity===2));
});

test('hostile glob preprocessing respects expansion bounds in an isolated process',()=>{
 const result=spawnSync(process.execPath,['--max-old-space-size=64','--input-type=module','-e',`import {Minimatch} from 'minimatch'; const pattern='**/../'.repeat(20)+'file.ts'; const matcher=new Minimatch(pattern,{optimizationLevel:2,braceExpandMax:64}); if(typeof matcher.match('src/file.ts')!=='boolean')process.exit(2);`],{timeout:5000,encoding:'utf8'});
 assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,result.stderr);
});
