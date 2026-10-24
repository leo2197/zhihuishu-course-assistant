const fs=require('fs'),path=require('path');
async function hasCaptcha(page){
 for(const frame of page.frames()){
  for(const selector of ['.yidun_popup','.yidun_modal__wrap','.geetest_panel']){
   if(await frame.locator(selector).filter({visible:true}).first().isVisible().catch(()=>false))return true;
  }
  if(await frame.getByText('向右拖动滑块填充拼图',{exact:true}).first().isVisible().catch(()=>false))return true;
 }
 return false;
}
async function waitForHuman(page,{log=console.log,statusFile=page.context().ocsVerificationStatusFile,interval=1000}={}){
 let notified=false,lastReminder=0;
 while(!page.isClosed()&&await hasCaptcha(page)){
  if(!notified){notified=true;log('\x07【需要本人完成安全验证】请从任务栏打开智慧树专用Edge，在当前课程标签完成滑块、短信或其他验证。任务和提交记录已保留，验证后自动核对并继续；无需重启脚本。');lastReminder=Date.now();if(page.context().ocsDesktopNotifications)require('./notify.cjs').notify('需要本人完成安全验证','请打开智慧树专用Edge，在课程标签完成滑块、短信等验证。任务已保留，验证后自动核对并继续。');if(statusFile){fs.mkdirSync(path.dirname(statusFile),{recursive:true});fs.writeFileSync(statusFile,JSON.stringify({status:'needs-human-verification',at:new Date().toISOString()}));}}
  if(Date.now()-lastReminder>=60000){lastReminder=Date.now();log('【仍在等待本人验证】请打开专用Edge完成安全验证，当前任务没有重复提交。');}
  await page.waitForTimeout(interval);
 }
 if(page.isClosed())throw Error('浏览器页面已关闭，未把它视作验证成功');
 if(notified){log('安全验证弹窗已消失，继续核对登录/任务状态');if(statusFile)fs.writeFileSync(statusFile,JSON.stringify({status:'checking-after-verification',at:new Date().toISOString()}));}
 return notified;
}
module.exports={hasCaptcha,waitForHuman};
