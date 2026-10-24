Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot 'setup-common.ps1')
$Host.UI.RawUI.WindowTitle='智慧树 AI 智课助手'
while($true){
    Write-Host "`n========== 智慧树 AI 智课助手 ==========" -ForegroundColor Cyan
    Write-Host "1 开始 / 继续学习（直接按回车）`n2 模型设置与检测`n3 选择或切换课程`n4 添加或切换账号`n5 并发窗口数量`n6 查看使用说明`n0 退出"
    Write-Host '首次选1，程序会引导设置和本人登录。修改设置前先结束正在运行的任务。'
    $choice=Read-Host '请选择';if(-not $choice){$choice='1'}
    try{
        switch($choice){
            '1'{& (Join-Path $PSScriptRoot 'launch.ps1');exit $LASTEXITCODE}
            '2'{& (Join-Path $PSScriptRoot 'settings.ps1') -Page Models}
            '3'{& (Join-Path $PSScriptRoot 'settings.ps1') -Page Course}
            '4'{& (Join-Path $PSScriptRoot 'settings.ps1') -Page Account}
            '5'{& (Join-Path $PSScriptRoot 'settings.ps1') -Page Parallel}
            '6'{Get-Content -LiteralPath (Join-Path $PSScriptRoot '先看这里.txt') -Encoding UTF8 | Out-Host}
            '0'{exit 0}
            default{Write-Host '请输入0到6之间的数字。'}
        }
    }catch{Write-Host $_.Exception.Message -ForegroundColor Red;Write-Host '设置未完成。可修正后重新选择；当前任务和提交记录保留。'}
}
