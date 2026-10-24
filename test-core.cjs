const assert=require('assert/strict');const {chromium}=require('./browser-runtime.cjs');
const {parse}=require('./models.cjs'),video=require('./video.cjs'),gate=require('./gate.cjs');
(async()=>{
 assert.throws(()=>parse('{"answers":["A"]}'));assert.equal(parse('{"answers":["A"],"decision":"review","reason":"不确定"}').decision,'review');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{const p=await browser.newPage();await p.setContent('<div class="clearfix video"><span class="catalogue_title">完成</span><i class="time_icofinish"></i></div><div class="clearfix video current_play"><span class="catalogue_title">未完成</span></div><div class="yidun_popup" style="display:none"></div>');
 assert.equal((await video.nextVideo(p)).title,'未完成');assert.equal(await gate.hasCaptcha(p),false);
 await p.locator('.yidun_popup').evaluate(e=>{e.style.display='block';e.textContent='验证';});assert.equal(await gate.hasCaptcha(p),true);
 let notices=0;setTimeout(()=>p.locator('.yidun_popup').evaluate(e=>e.remove()),60);
 assert.equal(await gate.waitForHuman(p,{log:()=>notices++,interval:20}),true);assert.equal(notices,2);
 await p.setContent('<div class="basic-info-video-card-container"><i class="icon-box video"></i><span class="common-text">完整</span><span class="finished-icon">100%</span></div><div class="basic-info-video-card-container"><i class="icon-box video"></i><span class="common-text">未完成</span><span class="finished-icon">99%</span></div>');
 assert.equal((await video.nextVideo(p)).title,'未完成');
 const fs=require('fs'),path=require('path'),os=require('os'),refs=require('./references.cjs');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ocs-reference-fixture-'));
 refs.useCourseBank(temp,'123');const entry={stem:'公开测试夹具',options:['对','错'],answers:['对']},bank={courseId:'123'};
 refs.rememberAnalysis({source:'https://ai-smart-course-student-pro.zhihuishu.com/examPreview/123/1/2/789/3',courseId:'123',pointId:'789',verifiedAt:new Date().toISOString(),questions:[{...entry,reference:'参考答案：对'}]});
 assert.deepEqual(refs.lookup({courseId:bank.courseId,stem:entry.stem,options:[...entry.options].reverse()}).answers,entry.answers);
 assert.equal(refs.lookup({courseId:bank.courseId,stem:entry.stem,options:[...entry.options,'不同选项']}),null);
 assert.equal(refs.lookup({courseId:'other',stem:'test',options:['A','B']}),null);
 assert.throws(()=>refs.rememberVerifiedPaper({courseId:bank.courseId,pointId:'123',results:[{stem:'不可缓存的错误答案',options:['对','错'],answers:['对']}],result:{url:'https://ai-smart-course-student-pro.zhihuishu.com/point/'+bank.courseId+'/1/2/123/249310',total:1,correct:0}}),/只有平台/);
 if(!temp.startsWith(path.join(os.tmpdir(),'ocs-reference-fixture-')))throw Error('Unsafe fixture directory');fs.rmSync(temp,{recursive:true,force:true});
 console.log('PASS model decision schema; real DOM completed video skipped; hidden captcha ignored; visible captcha pauses once and resumes');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
