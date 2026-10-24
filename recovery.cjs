const fs=require('fs'),path=require('path'),crypto=require('crypto'),practice=require('./practice.cjs');
async function recover(page,{file,directory,courseId,account,log=console.log}){
 const original=fs.readFileSync(file,'utf8'),record=JSON.parse(original),u=new URL(record.url),pointId=u.searchParams.get('pointId'),paperId=u.searchParams.get('paperId');
 if(record.status!=='reserved'||u.hostname!=='studentexamcomh5.zhihuishu.com'||!u.pathname.includes('/'+courseId+'/')||u.searchParams.get('point')!=='1'||!/^\d+$/.test(paperId)||!/^\d+$/.test(pointId)||!record.results?.length)throw Error('不是可恢复的当前课程练习记录');
 let metadata;
 const capture=async response=>{try{if(!new URL(response.url()).pathname.endsWith('/getExamTestUserInfo'))return;const value=await response.json();if(value.code===0&&String(value.data?.examPaperId)===paperId)metadata=value.data;}catch{}};
 page.on('response',capture);
 async function inspect(){metadata=null;await page.goto(u.href,{waitUntil:'domcontentloaded',timeout:30000});await require('./gate.cjs').waitForHuman(page,{log});await page.locator('.questionContent').first().waitFor({timeout:20000});for(let i=0;!metadata&&i<20;i++)await page.waitForTimeout(100);if(!metadata||String(metadata.studentCode)!==account||metadata.questionCount!==record.results.length||metadata.examType!==5||metadata.onlineExam!==0)throw Error('原卷平台状态/身份未确认，保留保护');return metadata;}
 try{
  const before=await inspect();let submitted=false;
  if(before.examState===3&&before.submitTime===null){
   for(let i=1;i<=record.results.length;i++){const q=await practice.select(page,i),saved=record.results[i-1],selected=await q.q.locator('.radio-view li:has(.checkedIcon),.checkbox-views label.is-checked').allInnerTexts();if(q.stem!==saved.stem||JSON.stringify(q.options.map(practice.clean))!==JSON.stringify(saved.options)||JSON.stringify(selected.map(practice.clean).sort())!==JSON.stringify([...saved.answers].sort()))throw Error('原卷作答与保护记录不符，保留人工核对');}
   const evidence=path.join(directory,'recovery-evidence');fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,paperId+'-'+crypto.randomUUID()+'.json'),JSON.stringify({original:record,checkedAt:new Date().toISOString(),metadata:{examPaperId:before.examPaperId,examState:before.examState,submitTime:before.submitTime,studentCode:before.studentCode}},null,2),{flag:'wx'});
   log('平台确认原练习未提交，逐题回查一致；仅恢复原卷一次：'+paperId);
   // A navigation failure remains protected. The next recovery must inspect the
   // server state again; it can never click merely because the previous timed out.
   await require('./navigation.cjs').openTarget(page,()=>require('./interaction.cjs').quietClick(page.getByText('提交作业',{exact:true})),url=>url.includes('/point/'+courseId+'/'));
   submitted=true;await inspect();
  }
  if(metadata.examState!==6||!metadata.submitTime)throw Error('平台没有明确交卷完成，保留保护并等待核对');
  const confirmed={examPaperId:metadata.examPaperId,examState:metadata.examState,submitTime:metadata.submitTime};
  const resultUrl=`https://ai-smart-course-student-pro.zhihuishu.com/point/${courseId}/${paperId}/${metadata.examTestId}/${pointId}/${u.searchParams.get('classId')}`;
  await page.goto(resultUrl,{waitUntil:'domcontentloaded',timeout:30000});let parsed,previous,stable=Date.now();const end=Date.now()+20000;
  while(Date.now()<end){const current=practice.parseResult(await page.locator('body').innerText(),record.results.length),key=JSON.stringify(current);if(key!==previous){previous=key;stable=Date.now();}if(current&&Date.now()-stable>=2000){parsed=current;break;}await page.waitForTimeout(300);}
  if(!parsed)throw Error('原卷成绩尚未确认，保留保护');
  const result={...parsed,url:resultUrl,at:new Date().toISOString()};
  await require('./analysis.cjs').collect(page.context(),{courseId,pointId,results:record.results,result,directory,log});
  if(fs.readFileSync(file,'utf8')!==original)throw Error('提交记录发生并发变化，保留保护');
  const updated={...record,status:'verified-result',result:{...result,analysisVerified:true},recovery:{at:new Date().toISOString(),submitted,confirmed}},temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(updated,null,2));fs.renameSync(temp,file);log('原卷提交结果已核验：'+result.correct+'/'+result.total+'；'+result.mastery+'%');return updated;
 }finally{page.off('response',capture);}
}
async function recoverAll(page,{directory,courseId,account,log=console.log}){
 const person=JSON.parse(fs.readFileSync(path.join(directory,'verified-identity.json'),'utf8'));if(person.studentId!==account||Date.now()-Date.parse(person.at)>600000)throw Error('恢复练习前必须重新核验身份');
 const folder=path.join(directory,'submissions');if(!fs.existsSync(folder))return [];
 const results=[];for(const name of fs.readdirSync(folder).filter(f=>f.startsWith(courseId+'-')&&f.endsWith('.json'))){const file=path.join(folder,name),record=JSON.parse(fs.readFileSync(file,'utf8'));if(record.status!=='reserved')continue;try{results.push(await recover(page,{file,directory,courseId,account,log}));}catch(error){log('原卷仍需核对，保护保留：'+name+'；'+error.message);results.push({protected:true,file:name,reason:error.message});}}
 return results;
}
module.exports={recover,recoverAll};
