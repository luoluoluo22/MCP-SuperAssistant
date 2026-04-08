param(
  [string]$Username = "1137583371@qq.com",
  [string]$BaseUrl = "https://dav.jianguoyun.com/dav/",
  [string]$RootPath = "/MCP-SuperAssistant/",
  [string]$PasswordEnvKey = "password"
)

$ErrorActionPreference = "Stop"

function Read-DotEnvValue {
  param(
    [string]$FilePath,
    [string]$Key
  )

  if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "Env file not found: $FilePath"
  }

  $line = Get-Content -LiteralPath $FilePath | Where-Object {
    $_ -match "^\s*$Key\s*="
  } | Select-Object -First 1

  if (-not $line) {
    throw "Key '$Key' not found in $FilePath"
  }

  return ($line -replace "^\s*$Key\s*=\s*", "").Trim()
}

function New-BasicAuthHeader {
  param(
    [string]$User,
    [string]$Password
  )

  $bytes = [System.Text.Encoding]::UTF8.GetBytes("$User`:$Password")
  return "Basic " + [Convert]::ToBase64String($bytes)
}

function Join-WebDavUrl {
  param(
    [string]$Base,
    [string[]]$Parts
  )

  $segments = @($Base.TrimEnd('/'))
  foreach ($part in $Parts) {
    if ($null -ne $part -and $part -ne '') {
      $clean = $part.Trim('/')
      if ($clean) {
        $segments += $clean
      }
    }
  }
  return ($segments -join '/')
}

function Invoke-WebDavRequest {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers,
    [string]$Body = ""
  )

  try {
    $headerArgs = @()
    foreach ($entry in $Headers.GetEnumerator()) {
      $headerArgs += "-H"
      $headerArgs += "$($entry.Key): $($entry.Value)"
    }

    $tempFile = [System.IO.Path]::GetTempFileName()
    $statusToken = "__STATUS__"
    $bodyArgs = @()
    if ($Body) {
      $bodyArgs += "--data-binary"
      $bodyArgs += $Body
    }

    $curlOutput = & curl.exe -sS -X $Method $Url @headerArgs @bodyArgs -o $tempFile -w "${statusToken}%{http_code}"
    $bodyContent = Get-Content -LiteralPath $tempFile -Raw
    Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue

    $statusCode = 0
    if ($curlOutput -match "${statusToken}(\d{3})$") {
      $statusCode = [int]$Matches[1]
    }

    return [pscustomobject]@{
      StatusCode = $statusCode
      StatusDescription = ""
      Body = $bodyContent
    }
  } catch {
    return [pscustomobject]@{
      StatusCode = 0
      StatusDescription = $_.Exception.Message
      Body = ""
    }
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"
$password = Read-DotEnvValue -FilePath $envFile -Key $PasswordEnvKey
$auth = New-BasicAuthHeader -User $Username -Password $password

$commonHeaders = @{
  Authorization = $auth
}

$propfindHeaders = @{
  Authorization = $auth
  Depth = "0"
  "Content-Type" = "application/xml; charset=utf-8"
}

$rootUrl = Join-WebDavUrl -Base $BaseUrl -Parts @($RootPath)
$promptsUrl = Join-WebDavUrl -Base $BaseUrl -Parts @($RootPath, "prompts")
$globalPromptUrl = Join-WebDavUrl -Base $BaseUrl -Parts @($RootPath, "prompts", "global.md")

Write-Host "Testing Nutstore WebDAV endpoints..."
Write-Host "Root URL: $rootUrl"
Write-Host "Prompts URL: $promptsUrl"
Write-Host "Global prompt URL: $globalPromptUrl"

$propfindRoot = Invoke-WebDavRequest -Method "PROPFIND" -Url ($rootUrl + "/") -Headers $propfindHeaders -Body '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/></prop></propfind>'
Write-Host "PROPFIND root => $($propfindRoot.StatusCode) $($propfindRoot.StatusDescription)"

$mkcolRoot = Invoke-WebDavRequest -Method "MKCOL" -Url ($rootUrl + "/") -Headers $commonHeaders
Write-Host "MKCOL root => $($mkcolRoot.StatusCode) $($mkcolRoot.StatusDescription)"

$mkcolPrompts = Invoke-WebDavRequest -Method "MKCOL" -Url ($promptsUrl + "/") -Headers $commonHeaders
Write-Host "MKCOL prompts => $($mkcolPrompts.StatusCode) $($mkcolPrompts.StatusDescription)"

$markdown = @"
# MCP SuperAssistant Global Prompt

Generated at: $(Get-Date -Format o)
"@

$putPrompt = Invoke-WebDavRequest -Method "PUT" -Url $globalPromptUrl -Headers (@{
  Authorization = $auth
  "Content-Type" = "text/markdown; charset=utf-8"
}) -Body $markdown

Write-Host "PUT global prompt => $($putPrompt.StatusCode) $($putPrompt.StatusDescription)"

if ($putPrompt.StatusCode -ge 400) {
  Write-Host "Response body:"
  Write-Host $putPrompt.Body
  exit 1
}

Write-Host "Nutstore WebDAV test completed successfully."
