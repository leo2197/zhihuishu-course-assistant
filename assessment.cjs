// Only explicit grade weights and exemption labels drive the task plan.
const labels={learning:/^(?:视频(?:学习|进度)?|资源学习|学习进度|知识点进度)$/,mastery:/^(?:知识点)?掌握度$/,discussions:/^(?:话题讨论|课程讨论|评论)$/,exam:/^(?:考试|期末考试|测验)$/,offline:/^(?:线下成绩|线下课|线下学习)$/};
function kind(title){const name=String(title||'').replace(/\s+/g,'');return Object.keys(labels).find(k=>labels[k].test(name))||'other';}
function weight(text){const match=String(text||'').match(/(?:占总成绩|占比|权重)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:分|%|％)/);return match?Number(match[1]):null;}
function exemptText(text){return /^(?:已?免考|免考通过|免修|已免修|免学|已免学|免学习)[。！!]?$/u.test(String(text||'').trim());}
function nodeExempt(node,part){
 if(node[part+'Exempt']===true)return true;
 const lines=String(node.text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 for(let i=0;i<lines.length;i++){
  const line=lines[i],labelled=line.match(/^(视频(?:学习|进度)?|资源学习|学习进度|知识点进度|知识点掌握度|掌握度)\s*[:：]?\s*(已?免考|免考通过|已?免修|已?免学|免学习)[。！!]?$/u);
  if(labelled&&kind(labelled[1])===part)return true;
  if(exemptText(line)){const previous=kind(lines[i-1]);if(!['learning','mastery'].includes(previous)||previous===part)return true;}
 }
 return false;
}
function needs(node,part,plan){
 if(plan?.enabled?.[part]===false||nodeExempt(node,part))return false;
 return part==='learning'?node.learning!==undefined&&Number(node.learning)!==100:node.mastery!==null&&node.mastery!==undefined&&node.mastery<100;
}
function plan(grades){
 const items=grades.map(g=>{const points=weight(g.weight),type=kind(g.title),exempt=g.exempt===true||String(g.text||'').split(/\r?\n/).some(exemptText);return {...g,type,points,exempt,decision:exempt?'skip-exempt':points===0?'skip-zero':points===null?'unknown':'required'};});
 const enabled={};for(const part of ['learning','mastery','discussions']){const matches=items.filter(g=>g.type===part);enabled[part]=matches.some(g=>g.decision==='required');}
 return {items,enabled,unknown:items.filter(g=>g.decision==='unknown'),manual:items.filter(g=>g.decision==='required'&&!['learning','mastery','discussions'].includes(g.type))};
}
async function read(page,entry){
 const url=new URL(entry);url.pathname=url.pathname.replace('/knowledgeStudy/','/gradeAnalysis/');await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});
 const tab=page.locator('.tab-item').filter({hasText:/^成绩分析$/});await tab.waitFor({state:'attached',timeout:20000});await tab.evaluate(e=>e.click());
 await page.locator('.score-progress').first().waitFor({timeout:25000});
 const grades=await page.locator('.score-progress').evaluateAll(es=>es.map(e=>({title:e.querySelector('.score-progress-title p')?.innerText.trim(),weight:e.querySelector('.score-weight')?.innerText,percent:e.querySelector('[role=progressbar]')?Number(e.querySelector('[role=progressbar]').getAttribute('aria-valuenow')):null,text:e.innerText})));
 if(!grades.length||grades.some(g=>!g.title))throw Error('成绩分析未完整加载，未按默认项目猜测执行');
 const result=plan(grades);return {...result,at:new Date().toISOString(),source:page.url(),platformText:await page.locator('body').innerText()};
}
function describe(plan){return plan.items.map(g=>g.title+'（'+(g.points===null?'占比未知':g.weight)+'）：'+({required:'计分，需核对完成', 'skip-exempt':'免考，跳过','skip-zero':'不计分，跳过',unknown:'无法确认，保留待核对'}[g.decision]));}
module.exports={kind,weight,nodeExempt,needs,plan,read,describe};
