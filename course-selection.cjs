const fs=require('fs'),path=require('path'),readline=require('readline/promises');
const {quietClick}=require('./interaction.cjs');
function supported(value){try{const u=new URL(value);return u.hostname==='ai-smart-course-student-pro.zhihuishu.com'&&/^\/singleCourse\/knowledgeStudy\/\d+\/\d+\/?$/.test(u.pathname);}catch{return false;}}
function portal(value){try{const u=new URL(value);return u.hostname==='onlineweb.zhihuishu.com'&&u.pathname==='/onlinestuh5';}catch{return false;}}
async function collect(page){
 if(!portal(page.url()))return [];
 try{
  const cards=await page.locator('.ai-course-card-item').evaluateAll(cards=>cards.flatMap((card,index)=>{
   const kind=card.querySelector('.course-tag')?.textContent.trim()||'';
   if(!card.getClientRects().length||getComputedStyle(card).visibility==='hidden'||!kind.startsWith('智慧课程'))return [];
   const name=card.querySelector('.courseName')?.textContent.trim(),teacher=(card.querySelector('.courseTeacher')?.textContent||'').replace(/\s+/g,' ').trim(),url=(card.querySelector('a.study-btn')||card.querySelector('.courseName[href]'))?.href;
   if(!name||!url)return [];
   const progress=card.querySelector('.processNum')?.textContent.trim()||'';
   return [{index,name,teacher,kind,url,progress,signature:JSON.stringify([name,teacher,kind,url])}];
  }));
  return cards.filter(c=>supported(c.url));
 }catch(error){if(/Execution context was destroyed|Cannot find context with specified id|most likely because of a navigation/i.test(error.message))return [];throw error;}
}
async function openCourse(page,item,{timeoutMs=45000,pollMs=500,log=console.log}={}){
 const current=(await collect(page)).find(c=>c.index===item.index);
 if(!current||current.signature!==item.signature)throw Error('课程列表已变化，请输入R刷新后重新选择，未打开其他课程。');
 const card=page.locator('.ai-course-card-item').nth(item.index),button=card.locator('a.study-btn');
 await quietClick(await button.count()===1?button:card.locator('.courseName[href]'));
 let deadline=Date.now()+timeoutMs,menuClicked=false;
 while(!page.isClosed()){
  if(supported(page.url()))return page.url();
  if(await require('./gate.cjs').hasCaptcha(page)){await require('./gate.cjs').waitForHuman(page,{log});deadline=Date.now()+timeoutMs;}
  const u=new URL(page.url());
  if(u.hostname==='ai-smart-course-student-pro.zhihuishu.com'&&!menuClicked){
   const menu=page.getByText('知识学习',{exact:true});
   if(await menu.count()===1&&await menu.isVisible()){await quietClick(menu);menuClicked=true;}
  }
  if(Date.now()>deadline)throw Error('课程入口尚未进入知识学习页，可输入R刷新，或在网页打开知识学习。');
  await page.waitForTimeout(pollMs);
 }
 throw Error('课程浏览器已关闭，未开始学习任务。');
}
async function select(page,settings,store,{log=console.log,ask,listWaitMs=15000,pollMs=500,saveSettings=value=>fs.writeFileSync(path.join(__dirname,'settings.json'),JSON.stringify(value,null,2))}={}){
 const login=await require('./login.cjs').prepare(page,settings,store,{log});
 log('【选择课程】请先在专用Edge完成本人登录和安全验证。登录后自动读取“智慧课程”区域，在本窗口列出编号；输入编号即可开始。');
 log('也可在网页直接进入课程知识学习。未识别的课型不会自动开始，学习页网址仅作备用。');
 await page.goto('https://onlineweb.zhihuishu.com/onlinestuh5',{waitUntil:'domcontentloaded',timeout:45000});
 let busy=false,announced=false,stopped=false,selectedName='';
 const timer=setInterval(async()=>{if(busy||stopped||page.isClosed())return;busy=true;try{
  if(new URL(page.url()).hostname==='login.zhihuishu.com'){
   if(!announced){announced=true;log(login.notice());login.notifyInitial();}
   if(await require('./gate.cjs').hasCaptcha(page))await require('./gate.cjs').waitForHuman(page,{log});else await login.tick();
  }
 }catch{}finally{busy=false;}},1500);timer.unref();
 const controller=new AbortController(),rl=ask?null:readline.createInterface({input:process.stdin,output:process.stdout});
 const read=prompt=>ask?ask(prompt):rl.question(prompt,{signal:controller.signal});
 async function waitForList(){
  let deadline=Date.now()+listWaitMs;
  while(!stopped&&!page.isClosed()){
   if(supported(page.url()))return [];
   if(!portal(page.url()))deadline=Date.now()+listWaitMs;
   const courses=await collect(page);if(courses.length)return courses;
   if(portal(page.url())&&Date.now()>=deadline)return [];
   await page.waitForTimeout(pollMs);
  }
  return [];
 }
 function show(courses){
  if(courses.length){
   log('\n已识别 '+courses.length+' 门智慧课程，请输入编号：');
   courses.forEach((c,i)=>log((i+1)+'. '+c.name+(c.teacher?' ｜ '+c.teacher:'')+(c.progress?' ｜ 页面学习进度 '+c.progress:'')));
   log('这里只列智慧课程，不列前面的AI智课。页面学习进度100%仍会列出，掌握度、计分和免考情况进入后按成绩分析核对。');
  }else log('暂未识别到可自动处理的智慧课程。可输入R刷新，或在网页打开目标课程的知识学习页。');
 }
 const input=(async()=>{
  let courses=await waitForList();if(stopped)return;show(courses);
  for(;;){
   const value=String(await read('课程序号（R刷新；也可粘贴知识学习页网址）：')).trim();
   if(/^r$/i.test(value)){
    if(portal(page.url()))await page.reload({waitUntil:'domcontentloaded',timeout:45000});else await page.goto('https://onlineweb.zhihuishu.com/onlinestuh5',{waitUntil:'domcontentloaded',timeout:45000});
    courses=await waitForList();if(stopped)return;show(courses);continue;
   }
   if(/^\d+$/.test(value)){
    const index=Number(value)-1;if(!Number.isSafeInteger(index)||index<0||index>=courses.length){log('没有这个课程序号，请按上方列表选择，或输入R刷新。');continue;}
    const chosen=courses[index];selectedName=chosen.name;log('已选择：'+chosen.name+'；正在打开知识学习……');
    try{await openCourse(page,chosen,{pollMs,log});selectedName=chosen.name;return page.url();}catch(error){selectedName='';if(stopped)return;log(error.message);continue;}
   }
   if(!supported(value)){log('请输入上方课程序号、R，或已支持的智慧课程知识学习页网址。');continue;}
   await page.goto(value,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForURL(u=>supported(u.href),{timeout:0});return page.url();
  }
 })();
 const browser=page.waitForURL(u=>supported(u.href),{timeout:0,waitUntil:'domcontentloaded'}).then(()=>page.url());
 try{
  const url=await Promise.race([browser,input]);settings.courseUrl=url;
  const title=(await page.title()).trim();settings.courseName=selectedName||(title&&!/智慧树|AI智课|新形态课程/.test(title)?title:'所选课程');
  saveSettings(settings);
  store.save('account',{account:settings.account,school:settings.school||'',expectedDisplayName:settings.expectedDisplayName,courseUrl:url,courseName:settings.courseName,browserProfile:settings.browserProfile});
  log('课程已选择，接下来核对姓名和学号；核对通过前不会提交课程任务。');return url;
 }finally{stopped=true;clearInterval(timer);controller.abort();rl?.close();input.catch(()=>{});}
}
module.exports={select,supported,collect,openCourse};
