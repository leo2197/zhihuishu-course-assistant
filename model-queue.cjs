const fs=require('fs'),path=require('path');let active=0;const waiting=[];
function capacity(){try{return Math.min(4,Math.max(1,Number(JSON.parse(fs.readFileSync(path.join(__dirname,'model-config.json'))).modelRequestConcurrency)||2));}catch{return 2;}}
async function request(url,options){
 if(active<capacity()&&waiting.length===0)active++;else await new Promise(resolve=>waiting.push(resolve));
 try{const {timeoutMs=90000,signal,...init}=options;const result=await fetch(url,{...init,signal:signal||AbortSignal.timeout(timeoutMs)}),body=await result.text();return {ok:result.ok,status:result.status,json:async()=>JSON.parse(body)};}
 finally{const next=waiting.shift();if(next)next();else active--;}
}
module.exports={request,capacity};
