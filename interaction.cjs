// Page DOM events only: no mouse input, focus(), bringToFront(), or window resize.
async function quietClick(locator){
 await locator.waitFor({state:'visible',timeout:8000});
 await locator.evaluate(element=>{
  if(element.disabled||element.getAttribute('aria-disabled')==='true')throw Error('控件不可用，未点击');
  element.click();
 });
}
async function writeEditable(locator,text){
 await locator.waitFor({state:'visible',timeout:8000});
 await locator.evaluate((element,text)=>{
  if(!element.isContentEditable)throw Error('不是可编辑区域，未填写');
  element.textContent=text;
  element.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
  element.dispatchEvent(new Event('change',{bubbles:true}));
 },text);
}
module.exports={quietClick,writeEditable};
