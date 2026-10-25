param([switch]$Check, [string]$ReadyFile)
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = '智慧树 AI 智课助手'
$launchExit=0
Set-Location -LiteralPath $PSScriptRoot
try {
    . (Join-Path $PSScriptRoot 'setup-common.ps1')
    & (Join-Path $PSScriptRoot 'console-mode.ps1')
    $node = Get-OcsNode
    Write-Host '[1/4] 检查运行环境' -ForegroundColor Cyan
    Test-OcsEnvironment
    if(-not $Check){
        Write-Host '[2/4] 检查账号与模型设置；首次使用请按提示填写' -ForegroundColor Cyan
        if(-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'model-config.json'))){Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'examples/model-config.example.json') -Destination (Join-Path $PSScriptRoot 'model-config.json')}
        $needsSetup=-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'settings.json'))
        if(-not $needsSetup){$saved=Read-OcsJson (Join-Path $PSScriptRoot 'settings.json');$needsSetup=-not $saved.account}
        & $node -e "try{require('./provider-settings.cjs').load();process.exit(0)}catch{process.exit(1)}"
        if($LASTEXITCODE -ne 0){$needsSetup=$true}
        $modelState=Read-OcsJson (Join-Path $PSScriptRoot 'model-config.json');if(-not $modelState.answerModel -or -not $modelState.judgeModel){$needsSetup=$true}
        if($needsSetup){& (Join-Path $PSScriptRoot 'settings.ps1') -Page FirstRun}
    }
    Write-Host '[3/4] 检查程序组件' -ForegroundColor Cyan
    & $node (Join-Path $PSScriptRoot 'console.cjs') --check
    if ($LASTEXITCODE -ne 0) { throw '程序组件检查失败。请重新完整解压Windows运行包，不要只复制启动文件。' }
    if ($ReadyFile) { @{status='ready'; pid=$PID} | ConvertTo-Json | Set-Content -LiteralPath $ReadyFile -Encoding UTF8 }
    if (-not $Check) { Write-Host '[4/4] 打开专用浏览器；首次本人登录并完成验证，之后回脚本输入课程序号。请保留本窗口。' -ForegroundColor Cyan; & $node (Join-Path $PSScriptRoot 'console.cjs');$launchExit=$LASTEXITCODE }
} catch {
    $launchExit=1
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($ReadyFile) { @{status='error'; message=$_.Exception.Message; pid=$PID} | ConvertTo-Json | Set-Content -LiteralPath $ReadyFile -Encoding UTF8 }
}
Read-Host '本窗口已结束。按回车关闭；遇到问题请先阅读“先看这里.txt”或GitHub常见问题，保留错误提示'
exit $launchExit
