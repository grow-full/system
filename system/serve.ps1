# 이 폴더를 http://localhost:8000 으로 여는 간단한 서버 (Python이 없는 Windows용)
# 실행: PowerShell에서  powershell -ExecutionPolicy Bypass -File serve.ps1
# 끄기: Ctrl + C
param([int]$Port = 8000)

$root = $PSScriptRoot
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
  '.gif' = 'image/gif'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.webp' = 'image/webp'
  '.mp3' = 'audio/mpeg'; '.wav' = 'audio/wav'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "http://localhost:$Port 에서 열렸어요. 끄려면 Ctrl + C"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($path -eq '') { $path = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $path))
    $res = $ctx.Response
    if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-store')
      $bytes = [IO.File]::ReadAllBytes($file)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
    $res.Close()
  }
} finally {
  $listener.Stop()
}
