const {newBackgroundPage}=require('./background.cjs');
const fs=require('fs'),path=require('path');
const {chromium}=require('./browser-runtime.cjs');
async function open(){
 const account=process.argv[process.argv.indexOf('--account')+1];
 const label=process.argv.includes('--account')&&/^\d+$/.test(account)?account:'default';
 fs.mkdirSync(path.join(__dirname,'logs'),{recursive:true});
 const context=await chromium.launchPersistentContext(path.join(__dirname,'profiles',label),{channel:'msedge',headless:false,viewport:null,args:['--start-maximized','--mute-audio','--remote-debugging-port=9236','--remote-debugging-address=127.0.0.1','--disable-background-timer-throttling']});
 const page=context.pages()[0]||await context.newPage();
 await page.goto('https://onlineweb.zhihuishu.com/onlinestuh5',{waitUntil:'domcontentloaded',timeout:45000});
 console.log('独立智慧树浏览器已打开，等待登录和课程页面；调试连接仅监听本机。');
 await new Promise(resolve=>context.on('close',resolve));
}
async function endpoints(){
 const ports=new Set([9222,9223]);
 const direct=[];
 const marker=path.join(process.env.LOCALAPPDATA,'Microsoft/Edge/User Data/DevToolsActivePort');
 if(fs.existsSync(marker)){const lines=fs.readFileSync(marker,'utf8').trim().split(/\r?\n/);const n=Number(lines[0]);if(Number.isInteger(n)&&n>0&&n<65536){ports.add(n);if(/^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(lines[1]))direct.push(`ws://127.0.0.1:${n}${lines[1]}`);}}
 const found=await Promise.all([...ports].map(async port=>{try{const r=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(800)});const v=await r.json();return v.webSocketDebuggerUrl||null;}catch{return null;}}));
 return [...new Set([...direct,...found.filter(Boolean)])];
}
async function runExisting(){
 console.log('智慧树独立脚本：连接现有浏览器，不启动OCS Desktop。\n若尚未开启连接，请在Edge打开edge://inspect/#remote-debugging，允许当前实例远程调试。验证码需本人完成。');
 for(;;){
 let browser,background,reconnect=false;
 for(;;){for(const endpoint of await endpoints()){try{console.log('等待Edge允许本机连接……');browser=await chromium.connectOverCDP(endpoint,{timeout:120000});break;}catch{console.log('连接尚未获准或已断开，继续等待现有Edge。');}}if(browser)break;await new Promise(r=>setTimeout(r,2000));}
 try{
  background=await require('./headless.cjs').createBackgroundContext(browser.contexts()[0]);
  const context=background.context;
  console.log('后台无窗口浏览器已启动；仅复用智慧树登录态，不保存登录凭据文件。');
  const pages=context.pages().filter(p=>/^https?:\/\/[^/]*zhihuishu\.com\//.test(p.url()));
  if(!pages.length){const p=await newBackgroundPage(context);await p.goto(require('./settings.json').courseUrl,{waitUntil:'domcontentloaded',timeout:45000});pages.push(p);}
  const target=pages.find(p=>p.url().includes('onlineweb.zhihuishu.com'))||pages[0];
  console.log('已连接智慧树现有会话：'+new URL(target.url()).hostname);
  const {waitForHuman}=require('./gate.cjs');await waitForHuman(target);
  const snapshot={at:new Date().toISOString(),url:target.url(),text:await target.locator('body').innerText(),links:await target.locator('a[href]').evaluateAll(es=>es.map(e=>({text:e.innerText.trim(),url:e.href})).filter(x=>x.text.includes('资治通鉴')))};
  fs.mkdirSync(path.join(__dirname,'logs'),{recursive:true});fs.writeFileSync(path.join(__dirname,'logs','connected-page.json'),JSON.stringify(snapshot,null,2));
  console.log('已保存当前课程页面结构。');
  if(process.argv.includes('--inspect-only'))await new Promise(resolve=>browser.on('disconnected',resolve));
  else if(process.argv.includes('--verify-only')){
   const settings=require('./settings.json'),store=new (require('./state.cjs').Store)(settings.account);
   await require('./workflow.cjs').verifyIdentity(context,settings,store);
   const p=await newBackgroundPage(context);try{const result=await require('./audit.cjs').audit(p,{entry:settings.courseUrl,store});console.log('真实浏览器只读验证完成：'+result.nodes.length+'个知识节点，'+result.grades.length+'个成绩项；没有作答或提交。');}finally{await p.close();}
  }else {const result=await require('./workflow.cjs').run(context,require('./settings.json'));if(!browser.isConnected())reconnect=true;else if(!result.complete)process.exitCode=2;}
 }catch(e){
  if(!browser.isConnected()||/Target page, context or browser has been closed|Browser closed|browser has been closed/i.test(e.message)){reconnect=true;console.log('浏览器连接中断，已保留任务记录，等待原Edge恢复。');}
  else throw e;
 }finally{if(background)await background.browser.close().catch(()=>{});await browser.close().catch(()=>{});}
 if(!reconnect)return;
 process.exitCode=0;console.log('等待重连；恢复后重新核对平台进度，不清除任何提交保护。');await new Promise(r=>setTimeout(r,2000));
 }
}
async function run(){
 if(process.argv.includes('--connect-existing'))return runExisting();
 const settings=require('./settings.json');
 if(settings.account&&!/^\d+$/.test(settings.account))throw Error('账号配置无效');
 const profile=settings.browserProfile||settings.account||'login-'+require('crypto').randomUUID();if(!/^[A-Za-z0-9_-]+$/.test(profile))throw Error('浏览器资料标识无效');if(!settings.account){settings.browserProfile=profile;fs.writeFileSync(path.join(__dirname,'settings.json'),JSON.stringify(settings,null,2));}
 console.log('自动打开专用Edge；浏览器和脚本窗口正常显示，课程跳转复用同一标签。');
 const context=await chromium.launchPersistentContext(path.join(__dirname,'profiles',profile),{channel:'msedge',headless:false,viewport:null,args:[...(settings.startMinimized?['--start-minimized']:[]),'--mute-audio','--disable-background-timer-throttling','--disable-renderer-backgrounding','--remote-debugging-port=9236','--remote-debugging-address=127.0.0.1']});
 try{if(settings.account&&await require('./session-transfer.cjs').restore(context,settings.account))console.log('已恢复本次安全切换前的加密登录会话。');}catch{console.log('切换会话未恢复，改用平台正常登录流程。');}
 context.ocsDesktopNotifications=true;context.ocsVerificationStatusFile=path.join(__dirname,'data',settings.account,'verification-status.json');
 const page=await require('./background.cjs').registerTaskPage(context,context.pages()[0]||await context.newPage());
 try{
  if(!settings.account){
   settings.discoverIdentity=true;
   const pendingStore={directory:path.join(__dirname,'work','pending-login'),save(){}};
   const helper=await require('./login.cjs').prepare(page,settings,pendingStore);
   console.log('首次使用：请在网页选择学校并登录，完成验证后回脚本输入课程序号；不用在控制台填写个人信息。');
   await require('./course-selection.cjs').select(page,settings,pendingStore,{saveSettings:()=>{}});
   await require('./web-login.cjs').discover(page,settings,helper);context.ocsVerificationStatusFile=path.join(__dirname,'data',settings.account,'verification-status.json');
  }
  if(!settings.courseUrl||process.argv.includes('--select-course-only')){
   const store=new (require('./state.cjs').Store)(settings.account);await require('./course-selection.cjs').select(page,settings,store);
   if(process.argv.includes('--select-course-only')){await require('./workflow.cjs').verifyIdentity(context,settings,store);await require('./session-transfer.cjs').save(context,settings.account);console.log('已记住此账号的课程。下次点击启动即可继续。');return;}
  }
  if(process.argv.includes('--login-only')){const store=new (require('./state.cjs').Store)(settings.account);await require('./workflow.cjs').verifyIdentity(context,settings,store);await require('./session-transfer.cjs').save(context,settings.account);console.log('网页登录和课程已记住。下次启动可继续，模型设置可在启动菜单调整。');return;}
  if(process.argv.includes('--verify-only')){
   const store=new (require('./state.cjs').Store)(settings.account);
   await require('./workflow.cjs').verifyIdentity(context,settings,store);
   await require('./audit.cjs').audit(page,{entry:settings.courseUrl,store});
   console.log('真实课程只读核验完成，没有提交。');
  }else if(process.argv.includes('--inspect-only'))await page.goto(settings.courseUrl,{waitUntil:'domcontentloaded'});
  else for(;;){
   let result;
   try{result=await require('./workflow.cjs').run(context,settings);}catch(error){
    if(page.isClosed())return;
    console.log('流程暂时异常，保留提交记录，60秒后重新核对：'+error.message);
    const store=new (require('./state.cjs').Store)(settings.account),last=store.read('progress',{});store.save('progress',{...last,status:'retrying',stage:'等待重试：'+error.message,updatedAt:new Date().toISOString()});
    for(let tick=0;tick<60;tick++){if(page.isClosed())return;await page.waitForTimeout(1000);}continue;
   }
   if(result.complete)break;
   const audit=new (require('./state.cjs').Store)(settings.account).read('final-audit',null);
   const onlineRemaining=result.stages.some(stage=>stage.status==='blocked')||audit?.incompleteNodes?.length>0||(settings.autoPostDiscussions&&audit?.incomplete?.some(g=>g.type==='discussions'&&g.decision==='required'));
   if(!onlineRemaining){console.log('当前可自动处理的任务已核对结束；计分考试、线下或未知要求见成绩分析，不能据此认定整课完成。');break;}
   console.log('仍有在线任务：60秒后重新核对登录、原卷状态和课程目录，不删除提交保护。');
   for(let tick=0;tick<60;tick++){if(page.isClosed())return;await page.waitForTimeout(1000);}
  }

  console.log('本轮结束，浏览器保留可见。关闭课程浏览器后本窗口结束。');
  if(!page.isClosed())await new Promise(resolve=>context.once('close',resolve));
 }catch(error){process.exitCode=1;console.log('保留已有进度与提交保护：'+error.message);if(!page.isClosed())await new Promise(resolve=>context.once('close',resolve));}
 finally{await context.close().catch(()=>{});}
}
if(require.main===module)(process.argv.includes('--open-profile')?open():run()).catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={open,run,endpoints};
