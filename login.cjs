const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
function protect(text,decrypt=false){
 const action=decrypt?
  '[Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))':
  '[Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))';
 const code="[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);[void][Reflection.Assembly]::LoadWithPartialName('System.Security');$v=[Console]::In.ReadToEnd();"+action;
 try{return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{input:text,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','ignore']}).trim();}catch{throw Error('Windows凭据加密服务不可用');}
}
function read(directory,account){
 const file=path.join(directory,'credentials.dpapi');if(!fs.existsSync(file))return null;
 try{const value=JSON.parse(protect(fs.readFileSync(file,'utf8'),true));return value.account===account&&value.password&&value.school?value:null;}catch{throw Error('自动登录凭据无法解密，请在当前Windows账号重新登录并保存');}
}
function save(directory,value){const file=path.join(directory,'credentials.dpapi'),tmp=file+'.tmp';fs.writeFileSync(tmp,protect(JSON.stringify(value)),{mode:0o600});fs.renameSync(tmp,file);}
function captureLogin(){
 if(location.hostname!=='login.zhihuishu.com'||window.__ocsCaptureLogin)return;window.__ocsCaptureLogin=true;
 const capture=()=>{
  const id=document.querySelector('input[placeholder*="学号"]'),password=document.querySelector('input[type=password]');
  const combo=document.querySelector('input[role=combobox]'),school=combo?.closest('.el-select')?.innerText.trim();
  if(id?.value&&password?.value&&school&&!school.includes('请选择'))window.ocsRememberLogin({account:id.value,school,password:password.value}).catch(()=>{});
 };
 document.addEventListener('click',event=>{const button=event.target?.closest?.('button,[role=button],.base-button-component')||event.target;if(button?.innerText?.trim()==='登录')capture();},true);
 document.addEventListener('submit',capture,true);document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target?.matches?.('input'))capture();},true);
}
const sessions=new WeakMap();
async function prepare(page,settings,store,{log=console.log}={}){
 if(sessions.has(page))return sessions.get(page);
 let pending=null,cached=null,attempted=false,prefilled=false,loginFailureAnnounced=false;
 try{cached=read(store.directory,settings.account);}catch(error){log(error.message);}
 await page.exposeBinding('ocsRememberLogin',({frame},value)=>{
  if(new URL(frame.url()).hostname!=='login.zhihuishu.com'||value?.account!==settings.account||typeof value.password!=='string'||!value.school)return;
  pending={account:value.account,school:value.school,password:value.password};
 });
 await page.addInitScript(captureLogin);await page.evaluate(captureLogin);
 const helper={
  notifyInitial(){if(!cached&&page.context().ocsDesktopNotifications)require('./notify.cjs').notify('首次登录需要本人操作','请打开智慧树专用Edge完成首次登录和验证。成功核对身份后会在本机加密记住登录信息。');},
  notice(){return cached?'【自动登录】已记住本机账号，将自动填写学校、学号和密码；如出现滑块、短信或其他安全验证，请本人完成。密码变更或登录信息失效时需重新输入。':'【首次登录，需要本人操作】请从任务栏打开专用Edge，选择学校、输入学号和密码并完成安全验证。身份核对通过后，将在本机加密保存登录信息；后续自动填写，安全验证仍需本人完成。';},
  async tick(){
   if(new URL(page.url()).hostname!=='login.zhihuishu.com')return;
   if(attempted){if(!loginFailureAnnounced&&await page.locator('.el-message--error,.login-error,[role=alert]').filter({hasText:/密码|账号|错误|失败|冻结|锁定/}).count()){loginFailureAnnounced=true;log('【自动登录未成功】请打开专用Edge检查学校、学号和密码。修正后手动登录，身份核对通过才会更新记忆；脚本不会循环尝试密码。');}return;}
   const id=page.getByPlaceholder(/请输入.*学号/);
   if(await id.count()!==1||!await id.isVisible()){
    const tab=page.getByText('学号登录',{exact:true});if(await tab.count()===1&&await tab.isVisible())await tab.click({timeout:1500});return;
   }
   if(!prefilled){await id.fill(settings.account);prefilled=true;}
   if(!cached)return;
   const combo=page.getByRole('combobox');
   if(await combo.count()!==1)return;
   const school=await combo.evaluate(e=>e.closest('.el-select')?.innerText||'');
   if(!school.includes(cached.school)){
    await combo.fill(cached.school,{timeout:2000});
    const option=page.getByRole('option',{name:cached.school,exact:true});await option.waitFor({state:'visible',timeout:3000});await option.click({timeout:1500});
   }
   await id.fill(cached.account);await page.getByPlaceholder('请输入密码',{exact:true}).fill(cached.password);
   const agreement=page.locator('input[type=checkbox]');
   if(await agreement.count()!==1)throw Error('登录协议控件不唯一，请本人检查');
   if(!await agreement.isChecked()){
    const label=page.locator('label').filter({has:agreement});
    if(await label.count()===1)await require('./interaction.cjs').quietClick(label);else await agreement.check({timeout:1500});
    if(!await agreement.isChecked())throw Error('登录协议未勾选成功，请本人检查');
   }
   const login=page.getByText('登录',{exact:true});
   if(await login.count()!==1)throw Error('登录控件不唯一，请本人检查');
   await login.waitFor({state:'visible',timeout:2500});
   if(await login.evaluate(e=>e.disabled||e.getAttribute('aria-disabled')==='true'||e.classList.contains('is-disabled')))return;
   attempted=true;log('已填写保存的学校、学号和密码，尝试登录一次；如出现安全验证，请本人完成。');
   await require('./interaction.cjs').quietClick(login);
  },
  commit(verifiedAccount){
   if(pending&&pending.account===verifiedAccount){try{save(store.directory,pending);log('【已记住登录】姓名与学号核对通过，学校、学号和密码已用Windows加密保存在本机。下次优先复用登录状态，失效时自动填写；滑块或短信验证由本人完成。切换账号请使用“启动.cmd”菜单中的“添加或切换账号”。');}catch{log('本次登录成功，但凭据加密保存失败；没有保存明文密码。');}pending=null;}
  }
 };sessions.set(page,helper);return helper;
}
module.exports={protect,read,save,prepare};
