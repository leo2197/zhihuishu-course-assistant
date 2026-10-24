const {isExempt}=require('./practice.cjs');
function fraction(done,total){return {done,total};}
function bar(value){return value?.total>0?value.done+'/'+value.total:'';}
class Progress{
 constructor(store,log=console.log){this.store=store;this.log=log;this.state={startedAt:new Date().toISOString(),status:'running',stage:'身份核对',currentPoint:null,knowledge:null,discussions:null};}
 lane(name){this.state.lanes??={};return {point:title=>{this.state.lanes[name]={title,at:new Date().toISOString()};this.save();},knowledge:nodes=>this.knowledge(nodes),discussions:(done,total)=>this.discussions(done,total)};}
 save(){this.state.updatedAt=new Date().toISOString();this.store.save('progress',this.state);}
 start(){this.timer=setInterval(()=>this.report(),60000);this.timer.unref();this.save();}
 stage(name){this.state.stage=name;this.state.currentPoint=null;this.save();}
 point(title){this.state.currentPoint=title;this.save();}
 knowledge(nodes){const tracked=nodes.filter(n=>this.state.required?.mastery!==false&&n.mastery!==null&&n.mastery!==undefined&&!require('./assessment.cjs').nodeExempt(n,'mastery'));const videos=nodes.filter(n=>this.state.required?.learning!==false&&n.learning!==undefined&&!require('./assessment.cjs').nodeExempt(n,'learning'));this.state.learning={...fraction(videos.filter(n=>Number(n.learning)===100).length,videos.length),verifiedAt:new Date().toISOString()};this.state.knowledge={...fraction(tracked.filter(n=>n.mastery===100).length,tracked.length),verifiedAt:new Date().toISOString()};this.save();this.report();}
 discussions(done,total){if(done<0||done>total)throw Error('评论进度计数无效');this.state.discussions={...fraction(done,total),verifiedAt:new Date().toISOString()};this.save();this.report();}
 report(){const parts=require('./progress-format.cjs').lines(this.state);if(parts.length)this.log('进度｜'+parts.join('｜'));}
 finish(complete){clearInterval(this.timer);this.state.status=complete?'verified-complete':'needs-follow-up';this.state.stage=complete?'平台核验完成':'本轮结束，仍有未完成或待确认项';this.save();this.report();}
}
module.exports={Progress,fraction,bar};
