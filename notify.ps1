param([string]$Title,[string]$Message)
$ErrorActionPreference='SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$icon=New-Object System.Windows.Forms.NotifyIcon
try{$icon.Icon=[System.Drawing.SystemIcons]::Information;$icon.Visible=$true;$icon.BalloonTipTitle=$Title;$icon.BalloonTipText=$Message;$icon.ShowBalloonTip(10000);[System.Threading.Thread]::Sleep(11000)}finally{$icon.Visible=$false;$icon.Dispose()}
