const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {norm}=require('./references.cjs');
function rebuild(directory){
 const doneFile=path.join(directory,'completed-points.json'),completed=fs.existsSync(doneFile)?JSON.parse(fs.readFileSync(doneFile,'utf8')):{};
 const folder=path.join(directory,'analyses');if(!fs.existsSync(folder))return {count:0};
 const map=new Map();
 for(const file of fs.readdirSync(folder).filter(x=>x.endsWith('.json'))){
  let paper;try{paper=JSON.parse(fs.readFileSync(path.join(folder,file),'utf8'));}catch{continue;}
  let url;try{url=new URL(paper.source);}catch{continue;}
  const parts=url.pathname.split('/').filter(Boolean);
  if(completed[paper.courseId+':'+paper.pointId]?.mastery===100)continue;
  if(url.hostname!=='ai-smart-course-student-pro.zhihuishu.com'||parts[0]!=='examPreview'||parts[1]!==paper.courseId||parts[4]!==paper.pointId)continue;
  for(const q of paper.questions||[]){
   if(!q.outcome?.includes('回答错误')||q.hasDiagram||!q.stem||!q.reference?.startsWith('参考答案')||!Array.isArray(q.options)||!q.answers?.length||q.answers.some(a=>q.options.filter(o=>norm(o)===norm(a)).length!==1))continue;
   const id=crypto.createHash('sha256').update(JSON.stringify([norm(q.stem),q.options.map(norm).sort()])).digest('hex').slice(0,24);
   const item=map.get(id)||{id,stem:q.stem,options:q.options,variants:[],attempts:[]};
   const answers=q.answers.map(norm).sort();if(!item.variants.some(a=>JSON.stringify(a)===JSON.stringify(answers)))item.variants.push(answers);
   if(!item.attempts.some(a=>a.source===paper.source))item.attempts.push({selected:q.selected,referenceAnswers:q.answers,reference:q.reference,explanation:q.explanation||'未记录解析正文；参考答案已逐题核验',source:paper.source,verifiedAt:paper.verifiedAt});
   item.conflictingReferences=item.variants.length>1;map.set(id,item);
  }
 }
 const entries=[...map.values()],result={count:entries.length,entries};
 const target=path.join(directory,'mistakes.json'),text=JSON.stringify(result,null,2);
 if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==text){fs.writeFileSync(target+'.tmp',text);fs.renameSync(target+'.tmp',target);}
 return result;
}
if(require.main===module){const directory=path.join(__dirname,'data',require('./settings.json').account);const run=()=>{const r=rebuild(directory);console.log('已核验错题库：'+r.count+'题');};run();if(process.argv.includes('--watch')){console.log('错题库同步进程PID：'+process.pid);setInterval(run,15000);}}
function finishPoint({directory,courseId,pointId,mastery,source}){
 if(mastery!==100)throw Error('仅平台100掌握度可清理临时题库');
 const file=path.join(directory,'completed-points.json'),done=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 done[courseId+':'+pointId]={mastery,source,at:new Date().toISOString()};fs.writeFileSync(file+'.tmp',JSON.stringify(done,null,2));fs.renameSync(file+'.tmp',file);
 require('./references.cjs').forgetPracticePoint(courseId,pointId);return rebuild(directory);
}
module.exports={rebuild,finishPoint};
