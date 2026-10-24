async function openTarget(page,action,match,{timeout=25000}={}){
 const context=page.context(),before=new Set(context.pages());await action();const until=Date.now()+timeout;
 while(Date.now()<until){
  for(const candidate of context.pages()){
   if(candidate!==page&&(before.has(candidate)||require('./background.cjs').isTaskPage(page)))continue;
   if(candidate!==page&&await candidate.opener()!==page)continue;
   if(match(candidate.url())){await candidate.waitForLoadState('domcontentloaded',{timeout:10000}).catch(()=>{});return candidate;}
  }
  await new Promise(r=>setTimeout(r,200));
 }
 throw Error('未确认页面跳转，未重复点击');
}
module.exports={openTarget};
