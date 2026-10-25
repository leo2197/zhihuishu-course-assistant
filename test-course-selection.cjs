const assert=require('assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const {chromium}=require('./browser-runtime.cjs'),{select,supported,collect,openCourse}=require('./course-selection.cjs'),{registerTaskPage}=require('./background.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ocs-course-picker-')),b=await chromium.launch({channel:'msedge',headless:true});
 try{
  assert.equal(supported('https://example.com/singleCourse/knowledgeStudy/1/2'),false);
  assert.equal(supported('https://ai-smart-course-student-pro.zhihuishu.com/point/1/2/3'),false);
  const c=await b.newContext(),p=await c.newPage();await registerTaskPage(c,p);
  await c.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<title>Fixture course</title><a target="_blank" href="https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/123/456">course</a>'}));
  let saved,meta;
  const selection=select(p,{account:'123',expectedDisplayName:'Fixture'},{directory:dir,save:(name,value)=>{meta=value}},{log:()=>{},ask:()=>new Promise(()=>{}),saveSettings:value=>saved={...value}});
  await p.waitForURL('**/onlinestuh5');await p.getByRole('link').click();await selection;
  assert.match(saved.courseUrl,/knowledgeStudy\/123\/456/);assert.equal(meta.account,'123');assert.equal(c.pages().length,1);
  const c2=await b.newContext(),p2=await c2.newPage();await registerTaskPage(c2,p2);
  const portal='https://onlineweb.zhihuishu.com/onlinestuh5',entry='https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/entry/234/567',study='https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/234/567';
  const card=(name,tag='AI智课',hidden=false)=>`<div class="hoverList" style="${hidden?'display:none':''}" onclick="window.open('${entry}','_blank')"><span class="${tag==='AI智课'?'tag-ai':'tag-other'}">${tag}</span><div class="courseName">${name}</div><div class="teacherName">Fixture Teacher</div><div class="semester">学期：Fixture term</div></div>`;
  assert.deepEqual(await collect({url:()=>portal,locator:()=>({evaluateAll:async()=>{throw Error('Execution context was destroyed, most likely because of a navigation');}})}),[],'Login redirect is a transient listing state');
  await assert.rejects(()=>collect({url:()=>portal,locator:()=>({evaluateAll:async()=>{throw Error('Unexpected fixture failure');}})}),/Unexpected fixture failure/);
  let portalLoads=0;
  await c2.route('**/*',route=>{const url=route.request().url();if(url===portal)portalLoads++;return route.fulfill({contentType:'text/html;charset=utf-8',body:url===portal?card('Fixture One')+card('Fixture Two')+card('Unsupported regular course','智慧课程')+card('Hidden AI course','AI智课',true):url===entry?`<div onclick="location.href='${study}'">知识学习</div>`:'<title>新形态课程</title><div>Knowledge contents</div>'});});
  const logs=[],answers=['99','R','2'];let numberSaved,numberMeta;
  await select(p2,{account:'456',expectedDisplayName:'Second',browserProfile:'fixture-profile'},{directory:dir,save:(name,value)=>{numberMeta=value}},{pollMs:20,log:m=>logs.push(m),ask:async()=>{assert(logs.some(x=>x.includes('1. Fixture One')));return answers.shift();},saveSettings:value=>numberSaved={...value}});
  assert.equal(numberSaved.courseUrl,study);assert.equal(numberSaved.courseName,'Fixture Two');assert.equal(numberMeta.browserProfile,'fixture-profile');assert(logs.some(x=>x.includes('没有这个课程序号')));assert(portalLoads>=2,'R refreshes portal');assert.equal(c2.pages().length,1,'Number choice and knowledge menu stay in same tab');assert(!logs.some(x=>x.startsWith('3.')),'Unsupported and hidden courses excluded');
  await p2.goto(portal);const listed=await collect(p2);assert.equal(listed.length,2);await p2.locator('.courseName').first().evaluate(e=>e.textContent='Changed course');await assert.rejects(()=>openCourse(p2,listed[0]),/课程列表已变化/);assert.equal(p2.url(),portal,'Stale choice must not navigate');
  console.log('PASS automatic AI course list and numbered selection, refresh/invalid number, knowledge menu navigation, stale-list guard, unsupported/hidden filtering, account metadata, browser fallback and no extra tabs');
 }finally{await b.close();assert(dir.startsWith(path.join(os.tmpdir(),'ocs-course-picker-')));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
