import {readFileSync,realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// These pinned compatibility patches are part of the repository. Git
// checks the complete diff before applying, and reverse-checks repeated installs.
for(const [name,version,file] of [
 ['@pushprotocol/restapi','1.7.32','@pushprotocol+restapi+1.7.32.patch'],
 ['query-string','7.1.3','query-string+7.1.3.patch'],
 ['@coinbase/cdp-sdk','1.51.0','@coinbase+cdp-sdk+1.51.0.patch'],
]){
 if(JSON.parse(readFileSync(resolve(root,'node_modules',name,'package.json'))).version!==version)throw Error('Review the compatibility patch before changing '+name+' version');
 const patch=resolve(root,'patches',file),directory=realpathSync(resolve(root,'node_modules',name)),strip=name.startsWith('@')?4:3,run=args=>spawnSync('git',['apply','--unsafe-paths','--directory='+directory,'-p'+strip,'--whitespace=nowarn',...args,patch],{cwd:root,encoding:'utf8'});
 if(run(['--check','--reverse']).status===0){console.log('Compatibility patch already applied: '+name);continue;}
 if(run(['--check']).status!==0)throw Error('Compatibility patch no longer matches '+name);
 const result=run([]);if(result.status!==0)throw Error('Could not apply compatibility patch '+name);console.log('Applied compatibility patch: '+name);
}
