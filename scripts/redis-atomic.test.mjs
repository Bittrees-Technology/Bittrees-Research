import test from 'node:test';import assert from 'node:assert/strict';import {spawn,execFileSync} from 'node:child_process';import {commitScript} from '../server/signed-registry.mjs';
// Disposable loopback-only Redis on an OS-selected test port; never a production connection.
test('actual Redis commits nonce/revision/state/audit atomically and rejects conflicts',async()=>{
 const port=19000+Math.floor(Math.random()*1000),server=spawn('redis-server',['--bind','127.0.0.1','--port',String(port),'--save','','--appendonly','no'],{stdio:['ignore','pipe','pipe']});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Redis startup timeout')),5000);server.stdout.on('data',b=>{if(b.toString().includes('Ready to accept connections')){clearTimeout(timer);resolve()}});server.on('error',reject);server.on('exit',code=>{if(code)reject(Error('Redis failed'))})});
 const cmd=(...args)=>execFileSync('redis-cli',['-p',String(port),'--raw',...args.map(String)],{encoding:'utf8'}).trim();
 const commit=(nonce,rev,value)=>cmd('EVAL',commitScript,3,'rev',nonce,'audit',rev,JSON.stringify([['roles',JSON.stringify(value)]]),'event');
 assert.equal(commit('n1',0,{a:'Moderator'}),'1');assert.equal(cmd('LLEN','audit'),'1');assert.equal(commit('n1',1,{a:'Partner'}),'-2');assert.equal(commit('n2',0,{a:'Partner'}),'-1');assert.equal(cmd('GET','roles'),'{"a":"Moderator"}');
 cmd('DEL','audit');cmd('SET','audit','badtype');assert.equal(commit('n2',1,{a:'Partner'}),'-3');assert.equal(cmd('GET','rev'),'1');assert.equal(cmd('EXISTS','n2'),'0');
 }finally{server.kill('SIGTERM');}
});
