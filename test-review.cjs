const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {review}=require('./review.cjs');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'zhs-review-'));
 try{
  Object.defineProperty(process.stdin,'isTTY',{value:true,configurable:true});
  const operation=review({stem:'离线核验',options:['A. 对','B. 错'],multiple:false,index:1,reason:'fixture'},{store:{directory},log:()=>{}});
  const files=fs.readdirSync(path.join(directory,'review')),request=JSON.parse(fs.readFileSync(path.join(directory,'review',files[0]),'utf8'));
  setTimeout(()=>fs.writeFileSync(path.join(directory,'review',request.id+'.reply.json'),JSON.stringify({id:request.id,answers:['B'],reason:'离线外部答复测试'})),100);
  const result=await Promise.race([operation,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('TTY外部答复未恢复')),3000);timer.unref();})]);
  assert.deepEqual(result.answers,['B']);console.log('PASS external reply resumes pending terminal question without additional keystrokes');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
