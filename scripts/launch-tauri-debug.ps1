$ErrorActionPreference='Stop'
$root = 'D:\Veda Agent'
$log = Join-Path $root '.veda-tauri.log'
# WebView2 remote debugging so the renderer can be inspected from outside.
$inner = 'cd /d "' + $root + '" && set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222&& npm run app > "' + $log + '" 2>&1'
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = 'cmd.exe /c ' + $inner }
"started pid=$($r.ProcessId)"
