function active(lane){return lane&&lane.title!=='本轮处理结束'&&!lane.title.startsWith('需核对：')&&!lane.title.startsWith('空闲：');}
function lines(state){
 if(state.status!=='running')return [];
 const lanes=state.lanes||{},entries=Object.entries(lanes),output=[];
 const knowledgeActive=entries.some(([name,value])=>name.startsWith('知识点任务')&&active(value))||(!entries.length&&state.stage==='知识学习与掌握度');
 const commentActive=active(lanes['课程评论'])||(!entries.length&&state.stage==='课程讨论');
 if(knowledgeActive&&state.learning?.total>0&&state.learning.done<state.learning.total)output.push('视频 '+state.learning.done+'/'+state.learning.total);
 if(knowledgeActive&&state.knowledge?.total>0&&state.knowledge.done<state.knowledge.total)output.push('掌握度 '+state.knowledge.done+'/'+state.knowledge.total);
 if(commentActive&&state.discussions?.total>0&&state.discussions.done<state.discussions.total)output.push('评论 '+state.discussions.done+'/'+state.discussions.total);
 return output;
}
module.exports={lines};
