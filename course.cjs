const {waitForHuman}=require('./gate.cjs'),video=require('./video.cjs'),practice=require('./practice.cjs');
const {openTarget}=require('./navigation.cjs'),assessment=require('./assessment.cjs');
function identity(url){const u=new URL(url),m=u.pathname.match(/^\/singleCourse\/knowledgeStudy\/(\d+)\/(\d+)/);if(u.hostname!=='ai-smart-course-student-pro.zhihuishu.com'||!m)throw Error('当前不是已支持的智慧树知识学习课程入口');return {origin:u.origin,courseId:m[1],classId:m[2],mapUid:u.searchParams.get('mapUid')};}
async function inventory(page){return page.locator('.item-content[knowledgeid]').evaluateAll(es=>es.map(e=>({id:e.getAttribute('knowledgeid'),title:e.querySelector('.item-title')?.innerText.trim(),mastery:e.querySelector('[role=progressbar]')?Number(e.querySelector('[role=progressbar]').getAttribute('aria-valuenow')):null,learning:e.innerText.match(/学习进度\s*(\d+(?:\.\d+)?)%/)?.[1],text:e.innerText})));}
async function openPoint(page,course,node){const u=new URL(`${course.origin}/learnPage/${course.courseId}/${node.id}/${course.classId}`);if(course.mapUid)u.searchParams.set('mapUid',course.mapUid);await page.goto(u.href,{waitUntil:'domcontentloaded',timeout:45000});await page.locator('.section-item-collapse-info.active .title-text').filter({hasText:node.title}).first().waitFor({timeout:45000});await waitForHuman(page);}
async function refreshNode(page,entry,node,progress){await page.goto(entry,{waitUntil:'domcontentloaded',timeout:45000});await page.locator('.item-content[knowledgeid]').first().waitFor({timeout:25000});const snapshot=await inventory(page);progress?.knowledge(snapshot);const current=snapshot.find(x=>x.id===node.id);if(!current)throw Error('刷新目录后知识点缺失，不能推断完成');Object.assign(node,current);return current;}
async function runKnowledge(page,{store,review,log=console.log,maxPracticeRounds=12,uncertainStrategy='review',progress,plan,shardIndex=0,shardCount=1,queue,workerId=String(shardIndex+1)}){
 const entry=page.url(),course=identity(entry);await page.locator('.item-content[knowledgeid]').first().waitFor({timeout:25000});
 const nodes=await inventory(page);if(!nodes.length||nodes.some(n=>!n.id||!n.title)||new Set(nodes.map(n=>n.id)).size!==nodes.length)throw Error('知识点目录不完整或有重复，不猜测完成状态');
 store.save('inventory',nodes);progress?.knowledge(nodes);const results=store.read('knowledge-results',{});
 // Complete missing media first, then work through the remaining practice nodes.
 const ordered=[...nodes].sort((a,b)=>Number(b.learning!==undefined&&b.learning!=='100')-Number(a.learning!==undefined&&a.learning!=='100'));
 for(let node;(node=queue?queue.take(workerId):ordered.shift());){
  if(!queue&&require('./task-scope.cjs').shard(node.id,shardCount)!==shardIndex)continue;
  if(queue)log('从共享队列领取：'+node.title);
  let release;try{release=require('./task-lock.cjs').acquire(store.directory,'knowledge-'+course.courseId+'-'+node.id);}catch(error){log('知识点由其他任务处理或锁待核对，跳过：'+node.title);queue?.release(node.id);continue;}
  try{
  progress?.point(node.title);
  if(assessment.nodeExempt(node,'learning')&&assessment.nodeExempt(node,'mastery')){results[node.id]={title:node.title,status:'exempt',exempt:true};store.save('knowledge-results',{...store.read('knowledge-results',{}),[node.id]:results[node.id]});log('平台明确免考，跳过：'+node.title);continue;}
  if(node.mastery===null&&node.learning===undefined){results[node.id]={title:node.title,status:'no-required-tracking',reason:'平台没有列出该节点学习进度或掌握度要求，交由课程总核验确认'};continue;}
  try{
  await refreshNode(page,entry,node,progress);
  if(!assessment.needs(node,'learning',plan)&&!assessment.needs(node,'mastery',plan)){if(node.mastery===100)require('./mistakes.cjs').finishPoint({directory:store.directory,...course,pointId:node.id,mastery:100,source:entry});log('该节点计分任务已完成、免考或不计分，跳过：'+node.title);continue;}
  const recovered=practice.verifiedFullCorrect(store.directory,course.courseId,node.id);
  if(recovered&&(!results[node.id]?.total||Date.parse(recovered.at)>Date.parse(results[node.id].at||0))){results[node.id]={title:node.title,...recovered};store.save('knowledge-results',{...store.read('knowledge-results',{}),[node.id]:results[node.id]});}
  const saved=results[node.id];
  // A perfect paper alone is not completion: the platform mastery must be 100.
  log('核对知识点：'+node.title);await openPoint(page,course,node);
  if(assessment.needs(node,'learning',plan)){
   const resources=page.getByText('切换学习资源',{exact:true});
   if(await resources.count()){await resources.click();await page.locator('[class*="card-container"]').first().waitFor({state:'visible',timeout:25000});}
   let task;while(task=await video.nextVideo(page)){await video.play(page,task,{log});}
   // The platform's node progress, not clicking a link, is the completion evidence.
  }
  if(assessment.needs(node,'mastery',plan)){
   for(let round=0;round<maxPracticeRounds;round++){
    const owned=new Set();
    try{
    await openPoint(page,course,node);const historyPage=await openTarget(page,()=>page.getByRole('button',{name:'去提升',exact:true}).click({timeout:15000}),url=>url.includes('/masteryHistory/'));
    if(historyPage!==page)owned.add(historyPage);
    await historyPage.locator('.history-item').first().waitFor({timeout:8000}).catch(()=>{});const history=await historyPage.locator('.history-item').evaluateAll(es=>es.map(e=>({mastery:Number(e.querySelector('.history-item-mastery')?.innerText.match(/(\d+(?:\.\d+)?)%/)?.[1])})));
    // Retakes only through a platform-provided practice control. Formal exams
    // never enter this route, and an ambiguous prior attempt stays reserved.
    const start=historyPage.getByText('去提升 →',{exact:true});if(await start.count()!==1)throw Error('没有唯一的掌握度练习入口，等待核对');
    const examPage=await openTarget(historyPage,()=>start.click({timeout:5000}),url=>url.includes('/studentReviewTestOrExam/'));
    if(examPage!==page)owned.add(examPage);
    const result=await practice.paper(examPage,{...course,pointId:node.id,attemptNumber:history.length+1,directory:store.directory,log,review,uncertainStrategy,onOwnedPage:p=>{if(p!==page)owned.add(p);}});
    if(!result.exempt){const current=await refreshNode(page,entry,node,progress);result.paperMastery=result.mastery;result.mastery=current.mastery;log('目录实时掌握度：'+current.mastery+'%');}
    results[node.id]={title:node.title,...result};store.save('knowledge-results',{...store.read('knowledge-results',{}),[node.id]:results[node.id]});if(result.mastery===100){require('./mistakes.cjs').finishPoint({directory:store.directory,...course,pointId:node.id,mastery:100,source:entry});log('掌握度100%，已清理该知识点临时题库');}if(result.exempt||result.mastery===100)break;
    }finally{for(const extra of owned)await extra.close().catch(()=>{});}
   }
  }
  if(node.mastery!==null&&node.mastery<100)log('本知识点本轮练习已结束，目录掌握度仍为'+node.mastery+'%；轮数上限为'+maxPracticeRounds+'，保留记录供后续继续');
  store.save('knowledge-results',{...store.read('knowledge-results',{}),[node.id]:results[node.id]});
  }catch(error){if(page.isClosed())throw error;results[node.id]={...results[node.id],title:node.title,status:'blocked',reason:error.message,at:new Date().toISOString()};store.save('knowledge-results',{...store.read('knowledge-results',{}),[node.id]:results[node.id]});log('当前知识点需核对，保留状态后继续其他节点：'+node.title+'；'+error.message);}
  }finally{release();queue?.release(node.id);}
 }
 await page.goto(entry,{waitUntil:'domcontentloaded'});await page.locator('.item-content[knowledgeid]').first().waitFor({timeout:20000});const final=await inventory(page);store.save('inventory-after',final);progress?.knowledge(final);
 const unconfirmed=final.filter(n=>assessment.needs(n,'learning',plan)||assessment.needs(n,'mastery',plan));
 const idleReason=queue&&queue.running.size?'空闲：队列已领完，'+queue.running.size+'个知识点正在其他窗口处理；同一测验不能重复领取':unconfirmed.length?'本轮结束：仍有'+unconfirmed.length+'个知识点未完成，请查看提交保护或练习轮数提示':'本轮知识点已核对完成';
 log(idleReason);
 return {idleReason,course,nodes:final,unconfirmed};
}
module.exports={identity,inventory,openPoint,runKnowledge};
