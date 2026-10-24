const {inventory,identity}=require('./course.cjs'),assessment=require('./assessment.cjs');
async function audit(page,{entry,store}){
 const course=identity(entry);await page.goto(entry,{waitUntil:'domcontentloaded'});await page.locator('.item-content[knowledgeid]').first().waitFor({timeout:25000});const nodes=await inventory(page);
 const plan=await assessment.read(page,entry),grades=plan.items;
 const incomplete=grades.filter(g=>g.decision==='unknown'||g.decision==='required'&&g.percent!==100);
 const incompleteNodes=nodes.filter(n=>assessment.needs(n,'learning',plan)||assessment.needs(n,'mastery',plan));
 const result={incompleteNodes,at:new Date().toISOString(),course,nodes,grades,plan,incomplete,complete:nodes.length>0&&grades.length>0&&incomplete.length===0&&incompleteNodes.length===0,platformText:plan.platformText};
 store.save('final-audit',result);return result;
}
module.exports={audit};
