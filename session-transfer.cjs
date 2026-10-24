const fs=require('fs'),path=require('path'),{protect}=require('./login.cjs');
const sessionFile=(account)=>path.join(__dirname,'data',account,'restart-session.dpapi');
async function save(context,account){
 const storage=await context.storageState(),sessions={};
 for(const page of context.pages())if(/^https:\/\/[^/]*zhihuishu\.com\//.test(page.url())){
  const data=await page.evaluate(()=>({origin:location.origin,values:Object.entries(sessionStorage)}));sessions[data.origin]=data.values;
 }
 fs.writeFileSync(sessionFile(account),protect(JSON.stringify({account,at:Date.now(),storage,sessions})),{mode:0o600});
}
async function restore(context,account){
 const file=sessionFile(account);if(!fs.existsSync(file))return false;
 const state=JSON.parse(protect(fs.readFileSync(file,'utf8'),true));
 if(state.account!==account||Date.now()-state.at>1800000){fs.unlinkSync(file);return false;}
 await context.addCookies(state.storage.cookies);
 await context.addInitScript(({origins,sessions})=>{
  if(sessionStorage.getItem('__ocsRestartRestored'))return;
  const local=origins.find(s=>s.origin===location.origin);if(local)for(const item of local.localStorage)localStorage.setItem(item.name,item.value);
  for(const [key,value] of sessions[location.origin]||[])sessionStorage.setItem(key,value);
  sessionStorage.setItem('__ocsRestartRestored','1');
 },{origins:state.storage.origins,sessions:state.sessions});
 fs.unlinkSync(file);return true;
}
module.exports={save,restore};
