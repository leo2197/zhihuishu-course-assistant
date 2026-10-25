const fs=require('fs'),path=require('path'),{protect}=require('./login.cjs');
const file=path.join(__dirname,'config','provider.dpapi');
function endpoint(value){
 const url=new URL(String(value).trim());
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('服务地址需要使用HTTPS，本机服务可使用HTTP');
 if(url.username||url.password||url.search||url.hash)throw Error('服务地址不能包含密码、查询参数或片段');
 if(url.hostname==='open.bigmodel.cn'&&(url.pathname==='/'||url.pathname.startsWith('/apikey')))url.pathname='/api/paas/v4';
 if(/\/(?:console|platform|apikey)(?:\/|$)/.test(url.pathname))throw Error('这是网页地址，请填写服务商的API接口地址');
 url.pathname=url.pathname.replace(/\/$/,'');
 if(!url.pathname.endsWith('/chat/completions'))url.pathname+='/chat/completions';
 return url.href;
}
function validateKey(value){
 if(typeof value!=='string'||!value.trim())throw Error('未填写API Key，请复制服务商的完整API密钥');
 const key=value.trim();
 if(/[^\x21-\x7e]/.test(key))throw Error('API Key含有中文、空格或不可见字符，无法发送请求。请重新复制完整API密钥，不要附带中文说明；这不是网络故障。');
 return key;
}
function load(source=file){
 if(fs.existsSync(source)){
  let value;try{value=JSON.parse(protect(fs.readFileSync(source,'utf8'),true));}catch{throw Error('模型设置无法解密，请打开设置重新配置');}
  if(!value.key||!value.url)throw Error('模型设置不完整，请打开设置');return {...value,key:validateKey(value.key),url:endpoint(value.url)};
 }
 const legacy=path.join(__dirname,'../uooc/config.txt');
 if(fs.existsSync(legacy)){
  const config={};for(const line of fs.readFileSync(legacy,'utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0&&!line.trim().startsWith('#'))config[line.slice(0,i).trim()]=line.slice(i+1).trim();}
  if(config.BASE_URL&&config.API_KEY)return {url:endpoint(config.BASE_URL),key:validateKey(config.API_KEY)};
 }
 throw Error('尚未配置模型：请双击“启动.cmd”菜单中的“模型设置与检测”，选择“模型设置”，填写服务地址、API Key和模型ID');
}
function networkHint(error){
 const code=error.cause?.code||error.code||'';
 if(/ENOTFOUND|EAI_AGAIN/.test(code))return '域名解析失败';
 if(/CERT|TLS|SSL|SELF_SIGNED/.test(code))return 'HTTPS证书校验失败，请检查系统时间或网络证书';
 if(/ECONNREFUSED/.test(code))return '连接被拒绝';
 if(/TIMEOUT|ETIMEDOUT/.test(code)||/timeout|abort/i.test(error.name+' '+error.message))return '连接超时';
 return '网络连接中断';
}
async function connect(fetchFn,url,options,{timeout,log=console.log,waitFn=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 for(let attempt=0;attempt<2;attempt++){
  try{return await fetchFn(url,{...options,signal:AbortSignal.timeout(timeout)});}
  catch(error){
   if(/UND_ERR_INVALID_ARG|ERR_INVALID_CHAR|ERR_INVALID_ARG/.test(error.cause?.code||error.code||''))throw Error('模型请求参数无效，请检查API地址及Key是否包含异常字符；未把它视为网络故障。');
   const transient=/fetch failed|timeout|abort|ECONN|ENOTFOUND|EAI_AGAIN/i.test(error.message+' '+error.name+' '+(error.cause?.code||error.code||''));
   if(!transient)throw error;
   if(attempt===0){log('模型接口连接暂时失败，正在自动重试（2/2）……');await waitFn(800);continue;}
   throw Error('无法连接模型服务：'+networkHint(error)+'。请检查API地址和网络，或按提示重试；这不代表Key无效。',{cause:error});
  }
 }
}
async function test(value,{fetchFn=fetch,log=console.log,waitFn}={}){
 value={...value,key:validateKey(value.key)};
 const url=endpoint(value.url),models=[...new Set([value.answerModel,value.judgeModel].filter(Boolean))];
 if(!value.key||models.length===0)throw Error('API Key、主答模型与裁决模型不能为空');
 for(const model of models){
  const response=await connect(fetchFn,url,{method:'POST',headers:{Authorization:'Bearer '+value.key,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:'Reply OK.'}],max_tokens:32})},{timeout:45000,log,waitFn});
  if(!response.ok)throw Error(response.status===401?'API Key无效或已失效':response.status===402?'模型服务提示余额不足':response.status===404?'接口地址或模型ID不存在':response.status===429?'模型服务限流，请稍后检测':'模型检测失败，HTTP '+response.status);
  const body=await response.json();if(!body.choices?.[0]?.message)throw Error('服务响应不兼容Chat Completions接口');
 }
 return true;
}
async function auto(value,{fetchFn=fetch,log=console.log,waitFn}={}){
 value={...value,key:validateKey(value.key)};
 const url=endpoint(value.url),official=new URL(url).hostname==='open.bigmodel.cn';let listed=[];
 try{const response=await connect(fetchFn,url.replace(/\/chat\/completions$/,'/models'),{headers:{Authorization:'Bearer '+value.key}},{timeout:15000,log,waitFn});if(response.status===401)throw Error('API Key无效或已失效');if(response.status===402)throw Error('模型服务提示余额不足');if(response.status===429)throw Error('模型服务限流，请稍后检测');if(response.ok){const data=await response.json();listed=(data.data||[]).filter(m=>typeof m.id==='string'&&!/embedding|rerank|whisper|tts|image-gen|dall-e/i.test(m.id));}}catch(error){if(/API Key|余额|限流|请求参数无效/.test(error.message))throw error;if(official){log('模型列表暂不可用，继续检测GLM官方已知模型；以实际调用结果为准。');}else if(/无法连接|fetch failed|timeout|abort|ENOTFOUND/i.test(error.message))throw error;}
 const find=id=>listed.find(m=>m.id.toLowerCase()===id),ids=listed.map(m=>m.id);
 const prefer=['glm-5.3-flash','glm-5.3','glm-5','glm-4.7','glm-4.6','deepseek-reasoner','deepseek-chat'];
 const primary=prefer.map(find).find(Boolean)||listed[0];
 const answerModel=primary?.id||(official?'glm-5.3-flash':null);
 if(!answerModel)throw Error('服务未提供可识别模型列表。请在模型设置中选择“高级”，自行填写模型ID；不需要更换服务商。');
 let judgeModel=find('glm-5.3')?.id||answerModel;
 if(official&&!listed.length)judgeModel='glm-5.3';
 let visionJudgeModel=listed.find(m=>m.id.toLowerCase()==='glm-5.3-flash'||m.input_modalities?.includes('image')||m.capabilities?.vision===true)?.id||(official&&!listed.length?'glm-5.3-flash':'');
 log('自动识别主答：'+answerModel+'；裁决：'+judgeModel+'；图像：'+(visionJudgeModel||'未确认，图片题交人工核对'));
 await test({...value,url,answerModel,judgeModel:answerModel},{fetchFn,log,waitFn});
 if(judgeModel!==answerModel){try{await test({...value,url,answerModel:judgeModel},{fetchFn,log,waitFn});}catch(error){if(/余额|限流|Key|超时|fetch failed|无法连接/.test(error.message))throw error;log('裁决模型不可用，使用已检测通过的主答模型裁决：'+answerModel);judgeModel=answerModel;}}
 return {answerModel,judgeModel,visionJudgeModel,reasoningEffort:'high',timeoutMs:90000,autoSubmit:true};
}
if(require.main===module){
 const pending=process.argv[process.argv.indexOf('--test-file')+1];
 (async()=>{const value=load(pending);console.log('检测可能产生少量调用费用，以服务商计费为准。');if(process.argv.includes('--auto')){const result=await auto(value),output=process.argv[process.argv.indexOf('--output')+1];fs.writeFileSync(output,JSON.stringify(result,null,2));}else await test(value);console.log('模型连接与权限检测通过。');})().catch(error=>{console.error(/timeout|abort|fetch failed/i.test(error.message)?'接口连接失败或超时，请检查API接口地址和网络；密钥管理网页不是API地址':error.message);process.exitCode=1;});
}
module.exports={file,endpoint,load,test,auto};
