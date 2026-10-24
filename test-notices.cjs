const assert=require('assert/strict'),{chromium}=require('./browser-runtime.cjs');
const {collect}=require('./notices.cjs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext(),page=await context.newPage();let opens=0;
  await context.route('**/*',route=>{
   const html=`<div class="notice-item" onclick="localStorage.setItem('notice-read','1')"><img class="unread-icon"><div class="info"><div class="title">课程公告</div><div class="content">课程论文另行通知；每天自动签到一次。</div></div></div><script>if(localStorage.getItem('notice-read'))document.querySelector('.unread-icon').remove();document.querySelector('.notice-item').addEventListener('click',()=>fetch('/opened'));</script>`;
   if(new URL(route.request().url()).pathname==='/opened'){opens++;return route.fulfill({body:'ok'});}
   return route.fulfill({contentType:'text/html; charset=utf-8',body:html});
  });
  let saved;const options={entry:'https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/123/456',store:{save:(k,v)=>saved=v},log:()=>{}};
  const first=await collect(page,{...options,markRead:false});assert.equal(first.unread.length,1);assert.equal(opens,0,'Read-only collection must not click notices');
  const second=await collect(page,options);assert.equal(opens,1);assert.equal(second.unread.length,0);assert.equal(saved.reading[0].platformRead,true);assert(second.requirements.every(r=>r.status==='requires-platform-confirmation'),'Reading notices must not claim attendance or coursework complete');
  await collect(page,options);assert.equal(opens,1,'Already-read notice needs no repeat opening');
  console.log('PASS visible notice opening, fresh-page read-state proof, read-only mode and external requirement separation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
