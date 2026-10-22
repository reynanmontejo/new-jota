$ErrorActionPreference = "Continue"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$defaultQaRoot = Join-Path $env:LOCALAPPDATA "Temp\jota-local-qa-20261020-6b2a069d39b54c30a83daa620617013b"
$qaRoot = if ($env:JOTA_LOCAL_SUPABASE_ROOT) { $env:JOTA_LOCAL_SUPABASE_ROOT } else { $defaultQaRoot }
$configPath = Join-Path $qaRoot "supabase\config.toml"

if (-not (Test-Path $configPath)) {
  Write-Error "The isolated local Supabase test project was not found. No hosted project was changed."
  Write-Host "Expected its config at: $configPath"
  exit 1
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Error "Docker is not running. Start Docker Desktop, then run npm run dev:local-qa again."
  exit 1
}

function Get-LocalSupabaseStatus {
  Push-Location $qaRoot
  try {
    $output = & npx --yes supabase status -o env 2>&1
    $statusCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }

  if ($statusCode -ne 0) { return $null }

  $values = @{}
  foreach ($line in $output) {
    if ([string]$line -match '^\s*([A-Z][A-Z0-9_]*)=(.*)$') {
      $value = $matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
          ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $values[$matches[1]] = $value
    }
  }

  return $values
}

$localStatus = Get-LocalSupabaseStatus
if (-not $localStatus -or -not $localStatus.API_URL) {
  Write-Host "Starting the isolated local Supabase containers..."
  Push-Location $qaRoot
  try {
    $startOutput = & npx --yes supabase start 2>&1
    $startCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }

  if ($startCode -ne 0) {
    Write-Error "Local Supabase could not start. No hosted project was changed."
    exit 1
  }

  $localStatus = Get-LocalSupabaseStatus
}

if (-not $localStatus -or -not $localStatus.API_URL) {
  Write-Error "Could not read local Supabase settings. No hosted project was changed."
  exit 1
}

try { $apiUri = [Uri]$localStatus.API_URL } catch {
  Write-Error "The local Supabase API URL is invalid. No hosted project was changed."
  exit 1
}

if ($apiUri.Scheme -ne "http" -or -not $apiUri.IsLoopback) {
  Write-Error "Safety stop: this command only runs against a loopback HTTP Supabase URL."
  exit 1
}

$publishableKey = $localStatus.PUBLISHABLE_KEY
if (-not $publishableKey) { $publishableKey = $localStatus.ANON_KEY }
$serverKey = $localStatus.SERVICE_ROLE_KEY
if (-not $serverKey) { $serverKey = $localStatus.SECRET_KEY }

if (-not $publishableKey -or -not $serverKey) {
  Write-Error "Local Supabase did not return the required keys. No hosted project was changed."
  exit 1
}

$healthUrl = "{0}/auth/v1/health" -f $apiUri.AbsoluteUri.TrimEnd('/')
$healthCode = & curl.exe -sS -o NUL -w "%{http_code}" $healthUrl 2>$null
if ($LASTEXITCODE -ne 0 -or [string]$healthCode -ne "200") {
  Write-Error "Local Supabase is not healthy at $($apiUri.AbsoluteUri). No hosted project was changed."
  exit 1
}

$previousUrl = $env:NEXT_PUBLIC_SUPABASE_URL
$previousPublishableKey = $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
$previousServerKey = $env:SUPABASE_SERVICE_ROLE_KEY
$runCode = 0

try {
  $env:NEXT_PUBLIC_SUPABASE_URL = $apiUri.AbsoluteUri.TrimEnd('/')
  $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $publishableKey
  $env:SUPABASE_SERVICE_ROLE_KEY = $serverKey

  Set-Location $repoRoot
  Write-Host "Running Jota with the isolated local Supabase backend at $($apiUri.AbsoluteUri)."
  Write-Host "Stop the app with Ctrl+C. Hosted .env.local values are overridden for this run."
  & npm run dev
  $runCode = $LASTEXITCODE
} finally {
  $env:NEXT_PUBLIC_SUPABASE_URL = $previousUrl
  $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $previousPublishableKey
  $env:SUPABASE_SERVICE_ROLE_KEY = $previousServerKey
}

exit $runCode
