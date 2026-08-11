<#
    clean‑archive.ps1
    -------------------------------------------------
    • Removes node_modules, .git, android/build, ios/build,
      .expo, .next, and common cache dirs.
    • Deletes .DS_Store, Thumbs.db, .gitignore.
    • Packs the cleaned project into project.zip (no extra root folder).
#>

# ---- 1️⃣ Define folders & files to purge ----
$folders = @(
    'node_modules', '.git', 'android\build', 'ios\build',
    '.expo', '.next', 'Build', 'bin', 'obj'
)
$files   = @('.DS_Store','Thumbs.db','.gitignore')

# ---- 2️⃣ Remove folders ----
foreach ($f in $folders) {
    $path = Join-Path $PSScriptRoot $f
    if (Test-Path $path) {
        Write-Host "Removing folder: $path"
        Remove-Item -Recurse -Force -LiteralPath $path -ErrorAction SilentlyContinue
    }
}

# ---- 3️⃣ Remove junk files (recursive) ----
foreach ($pattern in $files) {
    Get-ChildItem -Path $PSScriptRoot -Recurse -Force -File -Filter $pattern |
        ForEach-Object {
            Write-Host "Removing file: $($_.FullName)"
            Remove-Item -Force -LiteralPath $_.FullName -ErrorAction SilentlyContinue
        }
}

# ---- 4️⃣ Build zip (project.zip) ----
$zip = Join-Path $PSScriptRoot 'project.zip'
if (Test-Path $zip) { Remove-Item -Force $zip }

Add-Type -AssemblyName System.IO.Compression.FileSystem
Start-Sleep -Seconds 2
# Ensure any leftover zip is removed (already handled above)
# Use PowerShell's native compression which gracefully overwrites
Compress-Archive -Path * -DestinationPath $zip -Force
Write-Host "`n✅ Archive created: $zip"
