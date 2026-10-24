const {newBackgroundPage,closeTaskPage}=require('./background.cjs');
const fs=require('fs'),path=require('path');
const {norm}=require('./references.cjs');

async function extract(page){
 return page.locator('.question-item').evaluateAll(items=>items.map(e=>({
  stem:e.querySelector('.quest-title .option-name')?.innerText.trim(),
  options:[...e.querySelectorAll('.el-radio__label,.el-checkbox__label')].map(x=>(x.querySelector('.preStyle')||x).innerText.trim()),
  selected:[...e.querySelectorAll('label.is-checked .el-radio__label,label.is-checked .el-checkbox__label')].map(x=>(x.querySelector('.preStyle')||x).innerText.trim()),
  reference:e.querySelector('.answer-title')?.innerText.trim(),
  explanation:e.querySelector('.html-v-analysis')?.innerText.trim()||'',
  outcome:e.querySelector('.question-result')?.innerText.trim(),
  hasDiagram:!!e.querySelector('.quest-title img,.quest-title svg,.quest-title canvas,.el-radio__label img,.el-checkbox__label img')
 })));
}
function answers(reference,options){
 const text=String(reference||'').replace(/^\s*参考答案\s*[：:]\s*/,'').trim();
 if(!text||text===reference)throw Error('平台尚未公布参考答案');
 const exact=options.filter(o=>norm(o)===norm(text));if(exact.length===1)return exact;
 if(/^[A-H](?:[\s,，、;；]*[A-H])*$/.test(text)){
  const letters=text.match(/[A-H]/g),indices=letters.map(c=>c.charCodeAt(0)-65);
  if(new Set(indices).size!==indices.length||indices.some(i=>i>=options.length))throw Error('参考答案选项越界或重复');
  return indices.map(i=>options[i]);
 }
 throw Error('参考答案格式无法唯一映射到选项');
}
function validate(questions,submitted,result){
 if(!Array.isArray(questions)||questions.length!==submitted.length||questions.length!==result.total)throw Error('解析题数与本次提交不符');
 let correct=0;
 const verified=questions.map((q,i)=>{
  const saved=submitted[i];
  if(!q.stem||norm(q.stem)!==norm(saved.stem)||JSON.stringify(q.options.map(norm).sort())!==JSON.stringify(saved.options.map(norm).sort()))throw Error('解析题面与本次提交不符');
  if(JSON.stringify(q.selected.map(norm).sort())!==JSON.stringify(saved.answers.map(norm).sort()))throw Error('解析作答与本次提交不符，不能使用旧试卷结果');
  const referenceAnswers=answers(q.reference,q.options);
  const right=JSON.stringify(q.selected.map(norm).sort())===JSON.stringify(referenceAnswers.map(norm).sort());
  if(right&&!q.outcome?.includes('回答正确')||!right&&!q.outcome?.includes('回答错误'))throw Error('平台逐题判分与参考答案不一致');
  if(right)correct++;
  return {...q,answers:referenceAnswers};
 });
 if(correct!==result.correct)throw Error('解析正确题数与本次成绩不一致');
 return verified;
}
async function collect(context,{courseId,pointId,results,result,directory,log=console.log}){
 const u=new URL(result.url),parts=u.pathname.split('/').filter(Boolean);
 if(u.hostname!=='ai-smart-course-student-pro.zhihuishu.com'||parts[0]!=='point'||parts[1]!==courseId||parts[4]!==pointId||parts.length!==6)throw Error('成绩网址与知识点不符');
 u.pathname=u.pathname.replace('/point/','/examPreview/');
 const page=await newBackgroundPage(context);
 try{
  await page.goto(u.href,{waitUntil:'domcontentloaded',timeout:30000});
  const deadline=Date.now()+20000;let verified,lastError;
  while(Date.now()<deadline){
   try{verified=validate(await extract(page),results,result);break;}catch(error){lastError=error;}
   await page.waitForTimeout(500);
  }
  if(!verified)throw lastError||Error('逐题解析尚未载入');
  const evidence={source:page.url(),courseId,pointId,verifiedAt:new Date().toISOString(),questions:verified};
  fs.mkdirSync(path.join(directory,'analyses'),{recursive:true});
  fs.writeFileSync(path.join(directory,'analyses',`${courseId}-${pointId}-${parts[2]}.json`),JSON.stringify(evidence,null,2));
  require('./mistakes.cjs').rebuild(directory);
  const added=require('./references.cjs').rememberAnalysis(evidence);
  log('平台逐题解析已核验，新增'+added+'条参考答案');return evidence;
 }finally{await closeTaskPage(page).catch(()=>{});}
}
module.exports={extract,answers,validate,collect};
