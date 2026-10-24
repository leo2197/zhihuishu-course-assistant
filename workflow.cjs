const {newBackgroundPage,closeTaskPage}=require('./background.cjs');
const {Store}=require('./state.cjs'),{identity,runKnowledge}=require('./course.cjs'),discussions=require('./discussions.cjs'),{audit}=require('./audit.cjs'),{review}=require('./review.cjs');
function extractIdentity(text,expectedName){
 const ids=[...new Set([...text.matchAll(/学号\s*[：:]?\s*(\d+)/g)].map(m=>m[1]))];
 const name=text.match(/姓名\s*[：:]\s*([^\n]+)/)?.[1]?.trim()||(text.split(/\r?\n/).some(line=>line.trim()===expectedName)?expectedName:null);
 return {id:ids.length===1?ids[0]:null,name};
}
async function verifyIdentity(context,settings,store){
 const p=await newBackgroundPage(context);const login=await require('./login.cjs').prepare(p,settings,store);try{
  const url=new URL(settings.courseUrl);url.pathname=url.pathname.replace('/knowledgeStudy/','/gradeAnalysis/');await p.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});
  let announced=false,deadline=Date.now()+45000,lastSessionRefresh=0,accountPrefilled=false;
  for(;;){
   const current=new URL(p.url());
   if(current.hostname==='login.zhihuishu.com'){
    deadline=Date.now()+45000;
    if(await require('./gate.cjs').hasCaptcha(p))await require('./gate.cjs').waitForHuman(p);else await login.tick().catch(()=>{});
    if(!announced){announced=true;
     console.log('\x07'+login.notice());login.notifyInitial();store.save('connection-status',{status:'login-required',expectedAccount:settings.account,at:new Date().toISOString()});}
    if(context.refreshCourseSession&&Date.now()-lastSessionRefresh>10000){lastSessionRefresh=Date.now();await context.refreshCourseSession();await p.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});}
   }else if(announced&&current.hostname.endsWith('zhihuishu.com')&&current.pathname!==url.pathname){deadline=Date.now()+45000;await p.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});}
   else if(current.hostname===url.hostname&&current.pathname===url.pathname&&/学号\s*[：:]?\s*\d+/.test(await p.locator('body').innerText()))break;
   else if(Date.now()>deadline)throw Error('账号画像未完整加载，未执行学习或提交；请保留课程页核对');
   await p.waitForTimeout(2000);
  }
  const text=await p.locator('body').innerText(),{id,name}=extractIdentity(text,settings.expectedDisplayName);
  if(id!==settings.account||name!==settings.expectedDisplayName)throw Error('当前浏览器登录身份与脚本设置不一致，未执行学习或提交');
  login.commit(id);
  store.save('verified-identity',{studentId:id,name,at:new Date().toISOString(),source:p.url()});store.save('connection-status',{status:'identity-verified',account:id,at:new Date().toISOString()});return {studentId:id,name};
 }finally{await closeTaskPage(p);}
}
async function run(context,settings,{log=console.log}={}){
 const store=new Store(settings.account),course=identity(settings.courseUrl),stages=[];
 const progress=new (require('./progress.cjs').Progress)(store,log);progress.start();
 try{
 const person=await verifyIdentity(context,settings,store);require('./references.cjs').useCourseBank(store.directory,course.courseId);log('已核对课程账号：'+person.name+'，学号'+person.studentId);
 const {withTaskPage}=require('./task-scope.cjs'),{registerTaskPage}=require('./background.cjs');
 const rootPage=context.ocsTaskPage||await newBackgroundPage(context);
 await require('./recovery.cjs').recoverAll(rootPage,{directory:store.directory,courseId:course.courseId,account:settings.account,log});
 const execute=async(name,fn,page=rootPage)=>withTaskPage(context,page,async()=>{
  const lane=progress.lane(name);lane.point('开始');log('开始：'+name);const result={name,status:'running',startedAt:new Date().toISOString()};stages.push(result);store.save('run-state',{stages});
  try{await page.goto(settings.courseUrl,{waitUntil:'domcontentloaded',timeout:45000});result.result=await fn(page,lane);result.status='finished';}
  catch(error){result.status='blocked';result.reason=error.message;log(name+'保留待处理：'+error.message);}
  finally{result.finishedAt=new Date().toISOString();lane.point(result.status==='finished'?(result.result?.idleReason||'本轮处理结束'):'需核对：'+result.reason);store.save('run-state',{stages});}
 });
 const assessment=require('./assessment.cjs'),plan=await assessment.read(rootPage,settings.courseUrl);store.save('task-plan',plan);progress.state.required=plan.enabled;progress.save();for(const line of assessment.describe(plan))log('成绩要求｜'+line);for(const item of plan.manual)if(item.percent!==100)log('需人工/平台安排：'+item.title+'；'+item.weight);
 await execute('课程公告与其他要求',p=>require('./notices.cjs').collect(p,{entry:settings.courseUrl,store}));
 await rootPage.goto(settings.courseUrl,{waitUntil:'domcontentloaded',timeout:45000});await rootPage.locator('.item-content[knowledgeid]').first().waitFor({timeout:25000});
 const queue=new (require('./knowledge-queue.cjs').KnowledgeQueue)(await require('./course.cjs').inventory(rootPage),plan);
 const workers=Math.min(4,Math.max(1,Number(settings.knowledgeWorkers)||1),queue.pending.length),extra=[],tasks=[];
 try{
  for(let index=0;index<workers;index++){
   const page=index===0?rootPage:await registerTaskPage(context,await context.newPage());if(index>0)extra.push(page);
   tasks.push({name:'知识点任务'+(index+1),page,fn:(p,lane)=>runKnowledge(p,{store,log:m=>log('[知识点'+(index+1)+'] '+m),progress:lane,plan,queue,workerId:String(index+1),maxPracticeRounds:settings.maxPracticeRounds,uncertainStrategy:settings.uncertainPracticeStrategy||'review',review:q=>review(q,{store,log})})});
  }
  if(settings.autoPostDiscussions&&plan.enabled.discussions&&plan.items.some(g=>g.type==='discussions'&&g.decision==='required'&&g.percent!==100)){const page=await registerTaskPage(context,await context.newPage());extra.push(page);tasks.push({name:'课程评论',page,fn:async(p,lane)=>{
   await p.getByText('任务·作业·考试',{exact:true}).click();await p.waitForURL('**/taskAndExam/**',{waitUntil:'domcontentloaded',timeout:25000});
   return discussions.run(p,{account:settings.account,courseId:course.courseId,store,courseName:settings.courseName,log:m=>log('[评论] '+m),progress:lane});
  }});}
  if(!plan.enabled.discussions)log('评论未列入有效计分项或已免考，不自动发表');else if(plan.items.filter(g=>g.type==='discussions'&&g.decision==='required').every(g=>g.percent===100))log('评论成绩已完成，跳过');
  context.ocsTaskPage=rootPage;progress.stage('处理当前计分任务');
  await Promise.all(tasks.map(task=>execute(task.name,task.fn,task.page)));
 }finally{context.ocsTaskPage=rootPage;for(const page of extra)await page.close().catch(()=>{});}
 await execute('课程最终核验',p=>audit(p,{entry:settings.courseUrl,store}));
 const final=store.read('final-audit',null),complete=stages.every(s=>s.status==='finished')&&final?.complete===true;
 store.save('run-state',{stages,complete,finishedAt:new Date().toISOString()});log(complete?'平台核验全部成绩项已完成':'本轮处理结束，仍有未完成或未确认项；详细记录在 '+store.directory);
 progress.finish(complete);return {complete,stages};
 }finally{clearInterval(progress.timer);}
}
module.exports={verifyIdentity,run,extractIdentity};
