const fs=require('fs'),path=require('path');
const {solve}=require('./models.cjs'),{waitForHuman}=require('./gate.cjs');
const {openTarget}=require('./navigation.cjs');
const clean=s=>String(s).replace(/^\s*[A-H](?:[.、．]|\s*\n)\s*/,'').replace(/\s+/g,'').trim();
const isExempt=text=>String(text).split(/\r?\n/).some(line=>/^(?:免考|已免考|免考通过|本(?:测验|考试|练习)已免考)[。！!]?$/u.test(line.trim()));
function mapAnswer(answers,options,multiple){
 if(!Array.isArray(answers)||!answers.length)throw Error('裁决没有答案');
 const mapped=answers.map(answer=>{
  const text=String(answer).trim();
  if(/^[A-H]$/.test(text)){const i=text.charCodeAt(0)-65;if(i>=options.length)throw Error('选项字母越界');return i;}
  const hits=options.map((o,i)=>clean(o)===clean(text)?i:-1).filter(i=>i>=0);if(hits.length!==1)throw Error('选项内容不唯一或不匹配');return hits[0];
 });
 if(new Set(mapped).size!==mapped.length||!multiple&&mapped.length!==1)throw Error('答案数量与题型不符');return mapped;
}
async function inspectQuestion(page){
 const q=page.locator('.questionContent:visible');await q.waitFor({timeout:15000});
 const stem=(await q.locator('.questionName .centent-pre').innerText()).trim();
 const radio=q.locator('.radio-view li'),checkbox=q.locator('.checkbox-views label.el-checkbox');
 const multiple=!(await radio.count());const choices=multiple?checkbox:radio;
 const options=await choices.allInnerTexts();if(!stem||options.length<2||options.length>8)throw Error('未识别支持的选择题控件');
 return {q,stem,options,multiple,choices};
}
async function select(page,index){
 await page.getByRole('treeitem',{name:String(index),exact:true}).click({timeout:10000,noWaitAfter:true});
 await page.waitForFunction(n=>parseInt(document.querySelector('.questionContent .letterSortNum')?.innerText,10)===n,index,{timeout:5000});
 await page.waitForTimeout(150);return inspectQuestion(page);
}
function parseResult(body,expectedTotal){
 const counts=body.match(/总题数\s*(\d+)\s*已答对\s*(\d+)/),match=body.match(/(?:^|\n)(\d+(?:\.\d+)?)%\s*\n掌握度/);
 if(!counts||!match)return null;
 const total=Number(counts[1]),correct=Number(counts[2]),mastery=Number(match[1]);
 if(total!==expectedTotal||total<1||correct>total||mastery<0||mastery>100)return null;
 return {mastery,total,correct};
}
function unresolved(directory,courseId,pointId){
 const folder=path.join(directory,'submissions');if(!fs.existsSync(folder))return [];
 return fs.readdirSync(folder).filter(f=>f.startsWith(`${courseId}-${pointId}-`)&&f.endsWith('.json')).filter(f=>{
  const record=JSON.parse(fs.readFileSync(path.join(folder,f),'utf8'));
  return record.status!=='verified-result'||!record.result||record.result.total!==record.results?.length||record.result.total<1||record.result.correct>record.result.total;
 });
}
function verifiedFullCorrect(directory,courseId,pointId){
 const folder=path.join(directory,'submissions');if(!fs.existsSync(folder)||unresolved(directory,courseId,pointId).length)return null;
 const prefix=`${courseId}-${pointId}-`,found=[];
 for(const file of fs.readdirSync(folder).filter(f=>f.startsWith(prefix)&&/^(?:\d+|paper-\d+)\.json$/.test(f.slice(prefix.length)))){
  const record=JSON.parse(fs.readFileSync(path.join(folder,file),'utf8')),r=record.result;
  if(record.status!=='verified-result'||!r||r.total<1||r.total!==record.results?.length||r.correct!==r.total||!Number.isFinite(Date.parse(r.at)))continue;
  const u=new URL(r.url),parts=u.pathname.split('/').filter(Boolean);
  if(u.hostname==='ai-smart-course-student-pro.zhihuishu.com'&&parts[0]==='point'&&parts[1]===courseId&&parts[4]===pointId)found.push(r);
 }
 return found.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0]||null;
}
async function paper(page,{courseId,pointId,attemptNumber,directory,log=console.log,solveFn=solve,review,onOwnedPage=()=>{},collectAnalysis=true,uncertainStrategy='review'}){
 if(!require('./models.cjs').config.autoSubmit)throw Error('配置已关闭自动提交，保留当前练习');
 const u=new URL(page.url());
 if(u.hostname!=='studentexamcomh5.zhihuishu.com'||!u.pathname.includes('/'+courseId+'/')||u.searchParams.get('pointId')!==pointId||u.searchParams.get('point')!=='1')throw Error('不是已确认的当前知识点掌握度练习，拒绝当作练习自动提交');
 if(isExempt(await page.locator('body').innerText())){log('平台明确免考，跳过本练习');return {exempt:true,status:'exempt',url:page.url(),at:new Date().toISOString()};}
 if(unresolved(directory,courseId,pointId).length)throw Error('本知识点有未确认的提交结果，必须先核对历史记录，未创建新提交');
 await page.locator('.questionContent:visible').waitFor({timeout:30000});
 const cards=page.getByRole('treeitem').filter({hasText:/^\s*\d+\s*$/});
 await cards.first().waitFor({state:'visible',timeout:20000});
 const total=await cards.count();if(total<1||total>100)throw Error('练习题数无法核实');
 const results=[];
 for(let i=1;i<=total;i++){
  await waitForHuman(page,{log});const item=await select(page,i);log(`掌握度第${i}/${total}题：模型核验中`);
  const hasDiagram=await item.q.locator('.questionName img,.questionName svg,.questionName canvas').count()>0;
  let verdict=require('./references.cjs').lookup({courseId,stem:item.stem,options:item.options});
  if(verdict)log('命中平台已公布解析缓存，题干与全部选项均已匹配');
  else {
   let image;
   if(hasDiagram)image=(await item.q.screenshot({timeout:10000,animations:'disabled'})).toString('base64');
   verdict=await solveFn({text:(item.multiple?'题型：多选题，可能有多个正确选项。\n':'题型：单选或判断题，只能选择一个选项。\n')+item.stem+'\n'+item.options.map((o,n)=>String.fromCharCode(65+n)+'. '+clean(o)).join('\n'),image,hasDiagram});
  }
  if(verdict.decision!=='submit'){
   if(uncertainStrategy==='choose-and-learn'){log('裁决不确定，按用户设置自动选择，交卷后核对平台解析');verdict={...require('./practice-choice.cjs').choose(item.options,item.multiple),reason:'原裁决：'+verdict.reason+'；用户授权选择并从解析学习'};}
   else{if(!review)throw Error('裁决不确定，保留练习待确认：'+verdict.reason);verdict=await review({...item,index:i,reason:verdict.reason});}
  }
  const selected=mapAnswer(verdict.answers,item.options,item.multiple);
  if(item.multiple){for(let j=0;j<item.options.length;j++){const input=item.choices.nth(j).getByRole('checkbox');if(await input.isChecked()!==selected.includes(j))await item.choices.nth(j).click();}}
  else await item.choices.nth(selected[0]).click();
  results.push({stem:item.stem,options:item.options.map(clean),answers:selected.map(j=>clean(item.options[j])),model:verdict.model,reason:verdict.reason});
 }
 for(let i=1;i<=total;i++){
  const item=await select(page,i),saved=results[i-1];
  const actual=await item.q.locator('.radio-view li:has(.checkedIcon),.checkbox-views label.is-checked').allInnerTexts();
  if(item.stem!==saved.stem||JSON.stringify(item.options.map(clean))!==JSON.stringify(saved.options)||JSON.stringify(actual.map(clean).sort())!==JSON.stringify([...saved.answers].sort()))throw Error('提交前逐题回查失败，未提交');
 }
 fs.mkdirSync(path.join(directory,'submissions'),{recursive:true});
 const paperId=u.searchParams.get('paperId');
 if(paperId&&!/^\d+$/.test(paperId))throw Error('平台试卷编号不合法，未提交');
 if(paperId)for(const file of fs.readdirSync(path.join(directory,'submissions')).filter(f=>f.startsWith(`${courseId}-${pointId}-`)&&/^\d+\.json$/.test(f.slice(`${courseId}-${pointId}-`.length)))){
  const prior=JSON.parse(fs.readFileSync(path.join(directory,'submissions',file),'utf8')),source=prior.url||prior.result?.url;
  if(!source)continue;const previousUrl=new URL(source),parts=previousUrl.pathname.split('/').filter(Boolean);
  const previousId=previousUrl.searchParams.get('paperId')||(parts[0]==='point'&&parts[1]===courseId&&parts[4]===pointId?parts[2]:null);
  if(previousId===paperId)throw Error('该平台试卷已有历史提交记录，未重复提交');
 }
 const record=path.join(directory,'submissions',`${courseId}-${pointId}-${paperId?'paper-'+paperId:attemptNumber}.json`);
 fs.writeFileSync(record,JSON.stringify({status:'reserved',url:page.url(),results,at:new Date().toISOString()},null,2),{flag:'wx'});
 const resultPage=await openTarget(page,()=>page.getByText('提交作业',{exact:true}).click({timeout:5000}),url=>url.includes('/point/')&&url.includes('/'+courseId+'/'));
 onOwnedPage(resultPage);
 let parsed,previous,stableSince;const deadline=Date.now()+45000;
 while(Date.now()<deadline){const current=parseResult(await resultPage.locator('body').innerText(),total),fingerprint=JSON.stringify(current);
  if(current&&fingerprint===previous&&Date.now()-stableSince>=2000){parsed=current;break;}
  if(fingerprint!==previous){previous=fingerprint;stableSince=Date.now();}await resultPage.waitForTimeout(500);}
 if(!parsed)throw Error('已尝试提交，但真实成绩尚未确认；保留提交保护，不重交');
 const result={...parsed,url:resultPage.url(),at:new Date().toISOString()};
 fs.writeFileSync(record,JSON.stringify({status:'verified-result',results,result},null,2));
 if(collectAnalysis){try{await require('./analysis.cjs').collect(page.context(),{courseId,pointId,results,result,directory,log});result.analysisVerified=true;fs.writeFileSync(record,JSON.stringify({status:'verified-result',results,result},null,2));}catch(error){log('逐题解析暂未核实，未新增缓存：'+error.message);}}
 log('平台实际掌握度：'+result.mastery+'%（本卷'+result.correct+'/'+result.total+'题正确）');return result;
}
module.exports={clean,mapAnswer,inspectQuestion,select,paper,parseResult,unresolved,verifiedFullCorrect,isExempt};
