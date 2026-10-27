$ErrorActionPreference = 'Stop'
foreach ($name in @('RUNNER_TEMP', 'GITHUB_ENV', 'ANDROID_UPLOAD_KEYSTORE_BASE64')) {
    if (-not [Environment]::GetEnvironmentVariable($name)) { throw "Missing $name" }
}
$signingFile = Join-Path $env:RUNNER_TEMP 'fet3d-upload.jks'
try {
    $bytes = [Convert]::FromBase64String($env:ANDROID_UPLOAD_KEYSTORE_BASE64)
    [IO.File]::WriteAllBytes($signingFile, $bytes)
} catch {
    throw 'Could not decode the Android upload keystore secret.'
}
"FET3D_RELEASE_KEYSTORE_PATH=$signingFile" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
# Read passwords from env, never from command-line values or checked-in Gradle properties.
& keytool -list -keystore $signingFile -storepass:env FET3D_RELEASE_STORE_PASSWORD -alias $env:FET3D_RELEASE_KEY_ALIAS | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'The upload keystore, alias or store password is invalid.' }
