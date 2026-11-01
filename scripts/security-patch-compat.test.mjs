import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import redirects from 'follow-redirects';

test('redirects retain cross-realm sensitive-header rules and strip custom credentials',async()=>{
 let firstHeader,secondHeader;
 const target=http.createServer((req,res)=>{secondHeader=req.headers['x-research-private'];res.end('ok');});
 const start=http.createServer((req,res)=>{firstHeader=req.headers['x-research-private'];res.writeHead(302,{location:`http://127.0.0.1:${target.address().port}/`});res.end();});
 target.listen(0,'127.0.0.1');await once(target,'listening');
 start.listen(0,'127.0.0.1');await once(start,'listening');
 try{
  const sensitiveHeaders=vm.runInNewContext('["x-research-private"]');
  assert.equal(sensitiveHeaders instanceof Array,false);
  await new Promise((resolve,reject)=>{
   const req=redirects.http.get({hostname:'localhost',port:start.address().port,path:'/',headers:{'x-research-private':'synthetic-test-value'},sensitiveHeaders,lookup:(_host,options,callback)=>options?.all?callback(null,[{address:'127.0.0.1',family:4}]):callback(null,'127.0.0.1',4)},res=>{res.resume();res.on('end',resolve);res.on('error',reject);});
   req.on('error',reject);req.setTimeout(3000,()=>req.destroy(Error('Local redirect test timed out')));
  });
  assert.equal(firstHeader,'synthetic-test-value');assert.equal(secondHeader,undefined);
 }finally{await Promise.all([new Promise(r=>start.close(r)),new Promise(r=>target.close(r))]);}
});

test('Joi multiple-email validation stays compatible and bounded on long whitespace',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',`import Joi from 'joi'; const schema=Joi.string().email({multiple:true}); if(schema.validate('one@example.com,two@example.org').error)process.exit(2); const invalid=schema.validate(' '.repeat(100000)); if(!invalid.error||invalid.error.details[0].type!=='string.email')process.exit(3);`],{timeout:5000,encoding:'utf8'});
 assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,result.stderr);
});
