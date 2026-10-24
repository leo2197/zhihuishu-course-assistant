const fs=require('fs'),path=require('path'),{protect}=require('./login.cjs');
const file=path.join(__dirname,'config','provider.dpapi');
function endpoint(value){
 const url=new URL(String(value).trim());
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('服务地址需要使用HTTPS，本机服务可使用HTTP');
 if(url.username||url.password||url.search||url.hash)throw Error('服务地址不能包含密码、查询参数或片段');
 url.pathname=url.pathname.replace(/\/$/,'');
 if(!url.pathname.endsWith('/chat/completions'))url.pathname+='/chat/completions';
 return url.href;
}
function load(source=file){
 if(fs.existsSync(source)){
  let value;try{value=JSON.parse(protect(fs.readFileSync(source,'utf8'),true));}catch{throw Error('模型设置无法解密，请打开设置重新配置');}
  if(!value.key||!value.url)throw Error('模型设置不完整，请打开设置');return {...value,url:endpoint(value.url)};
 }
 const legacy=path.join(__dirname,'../uooc/config.txt');
 if(fs.existsSync(legacy)){
  const config={};for(const line of fs.readFileSync(legacy,'utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0&&!line.trim().startsWith('#'))config[line.slice(0,i).trim()]=line.slice(i+1).trim();}
  if(config.BASE_URL&&config.API_KEY)return {url:endpoint(config.BASE_URL),key:config.API_KEY};
 }
 throw Error('尚未配置模型：请双击“启动.cmd”菜单中的“模型设置与检测”，选择“模型设置”，填写服务地址、API Key和模型ID');
}
async function test(value,{fetchFn=fetch}={}){
 const url=endpoint(value.url),models=[...new Set([value.answerModel,value.judgeModel].filter(Boolean))];
 if(!value.key||models.length===0)throw Error('API Key、主答模型与裁决模型不能为空');
 for(const model of models){
  const response=await fetchFn(url,{method:'POST',headers:{Authorization:'Bearer '+value.key,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),body:JSON.stringify({model,messages:[{role:'user',content:'Reply OK.'}],max_tokens:32})});
  if(!response.ok)throw Error(response.status===401?'API Key无效或已失效':response.status===402?'模型服务提示余额不足':response.status===404?'接口地址或模型ID不存在':response.status===429?'模型服务限流，请稍后检测':'模型检测失败，HTTP '+response.status);
  const body=await response.json();if(!body.choices?.[0]?.message)throw Error('服务响应不兼容Chat Completions接口');
 }
 return true;
}
if(require.main===module){
 const pending=process.argv[process.argv.indexOf('--test-file')+1];
 (async()=>{const value=load(pending);console.log('正在检测主答与裁决模型，检测可能产生少量调用费用……');await test(value);console.log('模型连接与权限检测通过。');})().catch(error=>{console.error(/timeout|abort/i.test(error.message)?'检测超时，请检查服务地址和网络后重试':error.message);process.exitCode=1;});
}
module.exports={file,endpoint,load,test};
