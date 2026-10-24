const fs=require('fs'),path=require('path');
const config=JSON.parse(fs.readFileSync(fs.existsSync(path.join(__dirname,'model-config.json'))?path.join(__dirname,'model-config.json'):path.join(__dirname,'examples/model-config.example.json'),'utf8'));
function provider(){return require('./provider-settings.cjs').load();}
function parse(content){const text=String(content).replace(/```(?:json)?/g,'').trim();const result=JSON.parse(text.match(/\{[\s\S]*\}/)?.[0]||text);if(!Array.isArray(result.answers)||!result.answers.every(x=>typeof x==='string')||!['submit','review'].includes(result.decision)||typeof result.reason!=='string'||!result.reason.trim())throw Error('模型返回格式不完整，不能自动提交');return result;}
async function ask({text,image,model,hasDiagram=false}){
 const p=provider(),content=[{type:'text',text:'核对题干与当前选项。返回JSON {"answers":["A"],"decision":"submit或review","reason":"简短核验依据"}。只有确定答案才返回submit；有歧义、未定义行为、无法看清或缺图则返回review，不能猜。不要机械照抄示例中的A。\n'+text+(hasDiagram&&!image?'\n此题依赖图片，但你未收到图片，必须返回review。':'')}];
 if(image)content.push({type:'image_url',image_url:{url:'data:image/png;base64,'+image}});
 const response=await require('./model-queue.cjs').request(p.url,{method:'POST',headers:{Authorization:'Bearer '+p.key,'Content-Type':'application/json'},timeoutMs:config.timeoutMs,body:JSON.stringify({model,...(new URL(p.url).hostname==='open.bigmodel.cn'?{thinking:{type:'enabled'},reasoning_effort:config.reasoningEffort}:{}),temperature:1,top_p:0.95,messages:[{role:'user',content}]})});
 if(!response.ok)throw Error('模型服务HTTP '+response.status);
 const result=await response.json();return {...parse(result.choices?.[0]?.message?.content),model};
}
async function solve(question,{askFn=ask}={}){
 if(question.hasDiagram&&!config.visionJudgeModel)return {answers:[],decision:'review',reason:'未确认可用图像模型，请在高级模型设置指定或人工核对此题',model:'manual-review'};
 console.log('主答模型 '+config.answerModel+'；最终裁决 '+(question.hasDiagram?config.visionJudgeModel:config.judgeModel));
 const heartbeat=setInterval(()=>console.log('模型仍在核验本题，尚未提交……'),15000);heartbeat.unref();
 try{
 const model=question.hasDiagram?config.visionJudgeModel:config.judgeModel;
 const [first,judged]=await Promise.allSettled([askFn({...question,model:config.answerModel}),askFn({...question,image:question.hasDiagram?question.image:undefined,model})]);
 let verdict;
 if(judged.status==='fulfilled')verdict=judged.value;
 else if(/HTTP (429|503)/.test(judged.reason?.message||''))verdict=await askFn({...question,image:question.hasDiagram?question.image:undefined,model});
 else throw judged.reason;
 // Final judge is authoritative only when it explicitly says it can decide.
 return {...verdict,firstAnswer:first.status==='fulfilled'?first.value.answers:undefined,model};
 }finally{clearInterval(heartbeat);}
}
async function generateComment({title,prompt,courseName='所选课程'}){
 const p=provider();const response=await require('./model-queue.cjs').request(p.url,{method:'POST',headers:{Authorization:'Bearer '+p.key,'Content-Type':'application/json'},timeoutMs:config.timeoutMs,body:JSON.stringify({model:config.judgeModel,...(new URL(p.url).hostname==='open.bigmodel.cn'?{thinking:{type:'enabled'},reasoning_effort:config.reasoningEffort}:{}),temperature:1,top_p:0.95,messages:[{role:'user',content:'为《'+courseName+'》的课程讨论写一条独立原创的中文观点，约180—300字，回应题目，给出理由和必要的限制。不引用其他同学回复，不编造个人经历、读书经历、视频观看记录或不存在的原文引文。不自称老师。只返回JSON {"text":"评论正文"}。\n讨论标题：'+title+'\n讨论题目：'+prompt}]})});
 if(!response.ok)throw Error('评论模型HTTP '+response.status);const data=await response.json(),raw=data.choices?.[0]?.message?.content;const out=JSON.parse(String(raw).match(/\{[\s\S]*\}/)?.[0]||'{}');
 if(typeof out.text!=='string'||out.text.trim().length<80||out.text.length>1000)throw Error('评论正文长度或格式不合格');return out.text.trim();
}
module.exports={config,parse,ask,solve,generateComment};
