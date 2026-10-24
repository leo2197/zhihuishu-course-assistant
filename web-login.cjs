const fs=require('fs'),path=require('path');
function extract(text){
 const lines=String(text).split(/\r?\n/).map(s=>s.trim()).filter(Boolean),ids=[...new Set([...text.matchAll(/学号\s*[：:]?\s*(\d+)/g)].map(m=>m[1]))];
 if(ids.length!==1)throw Error('网页账号标识无法唯一确认，请打开本人课程的成绩分析页');
 const index=lines.findIndex(line=>new RegExp('学号\\s*[：:]?\\s*'+ids[0]+'(?:\\D|$)').test(line));
 const explicit=String(text).match(/姓名\s*[：:]\s*([^\n]+)/)?.[1]?.trim(),name=explicit||lines[index-1];
 if(!name||name.length>40||name.length<2||/^(?:学号|班级|成绩分析|下载报告|姓名)$/.test(name)||/[<>]/.test(name))throw Error('网页姓名无法确认，请保留本人课程成绩分析页');
 return {account:ids[0],expectedDisplayName:name};
}
async function discover(page,settings,helper,{saveSettings=value=>fs.writeFileSync(path.join(__dirname,'settings.json'),JSON.stringify(value,null,2)),makeStore=account=>new (require('./state.cjs').Store)(account),log=console.log}={}){
 const url=new URL(settings.courseUrl);if(url.hostname!=='ai-smart-course-student-pro.zhihuishu.com'||!url.pathname.startsWith('/singleCourse/knowledgeStudy/'))throw Error('账号读取必须从支持的本人课程进入');url.pathname=url.pathname.replace('/knowledgeStudy/','/gradeAnalysis/');await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>/学号\s*[：:]?\s*\d+/.test(document.body.innerText),{},{timeout:45000});
 const person=extract(await page.locator('body').innerText()),store=makeStore(person.account);
 Object.assign(settings,person,{school:helper.school()||'',discoverIdentity:false});
 helper.adopt(person.account,store);helper.commit(person.account);
 store.save('account',{account:settings.account,school:settings.school,expectedDisplayName:settings.expectedDisplayName,courseUrl:settings.courseUrl,courseName:settings.courseName,browserProfile:settings.browserProfile});
 store.save('verified-identity',{studentId:settings.account,name:settings.expectedDisplayName,source:page.url(),at:new Date().toISOString()});saveSettings(settings);
 log('已从网页登录识别账号：'+settings.expectedDisplayName+'；学号'+settings.account+'。登录资料仅保存在本机。');return store;
}
module.exports={extract,discover};
