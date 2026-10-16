// Exact relative weights from the historical BTREE contributor schedule.
// This module does not calculate or authorize token payments.
export const STANDARD_WEIGHTS={'Full Time':[1,1],'Half Time':[1,2],'Part Time':[1,6],Advisor:[1,10]};
export const WEIGHT_POLICY='btree-relative-weights-v1';
const fail=m=>{throw Object.assign(Error(m),{status:400});};
export function allocationWeight(level,input='',reason=''){
 const standard=STANDARD_WEIGHTS[level];if(!standard)fail('Select a recognized contribution level.');
 let [numerator,denominator]=standard;
 if(input!==undefined&&input!==null&&input!==''){
  if(typeof input!=='string'||!/^\d{1,10}(\/\d{1,10})?$/.test(input.trim()))fail('Use an exact allocation weight such as 1, 1/2 or 1/3.');
  const parts=input.trim().split('/');numerator=Number(parts[0]);denominator=parts.length===1?1:Number(parts[1]);
  if(numerator>4294967295||denominator>4294967295||denominator===0)fail('Allocation weight must use uint32 values and a nonzero denominator.');
  let a=numerator,b=denominator;while(b){[a,b]=[b,a%b];}numerator/=a;denominator/=a;
 }
 const custom=numerator!==standard[0]||denominator!==standard[1];
 if(custom&&(typeof reason!=='string'||!reason.trim()||reason.length>2000))fail('Explain the custom allocation weight for the contributor to acknowledge.');
 return {numerator,denominator,label:denominator===1?String(numerator):`${numerator}/${denominator}`,custom,reason:custom?reason.trim():'',policyVersion:WEIGHT_POLICY};
}
