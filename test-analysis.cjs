const assert=require('assert/strict');
const {answers,validate,extract}=require('./analysis.cjs');
const {chromium}=require('./browser-runtime.cjs');
const submitted=[{stem:'判断题面',options:['对','错'],answers:['错']}];
const question={stem:'判断题面',options:['对','错'],selected:['错'],reference:'参考答案：对',explanation:'',outcome:'回答错误！',hasDiagram:false};
assert.deepEqual(answers('参考答案：A、C',['甲','乙','丙']),['甲','丙']);
assert.throws(()=>answers('参考答案：',['对','错']),/尚未公布/);
assert.throws(()=>answers('参考答案：D',['甲','乙']),/越界/);
assert.deepEqual(validate([question],submitted,{total:1,correct:0})[0].answers,['对']);
assert.throws(()=>validate([{...question,selected:['对']}],submitted,{total:1,correct:0}),/作答与本次提交不符/);
assert.throws(()=>validate([{...question,stem:'旧试卷'}],submitted,{total:1,correct:0}),/题面与本次提交不符/);
assert.throws(()=>validate([question],submitted,{total:1,correct:1}),/正确题数/);
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const p=await browser.newPage();
  await p.setContent('<ul class="question-item"><div class="quest-title"><pre class="option-name">判断题面</pre></div><label class="el-radio"><span class="el-radio__label"><span class="preStyle">对</span></span></label><label class="el-radio is-checked"><span class="el-radio__label"><span class="preStyle">错</span></span></label><div class="question-result">回答错误！</div><p class="answer-title">参考答案：对</p></ul>');
  const q=await extract(p);assert.deepEqual(q[0],question);
  assert.deepEqual(validate(q,submitted,{total:1,correct:0})[0].answers,['对']);
  console.log('PASS published DOM reference extraction, wrong-answer correction, incomplete/stale paper and mismatched grade rejection');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
