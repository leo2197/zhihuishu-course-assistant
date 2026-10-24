const fs=require('fs'),path=require('path');
const root=__dirname,lock=path.join(root,'runtime.json');
function check(){for(const f of ['runner.cjs','workflow.cjs','course.cjs','audit.cjs','assessment.cjs','recovery.cjs','discussions.cjs','models.cjs','mistakes.cjs','video.cjs','practice.cjs','gate.cjs','state.cjs','review.cjs','references.cjs','navigation.cjs','background.cjs','headless.cjs','progress.cjs','progress-format.cjs','login.cjs','task-scope.cjs','task-lock.cjs','interaction.cjs','knowledge-queue.cjs','provider-settings.cjs','model-queue.cjs','notify.cjs','course-selection.cjs','browser-runtime.cjs','session-transfer.cjs','examples/settings.example.json','examples/model-config.example.json'])if(!fs.existsSync(path.join(root,f)))throw Error('Missing '+f);for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.cjs'))){const text=fs.readFileSync(path.join(root,name),'utf8');for(const match of text.matchAll(/require\(['"](\.\/[^'"]+\.cjs)['"]\)/g))if(!fs.existsSync(path.resolve(root,match[1])))throw Error('Missing dependency '+match[1]+' (from '+name+')');}require('./browser-runtime.cjs');}
async function main(){check();if(process.argv.includes('--check')){console.log('独立智慧树脚本本地模块检查通过');return;}
if(!fs.existsSync(path.join(root,'settings.json')))throw Error('尚未完成首次设置，请双击“启动.cmd”。');
if(fs.existsSync(lock)){const old=JSON.parse(fs.readFileSync(lock,'utf8'));try{process.kill(old.pid,0);console.log('已有脚本窗口运行');return}catch(e){if(e.code!=='ESRCH')throw e;fs.renameSync(lock,lock+'.previous-'+Date.now())}}
fs.writeFileSync(lock,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}),{flag:'wx'});
fs.mkdirSync(path.join(root,'logs'),{recursive:true});
const logfile=path.join(root,'logs','run-'+new Date().toISOString().replace(/[:.]/g,'-')+'.log');
for(const stream of [process.stdout,process.stderr]){const write=stream.write.bind(stream);stream.write=(chunk,...args)=>{fs.appendFileSync(logfile,chunk);return write(chunk,...args);};}
console.log('实时日志：'+logfile);
process.on('exit',()=>{try{if(JSON.parse(fs.readFileSync(lock,'utf8')).pid===process.pid)fs.unlinkSync(lock)}catch{}});
await require('./runner.cjs').run();}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});module.exports={check};
