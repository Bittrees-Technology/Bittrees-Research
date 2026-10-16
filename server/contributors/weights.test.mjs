import test from 'node:test';import assert from 'node:assert/strict';
import {allocationWeight,STANDARD_WEIGHTS} from './weights.mjs';
test('historical level defaults are exact fractions, not rounded percentages',()=>{
 for(const [level,[numerator,denominator]] of Object.entries(STANDARD_WEIGHTS)){const w=allocationWeight(level);assert.equal(w.numerator,numerator);assert.equal(w.denominator,denominator);assert.equal(w.custom,false);}
});
test('individual exceptions normalize exact fractions and require an explanation',()=>{
 const w=allocationWeight('Half Time','2/6','Agreed individual workload');assert.equal(w.label,'1/3');assert.equal(w.custom,true);
 assert.throws(()=>allocationWeight('Half Time','1/3',''),/Explain/);
 assert.equal(allocationWeight('Half Time','2/4').custom,false);
 assert.equal(allocationWeight('Full Time','0/3','Volunteer allocation').label,'0');
 for(const v of ['1/0','-1','NaN','0.5','1/3junk','4294967296','1/4294967296'])assert.throws(()=>allocationWeight('Full Time',v,'Test'));
});
