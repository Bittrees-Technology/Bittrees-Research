import {mkdir,readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {seed} from './service.mjs';
export function createStore(file){
 let queue=Promise.resolve();
 const save=async data=>{await mkdir(dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+randomUUID();await writeFile(temp,JSON.stringify(data,null,2),{mode:0o600});await rename(temp,file);await chmod(file,0o600);};
 const read=async()=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;const s=seed();await save(s);return s;}};
 return {read,mutate(fn){const result=queue.then(async()=>{const current=await read();const next=fn(current);await save(next);return next;});queue=result.catch(()=>{});return result;}};
}
