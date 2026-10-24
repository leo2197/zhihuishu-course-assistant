const assert=require('assert/strict'),{auto,endpoint}=require('./provider-settings.cjs');
(async()=>{
 assert.equal(endpoint('https://open.bigmodel.cn/apikey/platform'),'https://open.bigmodel.cn/api/paas/v4/chat/completions');
 assert.throws(()=>endpoint('https://example.com/console'),/网页地址/);
 const calls=[],ok=()=>({ok:true,json:async()=>({choices:[{message:{content:'OK'}}]})});
 const fake=async(url,o)=>{if(url.endsWith('/models'))return {ok:false,status:404};calls.push(JSON.parse(o.body).model);return ok();};
 let result=await auto({url:'https://open.bigmodel.cn',key:'fixture'},{fetchFn:fake,log:()=>{}});
 assert.equal(result.answerModel,'glm-5.3-flash');assert.equal(result.judgeModel,'glm-5.3');assert.deepEqual(calls,['glm-5.3-flash','glm-5.3']);
 result=await auto({url:'https://example.com/v1',key:'fixture'},{fetchFn:async url=>url.endsWith('/models')?{ok:true,json:async()=>({data:[{id:'embedding-only'},{id:'deepseek-chat'}]})}:ok(),log:()=>{}});
 assert.equal(result.answerModel,'deepseek-chat');assert.equal(result.visionJudgeModel,'');
 await assert.rejects(()=>auto({url:'https://example.com/v1',key:'fixture'},{fetchFn:async()=>({ok:false,status:404}),log:()=>{}}),/高级/);
 await assert.rejects(()=>auto({url:'https://example.com/v1',key:'fixture'},{fetchFn:async()=>({ok:false,status:401}),log:()=>{}}),/API Key/);
 await assert.rejects(()=>auto({url:'https://open.bigmodel.cn',key:'fixture'},{fetchFn:async url=>url.endsWith('/models')?{ok:false,status:404}:{ok:false,status:402},log:()=>{}}),/余额/);
 console.log('PASS automatic GLM endpoint/model configuration, other providers, unknown vision, advanced fallback, invalid Key and billing failures');
})().catch(e=>{console.error(e);process.exitCode=1});
