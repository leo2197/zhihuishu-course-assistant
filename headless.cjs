const {chromium}=require('./browser-runtime.cjs');
const platform=url=>{try{const h=new URL(url).hostname;return h==='zhihuishu.com'||h.endsWith('.zhihuishu.com');}catch{return false;}};
async function captureSession(source){
 // Keep credentials in memory only, and only copy this course platform's data.
 const urls=['https://zhihuishu.com','https://onlineweb.zhihuishu.com','https://login.zhihuishu.com','https://ai-smart-course-student-pro.zhihuishu.com','https://studentexamcomh5.zhihuishu.com'];
 const cookies=await source.cookies(urls),origins=new Map(),sessions={};
 for(const page of source.pages().filter(p=>platform(p.url()))){
  const state=await page.evaluate(()=>({origin:location.origin,localStorage:Object.entries(localStorage).map(([name,value])=>({name,value})),sessionStorage:Object.entries(sessionStorage)}));
  origins.set(state.origin,{origin:state.origin,localStorage:state.localStorage});sessions[state.origin]=state.sessionStorage;
 }
 return {cookies,origins:[...origins.values()],sessions};
}
async function createBackgroundContext(source){
 const state=await captureSession(source);
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--mute-audio','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 try{
  const context=await browser.newContext({storageState:{cookies:state.cookies,origins:state.origins},viewport:{width:1280,height:800}});
  await context.addInitScript(states=>{const entries=states[location.origin];if(entries&&!sessionStorage.getItem('__ocsSessionInitialized')){for(const [key,value] of entries)sessionStorage.setItem(key,value);sessionStorage.setItem('__ocsSessionInitialized','1');}},state.sessions);
  context.refreshCourseSession=async()=>{
   const fresh=await captureSession(source);await context.addCookies(fresh.cookies);
   await context.addInitScript(({origins,sessions})=>{const state=origins.find(s=>s.origin===location.origin);if(state)for(const {name,value} of state.localStorage)localStorage.setItem(name,value);for(const [name,value] of sessions[location.origin]||[])sessionStorage.setItem(name,value);},fresh);
  };
  return {browser,context};
 }catch(error){await browser.close();throw error;}
}
module.exports={createBackgroundContext};
