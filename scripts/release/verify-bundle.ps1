param(
    [Parameter(Mandatory = $true)][string]$Bundle,
    [Parameter(Mandatory = $true)][string]$Bundletool
)
$ErrorActionPreference = 'Stop'
$validation = & java -jar $Bundletool validate "--bundle=$Bundle" 2>&1
if ($LASTEXITCODE -ne 0) {
    $validation | Select-Object -Last 20 | ForEach-Object { Write-Host $_ }
    throw 'bundletool rejected the Android App Bundle.'
}
Write-Host 'Android App Bundle structure validated.'
$expected = @{
    '/manifest/@package' = 'com.fet3d.app'
    '/manifest/@android:versionName' = $env:FET3D_APP_VERSION
    '/manifest/@android:versionCode' = $env:FET3D_ANDROID_VERSION_CODE
}
foreach ($xpath in $expected.Keys) {
    $actual = & java -jar $Bundletool dump manifest "--bundle=$Bundle" "--xpath=$xpath"
    if ($LASTEXITCODE -ne 0 -or ($actual -join '').Trim() -ne $expected[$xpath]) {
        throw "Unexpected bundle manifest value at $xpath"
    }
}
$verification = (& jarsigner '-J-Duser.language=en' -verify $Bundle 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $verification -notmatch 'jar verified\.') {
    throw 'Android App Bundle signature verification failed.'
}
# Check the AAB signer against the intended upload key, including its key password at signing time.
$bundleCert = (& keytool '-J-Duser.language=en' -printcert -jarfile $Bundle 2>&1 | Out-String)
$uploadCert = (& keytool '-J-Duser.language=en' -list -v -keystore $env:FET3D_RELEASE_KEYSTORE_PATH -storepass:env FET3D_RELEASE_STORE_PASSWORD -alias $env:FET3D_RELEASE_KEY_ALIAS 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Could not read upload signing certificate.' }
$bundleSha = [regex]::Match($bundleCert, 'SHA256:\s*([A-F0-9:]+)').Groups[1].Value
$uploadSha = [regex]::Match($uploadCert, 'SHA256:\s*([A-F0-9:]+)').Groups[1].Value
if (-not $bundleSha -or $bundleSha -ne $uploadSha -or $bundleCert -match 'CN=Android Debug') {
    throw 'Bundle is not signed with the intended production upload certificate.'
}
Write-Host "Verified com.fet3d.app $env:FET3D_APP_VERSION ($env:FET3D_ANDROID_VERSION_CODE), upload SHA-256: $uploadSha"
