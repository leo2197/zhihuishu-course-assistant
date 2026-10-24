const {taskPage}=require('./task-scope.cjs');
const managed=new WeakSet();
// A dedicated visible task tab is reused; other user tabs are never instrumented.
function sameTabNavigation(){
 if(window.__ocsSameTab)return;window.__ocsSameTab=true;
 const go=value=>{const u=new URL(String(value),location.href);if(!/^https?:$/.test(u.protocol)||!(u.hostname==='zhihuishu.com'||u.hostname.endsWith('.zhihuishu.com')))throw Error('课程跳转目标不属于智慧树');location.assign(u.href);};
 window.open=(url,target)=>{if(target&&['_top','_parent'].includes(target))throw Error('不支持跨框架跳转');if(url&&url!=='about:blank')go(url);const addr={set href(v){go(v);},assign:go,replace:go};return {closed:false,focus(){},close(){},get location(){return addr;},set location(v){go(v);}};};
 window.focus=()=>{};
 document.addEventListener('click',event=>{const a=event.target?.closest?.('a[target]');if(a&&a.target!=='_self')a.target='_self';},true);
 document.addEventListener('submit',event=>{if(event.target?.target)event.target.target='_self';},true);
}
async function registerTaskPage(context,page){context.ocsTaskPage=page;managed.add(page);await page.addInitScript(sameTabNavigation);await page.evaluate(sameTabNavigation);return page;}
async function newBackgroundPage(context){
 const page=taskPage(context);if(page){if(page.isClosed())throw Error('课程标签已关闭，保留进度后停止');return page;}
 return context.newPage();
}
async function closeTaskPage(page){if(page!==taskPage(page.context()))await page.close();}
module.exports={newBackgroundPage,closeTaskPage,registerTaskPage,isTaskPage:page=>managed.has(page)};
