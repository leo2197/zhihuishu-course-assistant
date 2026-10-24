const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const root=__dirname;
const files=[
 'analysis.cjs','assessment.cjs','audit.cjs','background.cjs','browser-runtime.cjs','console.cjs','course.cjs','course-selection.cjs','discussions.cjs','gate.cjs','headless.cjs','interaction.cjs','knowledge-queue.cjs','login.cjs','mistakes.cjs','models.cjs','model-queue.cjs','navigation.cjs','notices.cjs','notify.cjs','practice-choice.cjs','practice.cjs','progress-format.cjs','progress.cjs','provider-settings.cjs','references.cjs','recovery.cjs','review.cjs','runner.cjs','session-transfer.cjs','state.cjs','task-lock.cjs','task-scope.cjs','video.cjs','workflow.cjs',
 'launch.ps1','open-console.ps1','console-mode.ps1','notify.ps1','setup-common.ps1','setup-models.ps1','settings.ps1',
 '启动.cmd','设置.cmd','选择课程.cmd','切换账号.cmd','README.md','FAQ.md','先看这里.txt','LICENSE','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','.gitignore','.gitattributes','build-public.cjs',
 'examples/settings.example.json','examples/model-config.example.json','.github/workflows/check.yml','.github/ISSUE_TEMPLATE/bug_report.yml',
 'test-analysis.cjs','test-assessment.cjs','test-background.cjs','test-core.cjs','test-discussions.cjs','test-login.cjs','test-notices.cjs','test-paper.cjs','test-parallel.cjs','test-provider.cjs','test-recovery.cjs','test-review.cjs','test-first-run.cjs','test-setup.cjs','test-course-selection.cjs'
];
function copyPublic(target){
 for(const name of files){const dest=path.join(target,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,name),dest);}
}
function allFiles(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?allFiles(path.join(directory,e.name)):[path.join(directory,e.name)]);}
function scan(directory){
 const markers=[root,process.env.USERPROFILE].filter(Boolean);try{const account=JSON.parse(fs.readFileSync(path.join(root,'settings.json'))).account;if(account)markers.push(String(account));}catch{}try{const provider=require('./provider-settings.cjs').load();if(provider.key)markers.push(provider.key);}catch{}
 const banned=/(?:^|\/)(?:data|profiles|logs|work|config)(?:\/|$)|\.dpapi$|(?:^|\/)runtime\.json/;
 for(const file of allFiles(directory)){
  const name=path.relative(directory,file).replaceAll('\\','/');if(banned.test(name))throw Error('发行目录包含运行期私有数据：'+name);
  if(/\.(?:cjs|ps1|json|md|txt|cmd|yml)$/.test(name)){
   const text=fs.readFileSync(file,'utf8');if(markers.some(value=>value.length>=6&&text.includes(value)))throw Error('发行文件包含本机个人标识：'+name);
   if(/(?:sk-[A-Za-z0-9_-]{24,}|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.)/.test(text))throw Error('发行文件疑似包含密钥或登录令牌：'+name);
  }
 }
}
function ps(code){return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{stdio:'pipe',windowsHide:true});}
const quote=value=>"'"+value.replaceAll("'","''")+"'";
function zip(directory,target){ps("[void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem');[IO.Compression.ZipFile]::CreateFromDirectory("+quote(directory)+','+quote(target)+",[IO.Compression.CompressionLevel]::Optimal,$false)");}
async function nodeRuntime(){
 const base='https://nodejs.org/dist/latest-v24.x/';
 const response=await fetch(base+'SHASUMS256.txt',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Node官方校验表下载失败');
 const sums=await response.text(),match=sums.match(/^([a-f0-9]{64})\s+(node-v24\.\d+\.\d+-win-x64\.zip)$/m);if(!match)throw Error('Node官方校验表中没有Windows x64运行时');
 const [,expected,name]=match,cache=path.join(root,'work','release-cache');fs.mkdirSync(cache,{recursive:true});const archive=path.join(cache,name);
 if(!fs.existsSync(archive)||crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==expected){
  console.log('下载并校验官方Node Windows运行时：'+name);const r=await fetch(base+name,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('Node官方运行时下载失败');const bytes=Buffer.from(await r.arrayBuffer());if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Node运行时SHA-256不匹配');fs.writeFileSync(archive,bytes);
 }
 const expanded=path.join(cache,name.replace('.zip',''));
 if(!fs.existsSync(path.join(expanded,name.replace('.zip',''),'node.exe'))){
  if(!path.resolve(expanded).startsWith(path.resolve(cache)+path.sep))throw Error('运行时展开目录越界');
  ps("$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')+';'+$env:PSModulePath;Expand-Archive -LiteralPath "+quote(archive)+' -DestinationPath '+quote(expanded)+' -Force');
 }
 const directory=path.join(expanded,name.replace('.zip',''));if(!fs.existsSync(path.join(directory,'LICENSE')))throw Error('Node运行时缺少对应许可证');return {directory,archive:name,sha256:expected};
}
async function build(){
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=path.join(root,'dist','candidate-'+stamp),source=path.join(out,'source'),portable=path.join(out,'Windows-x64'),app=path.join(portable,'app');
 if(fs.existsSync(out))throw Error('输出目录已存在，未覆盖');fs.mkdirSync(source,{recursive:true});copyPublic(source);scan(source);zip(source,path.join(out,'Source.zip'));console.log('源码白名单与个人数据扫描通过');
 if(!process.argv.includes('--source-only')){
  copyPublic(app);
  if(!fs.existsSync(path.join(root,'node_modules/playwright/package.json')))throw Error('请先执行npm ci，再构建Windows运行包');
  fs.cpSync(path.join(root,'node_modules'),path.join(app,'node_modules'),{recursive:true});
  const runtime=await nodeRuntime();fs.mkdirSync(path.join(app,'runtime'),{recursive:true});for(const name of ['node.exe','LICENSE'])fs.copyFileSync(path.join(runtime.directory,name),path.join(app,'runtime',name));
  fs.writeFileSync(path.join(app,'runtime','provenance.json'),JSON.stringify({source:'https://nodejs.org/dist/latest-v24.x/',archive:runtime.archive,sha256:runtime.sha256},null,2));
  for(const [name,script,args]of[['启动.cmd','launch.ps1',''],['设置.cmd','settings.ps1',''],['选择课程.cmd','settings.ps1',' -Page Course'],['切换账号.cmd','settings.ps1',' -Page Account']])fs.writeFileSync(path.join(portable,name),'@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0app"\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\\'+script+'"'+args+'\r\npause\r\n');
  fs.copyFileSync(path.join(root,'README.md'),path.join(portable,'使用说明.md'));fs.copyFileSync(path.join(root,'先看这里.txt'),path.join(portable,'先看这里.txt'));fs.copyFileSync(path.join(root,'FAQ.md'),path.join(portable,'常见问题.md'));
  execFileSync(path.join(app,'runtime','node.exe'),[path.join(app,'console.cjs'),'--check'],{stdio:'pipe',windowsHide:true});
  // Scan the copied original files again; node_modules and the official runtime
  // are supplied by their locked dependencies, not by personal runtime folders.
  const privatePaths=['data','profiles','logs','config','settings.json','model-config.json','reference-bank.json','runtime.json'];for(const name of privatePaths)if(fs.existsSync(path.join(app,name)))throw Error('Windows包出现私有或实际配置：'+name);
  zip(portable,path.join(out,'Windows-x64.zip'));console.log('Windows便携包组件检查通过（无需系统Node）');
 }
 const artifacts=fs.readdirSync(out).filter(f=>f.endsWith('.zip')).map(f=>({name:f,bytes:fs.statSync(path.join(out,f)).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex')}));
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version:require('./package.json').version,createdAt:new Date().toISOString(),sourceFiles:files,artifacts},null,2));
 console.log('候选包：'+out);return out;
}
if(require.main===module)build().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={files,copyPublic,scan,build};
