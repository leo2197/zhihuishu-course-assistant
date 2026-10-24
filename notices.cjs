// Opening a notice is distinct from merely reading its preview in the list.
async function itemsOn(page){return page.locator('.notice-item').evaluateAll(es=>es.map(e=>({title:e.querySelector('.info .title')?.innerText.trim(),text:e.querySelector('.info .content')?.innerText.trim(),unread:!!e.querySelector('.unread-icon')})));}
async function collect(page,{entry,store,markRead=true,log=console.log}){
 const u=new URL(entry);u.pathname=u.pathname.replace('/knowledgeStudy/','/taskAndExam/');u.searchParams.set('taskType','4');
 await page.goto(u.href,{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('.notice-item').first().waitFor({timeout:25000});
 let items=await itemsOn(page);
 if(items.some(x=>!x.title||!x.text))throw Error('公告内容未完整载入');
 const reading=[];
 if(markRead)for(const item of items.filter(x=>x.unread)){
  let popup;
  try{
   const title=page.getByText(item.title,{exact:true}),card=page.locator('.notice-item').filter({has:title});
   if(await card.count()!==1)throw Error('公告入口不唯一');
   const popupPromise=page.waitForEvent('popup',{timeout:1500}).catch(()=>null);
   await card.click({timeout:8000,noWaitAfter:true});popup=await popupPromise;
   const detail=popup||page;await detail.waitForLoadState('domcontentloaded',{timeout:10000});await detail.waitForTimeout(1000);
   if(new URL(detail.url()).hostname!==u.hostname)throw Error('公告详情离开当前课程平台');
   const body=await detail.locator('body').innerText();
   if(!body.includes(item.title)||!body.includes(item.text.slice(0,30)))throw Error('公告详情内容未能核对');
   reading.push({title:item.title,openedAt:new Date().toISOString(),source:detail.url()});
  }catch(error){reading.push({title:item.title,error:error.message});log('公告保留待核对：'+item.title+'；'+error.message);}
  finally{if(popup)await popup.close().catch(()=>{});}
  await page.goto(u.href,{waitUntil:'domcontentloaded',timeout:30000});await page.locator('.notice-item').first().waitFor({timeout:20000});
 }
 if(markRead)items=await itemsOn(page);
 for(const proof of reading){const observed=items.filter(x=>x.title===proof.title);proof.platformRead=observed.length===1&&!observed[0].unread;}
 const requirements=items.flatMap(n=>n.text.split(/[。；\n]/).map(x=>x.trim()).filter(x=>/签到|论文|考试|线下|见面课/.test(x)).map(text=>({notice:n.title,text,status:'requires-platform-confirmation'})));
 const result={at:new Date().toISOString(),items,requirements,reading,unread:items.filter(x=>x.unread).map(x=>x.title)};store.save('course-notices',result);return result;
}
module.exports={collect,itemsOn};
