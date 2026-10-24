const fs=require('fs'),path=require('path');
const norm=s=>String(s).replace(/^\s*[A-H](?:[.、．]|\s*\n)\s*/,'').replace(/\s+/g,'');
let bank,bankMtime,bankFile=path.join(__dirname,'reference-bank.json');
function useCourseBank(directory,courseId){
 if(!/^\d+$/.test(courseId))throw Error('课程编号无效');
 bankFile=path.join(directory,'course-cache',courseId,'reference-bank.json');fs.mkdirSync(path.dirname(bankFile),{recursive:true});
 if(!fs.existsSync(bankFile)){let seed={courseId,entries:[]};const legacy=path.join(__dirname,'reference-bank.json');if(fs.existsSync(legacy)){const previous=JSON.parse(fs.readFileSync(legacy,'utf8'));if(previous.courseId===courseId)seed=previous;}fs.writeFileSync(bankFile,JSON.stringify(seed,null,2));}
 bank=null;bankMtime=null;
}
function readBank(){if(!fs.existsSync(bankFile))fs.writeFileSync(bankFile,JSON.stringify({courseId:'',entries:[]}));const file=bankFile,mtime=fs.statSync(file).mtimeMs;if(!bank||mtime!==bankMtime){bank=JSON.parse(fs.readFileSync(file,'utf8'));bankMtime=mtime;}return bank;}
function lookup({courseId,stem,options}){
 readBank();
 if(bank.courseId!==courseId)return null;
 const optionSet=options.map(norm).sort(),entries=bank.entries.filter(e=>norm(e.stem)===norm(stem)&&JSON.stringify(e.options.map(norm).sort())===JSON.stringify(optionSet));
 if(!entries.length)return null;
 const variants=new Set(entries.map(e=>JSON.stringify(e.answers.map(norm).sort())));if(variants.size!==1)return null;
 return {answers:entries[0].answers,decision:'submit',model:'platform-reference',reason:'同一课程平台已核验答案；题干及完整选项集合精确一致',source:entries[0].source};
}
function rememberVerifiedPaper({courseId,pointId,results,result}){
 if(result.analysisVerified!==true)throw Error('只有平台逐题解析核对完成后才能加入缓存');
 bank ||= JSON.parse(fs.readFileSync(bankFile,'utf8'));
 if(bank.courseId!==courseId)return 0;
 const u=new URL(result.url);
 if(u.hostname!=='ai-smart-course-student-pro.zhihuishu.com'||!u.pathname.startsWith('/point/'+courseId+'/')||!u.pathname.split('/').includes(pointId)||result.total!==results.length||result.total<1||result.correct!==result.total)throw Error('只有平台确认整卷全对的答案才能加入缓存');
 let added=0;
 for(const item of results){
  if(!item.stem||item.options.length<2||!item.answers.length||item.answers.some(a=>item.options.filter(o=>norm(o)===norm(a)).length!==1))throw Error('缓存答案无法映射到选项');
  const key=JSON.stringify([norm(item.stem),item.options.map(norm).sort(),item.answers.map(norm).sort()]);
  if(bank.entries.some(e=>JSON.stringify([norm(e.stem),e.options.map(norm).sort(),e.answers.map(norm).sort()])===key))continue;
  bank.entries.push({stem:item.stem,options:item.options,answers:item.answers,source:u.href,evidence:{total:result.total,correct:result.correct,verifiedAt:result.at}});added++;
 }
 if(added){const file=bankFile,tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(bank,null,2));fs.renameSync(tmp,file);}
 return added;
}
function rememberAnalysis({source,courseId,pointId,verifiedAt,questions}){
 readBank();const u=new URL(source),parts=u.pathname.split('/').filter(Boolean);
 if(bank.courseId!==courseId||u.hostname!=='ai-smart-course-student-pro.zhihuishu.com'||parts[0]!=='examPreview'||parts[1]!==courseId||parts[4]!==pointId||parts.length!==6||!questions.length)throw Error('逐题解析来源与课程不匹配');
 let added=0;const entries=[];
 for(const item of questions){
  if(item.hasDiagram)continue;
  if(!item.stem||item.options.length<2||!item.answers.length||!item.reference?.startsWith('参考答案')||item.answers.some(a=>item.options.filter(o=>norm(o)===norm(a)).length!==1))throw Error('平台解析答案无法映射到选项');
  const key=JSON.stringify([norm(item.stem),item.options.map(norm).sort(),item.answers.map(norm).sort()]);
  if(bank.entries.some(e=>JSON.stringify([norm(e.stem),e.options.map(norm).sort(),e.answers.map(norm).sort()])===key))continue;
  entries.push({stem:item.stem,options:item.options,answers:item.answers,source:u.href,evidence:{reference:item.reference,verifiedAt}});added++;
 }
 if(added){bank.entries.push(...entries);const file=bankFile,tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(bank,null,2));fs.renameSync(tmp,file);bankMtime=fs.statSync(file).mtimeMs;}
 return added;
}
function forgetPracticePoint(courseId,pointId){
 readBank();if(bank.courseId!==courseId)return;
 const entries=bank.entries.filter(e=>{if(!e.evidence)return true;try{const p=new URL(e.source).pathname.split('/').filter(Boolean);return !(p[1]===courseId&&p[4]===pointId);}catch{return true;}});
 if(entries.length===bank.entries.length)return;bank.entries=entries;const file=bankFile;fs.writeFileSync(file+'.tmp',JSON.stringify(bank,null,2));fs.renameSync(file+'.tmp',file);bankMtime=fs.statSync(file).mtimeMs;
}
module.exports={useCourseBank,norm,lookup,rememberVerifiedPaper,rememberAnalysis,forgetPracticePoint};
