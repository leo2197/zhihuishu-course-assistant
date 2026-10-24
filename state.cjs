const fs=require('fs'),path=require('path');
class Store{
 constructor(account){if(!/^\d+$/.test(account))throw Error('需要数字账号标识以隔离学习记录');this.directory=path.join(__dirname,'data',account);fs.mkdirSync(this.directory,{recursive:true});}
 read(name,fallback){const p=path.join(this.directory,name+'.json');return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):fallback;}
 save(name,value){const p=path.join(this.directory,name+'.json'),tmp=p+'.'+process.pid+'.'+require('crypto').randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,p);}
}
module.exports={Store};
