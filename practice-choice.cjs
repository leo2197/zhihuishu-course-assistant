function choose(options,multiple,random=Math.random){
 if(!Array.isArray(options)||options.length<2||options.length>8)throw Error('选项未完整识别，无法选择');
 const selected=multiple?options.map((_,i)=>i).filter(()=>random()<0.5):[];
 if(!selected.length)selected.push(Math.min(options.length-1,Math.floor(random()*options.length)));
 return {answers:selected.map(i=>String.fromCharCode(65+i)),decision:'submit',model:'practice-exploration',reason:'用户授权：可重练知识点中裁决不确定时选择作答，随后依据平台解析纠错；此答案并非已核验正确'};
}
module.exports={choose};
