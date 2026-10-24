const path=require('path'),{spawn}=require('child_process'),last=new Map();
function notify(title,message){
 if(process.platform!=='win32')return;
 const now=Date.now();if(now-(last.get(title)||0)<60000)return;last.set(title,now);
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'notify.ps1'),'-Title',title,'-Message',message],{windowsHide:true,stdio:'ignore'});
 child.on('error',()=>{});child.unref();
}
module.exports={notify};
