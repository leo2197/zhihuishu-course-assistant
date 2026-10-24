const {isExempt}=require('./practice.cjs');
class KnowledgeQueue{
 constructor(nodes,plan){
  if(new Set(nodes.map(n=>n.id)).size!==nodes.length)throw Error('知识点队列存在重复编号');
  this.pending=nodes.filter(n=>require('./assessment.cjs').needs(n,'learning',plan)||require('./assessment.cjs').needs(n,'mastery',plan)).map(n=>({...n}));
  this.pending.sort((a,b)=>Number(b.learning!==undefined&&b.learning!=='100')-Number(a.learning!==undefined&&a.learning!=='100'));
  this.running=new Map();this.finished=new Set();
 }
 take(worker){const node=this.pending.shift();if(!node)return null;this.running.set(node.id,worker);return node;}
 release(id){this.running.delete(id);this.finished.add(id);}
}
module.exports={KnowledgeQueue};
