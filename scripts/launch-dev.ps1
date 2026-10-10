$ErrorActionPreference = 'Stop'
$root = 'D:\Veda Agent'
$log = Join-Path $root '.veda-dev.log'
$inner = 'cd /d "' + $root + '" && npm run dev > "' + $log + '" 2>&1'
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
  CommandLine = 'cmd.exe /c ' + $inner
}
"ReturnValue=$($result.ReturnValue) ProcessId=$($result.ProcessId)"
