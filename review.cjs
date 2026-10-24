const fs=require('fs'),path=require('path'),crypto=require('crypto'),readline=require('readline/promises');
const {mapAnswer}=require('./practice.cjs');
async function review(question,{store,log=console.log}){
 const id=crypto.createHash('sha256').update(JSON.stringify({stem:question.stem,options:question.options})).digest('hex').slice(0,24),dir=path.join(store.directory,'review');fs.mkdirSync(dir,{recursive:true});
 const request=path.join(dir,id+'.request.json'),reply=path.join(dir,id+'.reply.json');
 fs.writeFileSync(request,JSON.stringify({id,index:question.index,stem:question.stem,options:question.options,multiple:question.multiple,reason:question.reason},null,2));
 log('\x07裁决不确定，请核对：'+question.stem+'\n'+question.options.join('\n')+'\n原因：'+question.reason+'\n确认答复：'+reply);
 const abort=new AbortController();let terminal;
 const pending=[];
 if(process.stdin.isTTY&&!fs.existsSync(reply)){
  terminal=readline.createInterface({input:process.stdin,output:process.stdout});
  pending.push((async()=>{for(;;){
   const value=(await terminal.question('输入答案字母（多选用逗号分隔）：',{signal:abort.signal})).trim().toUpperCase(),answers=value.split(/[\s,，]+/).filter(Boolean);
   try{mapAnswer(answers,question.options,question.multiple);}catch(e){log(e.message);continue;}
   if((await terminal.question('确认本题答案？输入“确认”：',{signal:abort.signal})).trim()!=='确认')continue;
   const r={id,answers,reason:'用户在脚本窗口输入并确认'};
   try{fs.writeFileSync(reply,JSON.stringify(r),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
   // Always use the same validation path, including concurrent external replies.
   return readReply(reply,id,question);
  }})());
 }
 pending.push((async()=>{let lastError;while(!abort.signal.aborted){
  if(fs.existsSync(reply)){try{return readReply(reply,id,question);}catch(e){if(e.message!==lastError){log('答复暂不可用：'+e.message);lastError=e.message;}}}
  await new Promise(resolve=>setTimeout(resolve,250));
 }})());
 try{return await Promise.race(pending);}finally{abort.abort();terminal?.close();}
}
function readReply(file,id,question){
 const r=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
 if(r.id!==id||typeof r.reason!=='string'||!r.reason.trim())throw Error('答复缺少匹配编号或依据');
 mapAnswer(r.answers,question.options,question.multiple);return {...r,decision:'submit',model:'manual-review'};
}
module.exports={review,readReply};
