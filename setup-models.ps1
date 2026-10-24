param([switch]$SkipRunningCheck)
. (Join-Path $PSScriptRoot 'setup-common.ps1')
if(-not $SkipRunningCheck){Assert-OcsStopped}
$Host.UI.RawUI.WindowTitle='智慧树 - 模型设置'
Write-Host '模型设置：需要兼容 OpenAI Chat Completions 格式的服务。' -ForegroundColor Cyan
Write-Host '请从自己的服务商控制台复制API地址、API Key与模型ID。不会附带他人的密钥，调用费用由你的服务商计费。'
$providerFile=Join-Path $PSScriptRoot 'config/provider.dpapi'
$old=$null;if(Test-Path -LiteralPath $providerFile){try{$old=Read-OcsPrivate $providerFile}catch{Write-Host '旧设置无法解密，请重新填写。'}}
$modelPath=Join-Path $PSScriptRoot 'model-config.json'
if(Test-Path -LiteralPath $modelPath){$models=Read-OcsJson $modelPath}else{$models=Read-OcsJson (Join-Path $PSScriptRoot 'examples/model-config.example.json')}
$url=Read-OcsValue 'API地址（例如 https://服务商域名/v1 或完整/chat/completions地址）' $old.url
if(-not $url){throw '未填写API地址，没有修改原设置。'}
Write-Host 'API Key粘贴后不显示字符是正常现象，粘贴完按回车继续；不要发送截图或把Key发给他人。'
$secret=Read-Host 'API Key（输入隐藏；留空保留原Key）' -AsSecureString
$apiKey=$old.key
if($secret.Length){$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret);try{$apiKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}}
if(-not $apiKey){throw '未填写API Key，没有修改原设置。'}
$answer=Read-OcsValue '主答模型ID' $models.answerModel
$judgeDefault=$models.judgeModel;if(-not $judgeDefault){$judgeDefault=$answer}
$judge=Read-OcsValue '裁决模型ID（不确定时回车使用主答模型）' $judgeDefault
if(-not $answer -or -not $judge){throw '主答与裁决模型ID必须填写。'}
$vision=Read-OcsValue '图片裁决模型ID（须支持图片；留空使用主答模型）' $models.visionJudgeModel
if(-not $vision){$vision=$answer}
$pending=Join-Path $PSScriptRoot 'config/provider-pending.dpapi'
try{
    Write-OcsPrivate $pending @{url=$url;key=$apiKey;answerModel=$answer;judgeModel=$judge}
    & (Get-OcsNode) (Join-Path $PSScriptRoot 'provider-settings.cjs') --test-file $pending
    if($LASTEXITCODE -ne 0){throw '检测未通过，原设置已保留。请检查地址、Key、模型权限、余额或网络后重新设置。'}
    Move-Item -LiteralPath $pending -Destination $providerFile -Force
    $models.answerModel=$answer;$models.judgeModel=$judge;$models.visionJudgeModel=$vision
    Write-OcsJson $modelPath $models
    Write-Host '已保存：API Key使用当前Windows用户加密，之后可以直接启动。' -ForegroundColor Green
}finally{if(Test-Path -LiteralPath $pending){Remove-Item -LiteralPath $pending};$apiKey=$null;$secret=$null}
