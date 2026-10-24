const {AsyncLocalStorage}=require('async_hooks');
const scope=new AsyncLocalStorage();
function withTaskPage(context,page,fn){return scope.run({context,page},fn);}
function taskPage(context){const current=scope.getStore();return current?.context===context?current.page:context.ocsTaskPage;}
function shard(id,count){return require('crypto').createHash('sha256').update(String(id)).digest().readUInt32BE(0)%count;}
module.exports={withTaskPage,taskPage,shard};
