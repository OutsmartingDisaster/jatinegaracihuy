# Freebuff SG - one-click Singapore proxy for freebuff
# 1. SSH SOCKS5 tunnel (plink -D) on 127.0.0.1:1080 -> Singapore VPS
# 2. Local HTTP proxy bridge on 127.0.0.1:8888 -> SOCKS5:1080
#    (freebuff/Node rejects socks5:// env, so we expose a plain http:// proxy)
# 3. Launch freebuff with HTTP_PROXY/HTTPS_PROXY = http://localhost:8888

$ErrorActionPreference = "Stop"

$VPS_HOST   = "43.156.83.47"
$VPS_USER   = "rio"
$VPS_PASS   = "pickitup"
$VPS_KEY    = "ssh-ed25519 255 SHA256:6UpPVVAEHa7n5UG7QQmd7JxuvEA9S3mMueZwTrfZsZ4"
$SOCKS_PORT = 1080
$HTTP_PORT  = 8888
$PLINK      = "$env:TEMP\plink.exe"
$PLINK_URL  = "https://the.earth.li/~sgtatham/putty/latest/w64/plink.exe"
$BRIDGE_CJS  = "$PSScriptRoot\freebuff-sg-bridge.cjs"
$BRIDGE_JS   = "$PSScriptRoot\freebuff-sg-bridge.js"
# Prefer .cjs (actual file in repo); fall back to .js for backwards compat
$BRIDGE = if (Test-Path $BRIDGE_CJS) { $BRIDGE_CJS } elseif (Test-Path $BRIDGE_JS) { $BRIDGE_JS } else { $BRIDGE_CJS }

$plinkPid  = $null
$bridgePid = $null

function Write-Step($m){ Write-Host "[*] $m" -ForegroundColor Cyan }
function Write-Ok($m  ){ Write-Host "[+] $m" -ForegroundColor Green }
function Write-Err($m){ Write-Host "[!] $m" -ForegroundColor Red }

function Port-IsListening($port) {
    [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Kill-PortOwner($port) {
    $owner = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty OwningProcess
    if ($owner) {
        Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
    }
}

function Wait-Port($port, $timeoutSecs) {
    $deadline = [DateTime]::UtcNow.AddSeconds($timeoutSecs)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Port-IsListening $port) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

# --- cleanup helper: kills tunnel + bridge on error ---
function Cleanup {
    if ($plinkPid) { Stop-Process -Id $plinkPid -Force -ErrorAction SilentlyContinue }
    if ($bridgePid) { Stop-Process -Id $bridgePid -Force -ErrorAction SilentlyContinue }
}

try {
    # 1. plink
    if (-not (Test-Path $PLINK)) {
        Write-Step "Downloading plink..."
        Invoke-WebRequest -Uri $PLINK_URL -OutFile $PLINK -UseBasicParsing
        Write-Ok "plink downloaded"
    } else { Write-Ok "plink present" }

    # 2. Kill anything already on our ports (use port ownership, NOT CommandLine -
    #    CommandLine is blank on Windows for non-admin processes)
    Write-Step "Clearing old tunnels/bridges..."
    Kill-PortOwner $SOCKS_PORT
    Kill-PortOwner $HTTP_PORT
    Start-Sleep -Seconds 1

    # 3. SOCKS5 tunnel (retry loop, not a single fixed sleep)
    Write-Step "Starting SOCKS5 tunnel to ${VPS_HOST}..."
    $socksArgs = "-ssh -l $VPS_USER -pw $VPS_PASS -batch -no-antispoof -hostkey `"$VPS_KEY`" -D $SOCKS_PORT -N $VPS_HOST"
    $plinkProc = Start-Process -FilePath $PLINK -ArgumentList $socksArgs -WindowStyle Hidden -PassThru
    $plinkPid = $plinkProc.Id
    if (-not (Wait-Port $SOCKS_PORT 10)) {
        throw "SOCKS5 tunnel did not come up on port $SOCKS_PORT. Check VPS connectivity."
    }
    Write-Ok "SOCKS5 tunnel listening on :$SOCKS_PORT"

    # 4. HTTP bridge
    Write-Step "Starting HTTP proxy bridge on :$HTTP_PORT..."
    if (-not (Test-Path $BRIDGE)) {
        throw "Bridge script not found: $BRIDGE (expected freebuff-sg-bridge.cjs next to this .ps1)"
    }
    $nodeExe = (Get-Command node -ErrorAction Stop).Source
    $bridgeProc = Start-Process -FilePath $nodeExe -ArgumentList "`"$BRIDGE`"" -WindowStyle Hidden -PassThru -RedirectStandardOutput "$env:TEMP\freebuff-bridge.out" -RedirectStandardError "$env:TEMP\freebuff-bridge.err"
    $bridgePid = $bridgeProc.Id
    if (-not (Wait-Port $HTTP_PORT 10)) {
        $err = try { Get-Content "$env:TEMP\freebuff-bridge.err" -ErrorAction SilentlyContinue } catch { "" }
        throw "HTTP bridge did not come up on port $HTTP_PORT. stderr: $err"
    }
    Write-Ok "HTTP proxy bridge listening on :$HTTP_PORT"

    # 5. Verify exit IP (best-effort; curl may not be installed)
    Write-Step "Verifying Singapore exit IP via http:// proxy..."
    $env:HTTP_PROXY  = "http://localhost:$HTTP_PORT"
    $env:HTTPS_PROXY = "http://localhost:$HTTP_PORT"
    $curlCmd = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curlCmd) {
        $ip = try { (& curl.exe -4 -sS --max-time 20 "https://ifconfig.me").Trim() } catch { "" }
        if ($ip -eq $VPS_HOST) {
            Write-Ok "Confirmed: traffic exits via Singapore ($ip)"
        } elseif ($ip) {
            Write-Err "Exit IP is '$ip' (expected $VPS_HOST) - proxy may be misconfigured."
        } else {
            Write-Step "Could not verify exit IP (curl timed out or failed). Proxy may still work."
        }
    } else {
        Write-Step "curl not found - skipping IP verification (proxy is listening)."
    }

    # 6. launch freebuff with the http proxy (Node accepts http://, no "unsupported protocol" error)
    Write-Step "Launching freebuff (proxy: http://localhost:$HTTP_PORT)..."
    freebuff
}
catch {
    Write-Err "Failed: $_"
    Cleanup
    exit 1
}
