param([ValidateSet('Menu','FirstRun','Account','Models','Course','Parallel')][string]$Page='Menu')
. (Join-Path $PSScriptRoot 'setup-common.ps1')
Set-Location -LiteralPath $PSScriptRoot
Assert-OcsStopped
$Host.UI.RawUI.WindowTitle='智慧树 - 设置'
Write-Host '设置只在任务结束后应用；不改动正在进行的测验。'
$settingsPath=Join-Path $PSScriptRoot 'settings.json'
if(Test-Path -LiteralPath $settingsPath){$settings=Read-OcsJson $settingsPath}else{$settings=Read-OcsJson (Join-Path $PSScriptRoot 'examples/settings.example.json')}
function Save-Settings { Write-OcsJson $settingsPath $settings }
function Set-Account {
    $folder=Join-Path $PSScriptRoot 'data'
    $accounts=@();if(Test-Path -LiteralPath $folder){foreach($dir in Get-ChildItem -LiteralPath $folder -Directory){$meta=Join-Path $dir.FullName 'account.json';if(Test-Path -LiteralPath $meta){$accounts+=Read-OcsJson $meta}}}
    Write-Host '账号之间的登录资料、学习记录和提交保护独立保存。'
    for($i=0;$i -lt $accounts.Count;$i++){Write-Host (($i+1).ToString()+'. '+$accounts[$i].school+' / '+$accounts[$i].expectedDisplayName+' / '+$accounts[$i].account)}
    $choice=Read-OcsValue '输入已有账号序号，或按回车添加账号'
    $index=0
    if([int]::TryParse($choice,[ref]$index) -and $index -ge 1 -and $index -le $accounts.Count){
        $selected=$accounts[$index-1];$settings.account=$selected.account;$settings.expectedDisplayName=$selected.expectedDisplayName
        $settings | Add-Member -NotePropertyName school -NotePropertyValue $selected.school -Force
        $settings.courseUrl=$selected.courseUrl;$settings.courseName=$selected.courseName
        $settings | Add-Member -NotePropertyName browserProfile -NotePropertyValue $selected.browserProfile -Force
    }else{
        $settings.account='';$settings.expectedDisplayName='';$settings.courseUrl='';$settings.courseName=''
        $settings | Add-Member -NotePropertyName browserProfile -NotePropertyValue '' -Force
        Save-Settings
        Write-Host '请在即将打开的网页本人登录，再回脚本输入课程序号；个人信息会从本人课程页读取。' -ForegroundColor Cyan
        & (Get-OcsNode) (Join-Path $PSScriptRoot 'console.cjs') --login-only
        if($LASTEXITCODE -ne 0){throw '网页登录未完成，原账号资料仍保留。'}
        $script:settings=Read-OcsJson $settingsPath
        if(-not $settings.account -or -not $settings.expectedDisplayName){throw '网页账号尚未确认，请在专用Edge完成登录并打开课程知识学习目录后重试。'}
    }
    Save-Settings
    Write-Host '首次登录需本人在浏览器选择学校、输入密码并完成验证；成功核对身份后会加密记忆。后续自动填写，安全验证仍由本人完成。' -ForegroundColor Cyan
}
function Select-Course {
    if(-not $settings.account){Set-Account}
    Save-Settings
    Write-Host '即将打开专用浏览器：登录后自动列出AI智课，在脚本中输入编号即可选课。'
    & (Get-OcsNode) (Join-Path $PSScriptRoot 'console.cjs') --select-course-only
    if($LASTEXITCODE -ne 0){throw '课程选择未完成，原有提交记录保留。'}
    $script:settings=Read-OcsJson $settingsPath
}
function Set-Parallel {
    $value=Read-OcsValue '知识点窗口数量（1到4，建议先用2）' ([string]$settings.knowledgeWorkers)
    $count=0;if(-not [int]::TryParse($value,[ref]$count) -or $count -lt 1 -or $count -gt 4){throw '只能设置1到4。'}
    $settings.knowledgeWorkers=$count;Save-Settings
    Write-Host '已保存。空闲窗口自动领取下一个任务；只剩一个可处理知识点时，多余窗口会显示空闲原因。模型服务限流时请调低窗口数。'
}
if($Page -eq 'FirstRun'){
    Save-Settings
    $providerCheck=& (Get-OcsNode) -e "try{require('./provider-settings.cjs').load();process.exit(0)}catch{process.exit(1)}"
    $providerFailed=$LASTEXITCODE -ne 0;$modelState=Read-OcsJson (Join-Path $PSScriptRoot 'model-config.json');if($providerFailed -or -not $modelState.answerModel -or -not $modelState.judgeModel){& (Join-Path $PSScriptRoot 'setup-models.ps1') -SkipRunningCheck}
    Write-Host 'API设置完成。接下来自动打开网页；本人登录后回脚本输入课程序号。'
    exit
}
switch($Page){'Account'{Set-Account;exit};'Models'{$mode=Read-OcsValue '回车自动检测模型，输入2使用高级自选模型' '1';if($mode -eq '2'){& (Join-Path $PSScriptRoot 'setup-models.ps1') -Advanced}else{& (Join-Path $PSScriptRoot 'setup-models.ps1')};exit};'Course'{Select-Course;exit};'Parallel'{Set-Parallel;exit}}
while($true){
    Write-Host "`n1 学校与账号 / 切换账号`n2 选择或切换课程`n3 模型设置与检测`n4 并发窗口数量`n5 返回"
    switch(Read-Host '请输入序号'){'1'{Set-Account};'2'{Select-Course};'3'{& (Join-Path $PSScriptRoot 'setup-models.ps1')};'4'{Set-Parallel};'5'{exit};default{Write-Host '请输入1到5。'}}
}
