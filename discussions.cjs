const {quietClick,writeEditable}=require('./interaction.cjs');
const {newBackgroundPage,closeTaskPage}=require('./background.cjs');
const fs=require('fs'),path=require('path');
const {generateComment}=require('./models.cjs'),{waitForHuman}=require('./gate.cjs'),{openTarget}=require('./navigation.cjs');
const norm=s=>String(s).replace(/\s+/g,'').replace(/网暴/g,'**');
async function postUnlocked(page,{account,title,courseId,store,courseName='所选课程',log=console.log,generate=generateComment}){
 const u=new URL(page.url()),parts=u.pathname.match(/^\/topicPage\/(\d+)\/(\d+)\/(\d+)$/);
 if(u.hostname!=='ai-smart-course-student-pro.zhihuishu.com'||!parts||parts[1]!==courseId)throw Error('讨论课程身份不匹配，未发送');
 await waitForHuman(page,{log});await page.getByText(title,{exact:true}).first().waitFor({timeout:20000});
 const prompt=(await page.locator('.desc-row .desc-text').innerText()).trim();if(!prompt)throw Error('没有真实讨论题面');
 const own=()=>page.locator('article').filter({hasText:new RegExp('学号\\s*'+account+'(?!\\d)')});
 await page.locator('article').first().waitFor({timeout:10000}).catch(()=>{});
 const key='discussion-'+courseId+'-'+parts[3],previous=store.read(key,null);
 if(await own().count()){store.save(key,{...previous,title,prompt,url:u.href,status:'verified-existing',at:new Date().toISOString()});log('已有本人回复，跳过：'+title);return;}
 if(previous&&['submitting','verified','verified-existing'].includes(previous.status))throw Error('存在已发送或状态不明记录，未重复发布：'+title);
 const text=previous?.prompt===prompt&&previous?.text?previous.text:await generate({title,prompt,courseName});
 store.save(key,{title,prompt,text,url:u.href,status:'draft',at:new Date().toISOString()});
 const editor=page.locator('#stemEditorMain[contenteditable=true]');
 if(!await editor.isVisible()){await quietClick(page.getByPlaceholder('请发表您的想法与见解...'));await editor.waitFor({state:'visible',timeout:5000});}
 await writeEditable(editor,text);if(norm(await editor.innerText())!==norm(text))throw Error('评论编辑器内容回查失败');
 const send=page.locator('.submit-btn:visible').filter({hasText:/^发送$/});if(await send.count()!==1)throw Error('发送按钮不唯一');
 store.save(key,{title,prompt,text,url:u.href,status:'submitting',at:new Date().toISOString()});
 await quietClick(send);
 await page.waitForFunction(({account,text})=>[...document.querySelectorAll('article')].some(e=>new RegExp('学号\\s*'+account+'(?!\\d)').test(e.innerText)&&e.innerText.replace(/\s+/g,'').replace(/网暴/g,'**').includes(text)),{account,text:norm(text)},{timeout:15000});
 const proof=await newBackgroundPage(page.context());
 try{await proof.goto(u.href,{waitUntil:'domcontentloaded',timeout:45000});await proof.waitForFunction(({account,text})=>[...document.querySelectorAll('article')].some(e=>new RegExp('学号\\s*'+account+'(?!\\d)').test(e.innerText)&&e.innerText.replace(/\s+/g,'').replace(/网暴/g,'**').includes(text)),{account,text:norm(text)},{timeout:20000});store.save(key+'-proof',{verifiedAt:new Date().toISOString(),url:proof.url(),account,title,text,matchingOwnReplies:await proof.locator('article').filter({hasText:new RegExp('学号\\s*'+account+'(?!\\d)')}).allInnerTexts()});}
 finally{await closeTaskPage(proof);}
 store.save(key,{title,prompt,text,url:u.href,status:'verified',at:new Date().toISOString()});log('评论已发布并在新页面核验：'+title);
}
async function post(page,options){
 const parts=new URL(page.url()).pathname.match(/^\/topicPage\/(\d+)\/(\d+)\/(\d+)$/);
 if(!parts)throw Error('讨论路由无法确认');
 const release=require('./task-lock.cjs').acquire(options.store.directory,'discussion-'+parts[1]+'-'+parts[3]);
 try{return await postUnlocked(page,options);}finally{release();}
}
async function run(page,options){
 const taskUrl=page.url();await page.locator('.topic-discussion-item').first().waitFor({timeout:20000});
 const titles=await page.locator('.topic-discussion-item .info .title').allTextContents();if(!titles.length||new Set(titles).size!==titles.length)throw Error('讨论任务列表不完整或标题重复');
 options.store.save('discussion-tasks',{url:taskUrl,titles});
 const completed=new Set();const cards=await page.locator('.topic-discussion-item').allTextContents();if(cards.length!==titles.length)throw Error('评论卡片与标题数量不一致，未猜测进度');cards.forEach((text,i)=>{if(text.includes('已回复')&&!text.includes('未回复'))completed.add(titles[i]);});options.progress?.discussions(completed.size,titles.length);
 for(const title of titles){
  options.progress?.point(title);
  const card=page.locator('.topic-discussion-item').filter({has:page.getByText(title,{exact:true})});if(await card.count()!==1)throw Error('讨论任务不唯一');
  const cardText=await card.innerText();if(cardText.includes('已回复')&&!cardText.includes('未回复')){options.log?.('平台已回复，跳过：'+title);continue;}
  const target=await openTarget(page,()=>quietClick(card.getByText('去讨论',{exact:true})),url=>url.includes('/topicPage/'+options.courseId+'/'));
  try{await post(target,{...options,title});completed.add(title);options.progress?.discussions(completed.size,titles.length);}finally{if(target!==page)await target.close();else{await page.goto(taskUrl,{waitUntil:'domcontentloaded'});await page.locator('.topic-discussion-item').first().waitFor();}}
 }
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('.topic-discussion-item').first().waitFor();
 const status=await page.locator('.topic-discussion-item').allTextContents();options.store.save('discussion-status-after',status);
 if(status.some(t=>t.includes('未回复')))throw Error('平台仍有未回复讨论，未认定完成');return {count:titles.length,verified:true};
}
module.exports={norm,post,run};
