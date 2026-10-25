if($PSVersionTable.PSEdition -eq 'Desktop'){$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')+';'+$env:PSModulePath}
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
function Get-OcsNode {
    $bundled=Join-Path $PSScriptRoot 'runtime/node.exe'
    if(Test-Path -LiteralPath $bundled){return $bundled}
    $command=Get-Command node.exe -ErrorAction SilentlyContinue
    if(-not $command){throw '缺少Node运行组件。普通用户请重新下载Windows-x64.zip并完整解压；从源码运行请先安装Node.js 22或以上。不要只复制启动.cmd。'}
    return $command.Source
}
function Test-OcsEnvironment {
    if(-not [Environment]::Is64BitOperatingSystem){throw '当前运行包需要64位Windows 10/11。'}
    $edgeCandidates=@((Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe'),(Join-Path $env:ProgramFiles 'Microsoft/Edge/Application/msedge.exe'),(Join-Path $env:LOCALAPPDATA 'Microsoft/Edge/Application/msedge.exe'))
    if(-not ($edgeCandidates | Where-Object {Test-Path -LiteralPath $_})){throw '未找到Microsoft Edge。请先安装Edge，再重新双击启动.cmd；无需开启远程调试。'}
    $probe=Join-Path $PSScriptRoot ('.write-check-'+[Guid]::NewGuid().ToString('N'))
    try{[IO.File]::WriteAllText($probe,'ok')}catch{throw '当前文件夹不可写。请完整解压到自己的文档或其他可写文件夹；不要在ZIP内运行。'}finally{if(Test-Path -LiteralPath $probe){Remove-Item -LiteralPath $probe}}
    $version=& (Get-OcsNode) -p 'parseInt(process.versions.node)'
    if($LASTEXITCODE -ne 0 -or [int]$version -lt 22){throw 'Node运行组件版本不足。普通用户请重新完整解压Windows运行包；开发者需要Node.js 22或以上。'}
}
function Read-OcsJson([string]$Path) { Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json }
function Write-OcsJson([string]$Path,$Value) {
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Path)) | Out-Null
    [IO.File]::WriteAllText($Path,($Value | ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
}
function Write-OcsPrivate([string]$Path,$Value) {
    [void][Reflection.Assembly]::LoadWithPartialName('System.Security')
    $bytes=[Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 20))
    $encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Path)) | Out-Null
    [IO.File]::WriteAllText($Path,[Convert]::ToBase64String($encrypted),[Text.UTF8Encoding]::new($false))
}
function Read-OcsPrivate([string]$Path) {
    [void][Reflection.Assembly]::LoadWithPartialName('System.Security')
    $bytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String([IO.File]::ReadAllText($Path)),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
}
function Read-OcsValue([string]$Label,[string]$Default='') {
    $hint=$Label;if($Default){$hint+=' ['+$Default+']'}
    $value=(Read-Host $hint).Trim();if(-not $value){$value=$Default};return $value
}
function Assert-OcsStopped {
    $lock=Join-Path $PSScriptRoot 'runtime.json'
    if(Test-Path -LiteralPath $lock){$state=Read-OcsJson $lock;if(Get-Process -Id $state.pid -ErrorAction SilentlyContinue){throw '任务正在运行。请先结束当前任务，再切换账号、课程或模型；当前任务不会被设置程序强制关闭。'}}
}

function Convert-OcsApiSecret([Security.SecureString]$Secret,[scriptblock]$ReadClipboard={
    [void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')
    [Windows.Forms.Clipboard]::GetText()
}) {
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
    try{$text=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
    # Windows PowerShell can pass Ctrl+V to Read-Host as U+0016 instead of pasting.
    if($text -match '^\x16+$'){
        Write-Host '已识别Ctrl+V粘贴，正在接收剪贴板文本（内容不会显示）。'
        try{$text=& $ReadClipboard}catch{throw '无法读取剪贴板，请重新复制Key，再用鼠标右键粘贴。'}
        if(-not $text){throw '剪贴板没有文字，请先复制完整API Key，再重新粘贴。'}
    }
    return $text
}
