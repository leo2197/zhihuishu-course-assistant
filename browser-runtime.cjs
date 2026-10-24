const fs=require('fs'),path=require('path');
try{module.exports=require('playwright');}
catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;const legacy=path.join(__dirname,'../uooc/node_modules/playwright');if(fs.existsSync(legacy))module.exports=require(legacy);else throw Error('浏览器组件缺失，请完整解压发行包；从源码运行请先执行npm ci。');}
