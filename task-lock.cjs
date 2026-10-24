const fs=require('fs'),path=require('path'),{randomUUID}=require('crypto');
function acquire(directory,key){
 if(!/^[a-zA-Z0-9_-]+$/.test(key))throw Error('任务锁标识无效');
 const folder=path.join(directory,'locks');fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,key+'.json'),token=randomUUID();
 for(let attempt=0;attempt<2;attempt++){
  try{fs.writeFileSync(file,JSON.stringify({pid:process.pid,token,at:new Date().toISOString()}),{flag:'wx'});return ()=>{try{if(JSON.parse(fs.readFileSync(file)).token===token)fs.unlinkSync(file);}catch{}};}
  catch(error){if(error.code!=='EEXIST')throw error;let prior;try{prior=JSON.parse(fs.readFileSync(file));}catch{throw Error('任务锁记录待核对，未重复执行');}
   try{process.kill(prior.pid,0);throw Error('另一任务正在处理此项目，未重复执行');}catch(error){if(error.code!=='ESRCH')throw error;fs.unlinkSync(file);}
  }
 }
 throw Error('任务锁正在变更，未执行');
}
module.exports={acquire};
