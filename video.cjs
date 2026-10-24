const {waitForHuman}=require('./gate.cjs');
// Selectors independently implemented from observed OCS 4.15.3 adapters.
function listTasks(){
 const exempt=e=>[e.innerText,...Array.from(e.querySelectorAll('*')).filter(n=>n.childElementCount===0).map(n=>n.textContent)].flatMap(text=>text.split(/\r?\n/)).some(line=>/^(?:(?:视频|学习资源|资源学习|视频学习)\s*[:：]?\s*)?(?:已?免考|免考通过|已?免修|已?免学|免学习)[。！!]?$/u.test(line.trim()));
 const legacy=[...document.querySelectorAll('.clearfix.video')];
 if(legacy.length)return legacy.map((e,index)=>({kind:'shared',index,title:e.querySelector('.catalogue_title')?.textContent.trim()||e.textContent.trim(),exempt:exempt(e),complete:!!e.querySelector('.time_icofinish'),active:e.classList.contains('current_play')}));
 const modern=[...document.querySelectorAll('.child-main')];
 if(modern.length)return modern.map((e,index)=>({kind:'new-shared',index,title:e.textContent.trim(),exempt:exempt(e),complete:!!e.querySelector('.isFinish'),active:e.classList.contains('active')}));
 const cards=[...document.querySelectorAll('[class*="card-container"]')];
 if(cards.length)return cards.map((e,index)=>({e,index})).filter(({e})=>e.querySelector('.icon-box.video')).map(({e,index})=>({kind:'smart',index,title:e.querySelector('.common-text')?.textContent.trim()||e.textContent.trim(),exempt:exempt(e),complete:/已完成|(?:^|\s)100%/.test(e.querySelector('.finished-icon')?.textContent.trim()||''),active:e.classList.contains('active')}));
 return [];
}
async function nextVideo(page){const tasks=await page.evaluate(listTasks);return tasks.find(t=>!t.complete&&!t.exempt)||null;}
async function play(page,task,{log=console.log,rate=1}={}){
 if(task.exempt){log('视频明确免考，跳过：'+task.title);return true;}
 const selector=task.kind==='shared'?'.clearfix.video':task.kind==='smart'?'[class*="card-container"]':'.child-main';
 await page.locator(selector).nth(task.index).click({timeout:5000});
 await page.locator('video').first().waitFor({state:'attached',timeout:25000});
 let previous=-1,stalled=0;
 for(;;){
  await waitForHuman(page,{log});
  const state=await page.evaluate(rate=>{const v=document.querySelector('video');if(!v)return null;v.muted=true;v.loop=false;v.playbackRate=rate;if(!v.ended&&v.paused)v.play().catch(()=>{});return {time:v.currentTime,duration:v.duration,ended:v.ended,src:v.currentSrc||v.src}},rate);
  if(!state)throw Error('播放器消失，保留未完成状态');
  if(state.ended){log('视频实际播放结束，等待平台完成标志');break;}
  log(`视频 ${task.title.slice(0,60)}：${state.time.toFixed(1)}/${Number.isFinite(state.duration)?state.duration.toFixed(1):'加载中'}秒`);
  stalled=Math.abs(state.time-previous)<0.1?stalled+1:0;previous=state.time;
  if(stalled>=40)throw Error('播放进度100秒未前进，停止当前任务而不伪造完成');
  await page.waitForTimeout(2500);
 }
 for(let i=0;i<15;i++){const now=(await page.evaluate(listTasks)).find(t=>t.kind===task.kind&&t.index===task.index&&t.title===task.title);if(now?.complete)return true;await page.waitForTimeout(1000);}
 throw Error('播放结束但平台未确认完成，保留当前任务等待核对');
}
module.exports={listTasks,nextVideo,play};
