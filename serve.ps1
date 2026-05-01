param(
    [int]$Port = 5500
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = "http://localhost:$Port/"

$mimeTypes = @{
    '.css'         = 'text/css; charset=utf-8'
    '.html'        = 'text/html; charset=utf-8'
    '.ico'         = 'image/x-icon'
    '.jpeg'        = 'image/jpeg'
    '.jpg'         = 'image/jpeg'
    '.js'          = 'text/javascript; charset=utf-8'
    '.json'        = 'application/json; charset=utf-8'
    '.png'         = 'image/png'
    '.svg'         = 'image/svg+xml'
    '.txt'         = 'text/plain; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "No se pudo iniciar el servidor en $prefix" -ForegroundColor Red
    Write-Host "Prueba otro puerto, por ejemplo: .\serve.ps1 -Port 8080" -ForegroundColor Yellow
    throw
}

Write-Host "Dashboard Pro corriendo en $prefix" -ForegroundColor Green
Write-Host "Raiz: $projectRoot" -ForegroundColor Cyan
Write-Host "Presiona Ctrl + C para detenerlo." -ForegroundColor Yellow

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        try {
            $relativePath = [Uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart('/')

            if ([string]::IsNullOrWhiteSpace($relativePath)) {
                $relativePath = 'index.html'
            }

            $normalizedRelativePath = $relativePath.Replace('/', '\')
            $fullPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $normalizedRelativePath))

            if (-not $fullPath.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                $response.StatusCode = 403
                $buffer = [System.Text.Encoding]::UTF8.GetBytes('403 - Acceso denegado')
                $response.ContentType = 'text/plain; charset=utf-8'
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                continue
            }

            if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
                $response.StatusCode = 404
                $buffer = [System.Text.Encoding]::UTF8.GetBytes('404 - Archivo no encontrado')
                $response.ContentType = 'text/plain; charset=utf-8'
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                continue
            }

            $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
            $contentType = $mimeTypes[$extension]
            if (-not $contentType) {
                $contentType = 'application/octet-stream'
            }

            $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            $response.StatusCode = 200
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
            $response.StatusCode = 500
            $buffer = [System.Text.Encoding]::UTF8.GetBytes("500 - Error interno`n$($_.Exception.Message)")
            $response.ContentType = 'text/plain; charset=utf-8'
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } finally {
            $response.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
