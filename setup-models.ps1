param([switch]$SkipRunningCheck,[switch]$Advanced)
. (Join-Path $PSScriptRoot 'setup-common.ps1')
if(-not $SkipRunningCheck){Assert-OcsStopped}
$Host.UI.RawUI.WindowTitle='智慧树 - 模型设置'
Write-Host '模型设置：需要兼容 OpenAI Chat Completions 格式的服务。' -ForegroundColor Cyan
Write-Host '推荐智谱GLM，也支持其他兼容服务。默认只填API地址和Key，自动读取并检测模型；费用以自己的服务商为准。'
Write-Host 'GLM密钥管理：https://open.bigmodel.cn/apikey/platform（网页，不是API接口）'
$providerFile=Join-Path $PSScriptRoot 'config/provider.dpapi'
$old=$null;if(Test-Path -LiteralPath $providerFile){try{$old=Read-OcsPrivate $providerFile}catch{Write-Host '旧设置无法解密，请重新填写。'}}
$modelPath=Join-Path $PSScriptRoot 'model-config.json'
if(Test-Path -LiteralPath $modelPath){$models=Read-OcsJson $modelPath}else{$models=Read-OcsJson (Join-Path $PSScriptRoot 'examples/model-config.example.json')}
$defaultUrl=$old.url;if(-not $defaultUrl){$defaultUrl='https://open.bigmodel.cn/api/paas/v4'}
$url=Read-OcsValue 'API地址（回车使用GLM官方接口；其他服务填写自己的接口地址）' $defaultUrl
if(-not $url){throw '未填写API地址，没有修改原设置。'}
Write-Host 'API Key粘贴后不显示字符是正常现象，粘贴完按回车继续；不要发送截图或把Key发给他人。'
$secret=Read-Host 'API Key（输入隐藏；留空保留原Key）' -AsSecureString
$apiKey=$old.key
if($secret.Length){$apiKey=Convert-OcsApiSecret $secret}
if(-not $apiKey){throw '未填写API Key，没有修改原设置。'}
$answer='';$judge='';$vision=''
if($Advanced){
 $answer=Read-OcsValue '主答模型ID' $models.answerModel
 $judgeDefault=$models.judgeModel;if(-not $judgeDefault){$judgeDefault=$answer}
 $judge=Read-OcsValue '裁决模型ID（回车使用主答）' $judgeDefault
 if(-not $answer -or -not $judge){throw '高级模式需要填写模型ID。'}
 $vision=Read-OcsValue '图像模型ID（可留空，图片题交人工）' $models.visionJudgeModel
}
$pending=Join-Path $PSScriptRoot 'config/provider-pending.dpapi'
try{
    Write-OcsPrivate $pending @{url=$url;key=$apiKey;answerModel=$answer;judgeModel=$judge}
    $detected=Join-Path $PSScriptRoot 'config/models-pending.json'
    while($true){
        if($Advanced){& (Get-OcsNode) (Join-Path $PSScriptRoot 'provider-settings.cjs') --test-file $pending}
        else {& (Get-OcsNode) (Join-Path $PSScriptRoot 'provider-settings.cjs') --test-file $pending --auto --output $detected}
        if($LASTEXITCODE -eq 0){break}
        Write-Host '检测失败，尚未保存本次设置；原来的可用设置保留。' -ForegroundColor Yellow
        $retry=Read-Host '输入R保留本次输入重试；输入K重新填写Key；回车取消（原设置保留）'
        if($retry -match '^[kK]$'){
            $secret=Read-Host '重新粘贴完整API Key（隐藏输入，不要附带说明）' -AsSecureString
            if(-not $secret.Length){Write-Host '没有输入新Key，保留本次输入。';continue}
            $apiKey=Convert-OcsApiSecret $secret
            Write-OcsPrivate $pending @{url=$url;key=$apiKey;answerModel=$answer;judgeModel=$judge}
            continue
        }
        if($retry -notmatch '^[rR]$'){throw '检测未通过，原设置已保留。请检查地址、Key、模型权限、余额或网络后重新设置。'}
    }
    if($Advanced){$models.answerModel=$answer;$models.judgeModel=$judge;$models.visionJudgeModel=$vision}else{$models=Read-OcsJson $detected}
    if(-not $models.answerModel -or -not $models.judgeModel){throw '自动识别未返回可用模型；原设置保留，可进入高级模式自选。'}
    Move-Item -LiteralPath $pending -Destination $providerFile -Force
    Write-OcsJson $modelPath $models
    Write-Host '已保存：API Key使用当前Windows用户加密，之后可以直接启动。' -ForegroundColor Green
}finally{if($detected -and (Test-Path -LiteralPath $detected)){Remove-Item -LiteralPath $detected};if(Test-Path -LiteralPath $pending){Remove-Item -LiteralPath $pending};$apiKey=$null;$secret=$null}
