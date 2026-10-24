const fs=require('fs'),path=require('path'),readline=require('readline/promises');
function supported(value){try{const u=new URL(value);return u.hostname==='ai-smart-course-student-pro.zhihuishu.com'&&/^\/singleCourse\/knowledgeStudy\/\d+\/\d+\/?$/.test(u.pathname);}catch{return false;}}
async function select(page,settings,store,{log=console.log,ask,saveSettings=value=>fs.writeFileSync(path.join(__dirname,'settings.json'),JSON.stringify(value,null,2))}={}){
 const login=await require('./login.cjs').prepare(page,settings,store,{log});
 log('【选择课程】浏览器已打开“我的学堂”。请登录后点击要学习的AI智课，再打开左侧“知识学习”；脚本会自动识别并记住这门课。');
 log('当前已验证的是AI智课课型。普通智慧课程或其他平台不会自动开始；也可粘贴AI智课学习页完整网址。');
 await page.goto('https://onlineweb.zhihuishu.com/onlinestuh5',{waitUntil:'domcontentloaded',timeout:45000});
 let busy=false,announced=false;
 const timer=setInterval(async()=>{if(busy||page.isClosed())return;busy=true;try{
  if(new URL(page.url()).hostname==='login.zhihuishu.com'){
   if(!announced){announced=true;log(login.notice());login.notifyInitial();}
   if(await require('./gate.cjs').hasCaptcha(page))await require('./gate.cjs').waitForHuman(page,{log});else await login.tick();
  }
 }catch{}finally{busy=false;}},1500);timer.unref();
 const controller=new AbortController(),rl=ask?null:readline.createInterface({input:process.stdin,output:process.stdout});
 const input=(async()=>{for(;;){const value=(await (ask?ask():rl.question('网页选课会自动继续；仅识别失败时粘贴知识学习页网址后回车：',{signal:controller.signal}))).trim();if(!supported(value)){log('这不是已支持的AI智课学习目录网址，请重新选择或粘贴。');continue;}await page.goto(value,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForURL(u=>supported(u.href),{timeout:0});return page.url();}})();
 const browser=page.waitForURL(u=>supported(u.href),{timeout:0,waitUntil:'domcontentloaded'}).then(()=>page.url());
 try{
  const url=await Promise.race([browser,input]);settings.courseUrl=url;
  const title=(await page.title()).trim();settings.courseName=title&&!/智慧树|AI智课/.test(title)?title:'所选课程';
  saveSettings(settings);
  store.save('account',{account:settings.account,school:settings.school||'',expectedDisplayName:settings.expectedDisplayName,courseUrl:url,courseName:settings.courseName,browserProfile:settings.browserProfile});
  log('课程已选择，接下来核对姓名和学号；核对通过前不会提交课程任务。');return url;
 }finally{clearInterval(timer);controller.abort();rl?.close();input.catch(()=>{});}
}
module.exports={select,supported};
