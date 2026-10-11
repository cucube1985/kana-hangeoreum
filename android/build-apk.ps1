param([string]$JavaHome = 'C:\Program Files\Android\Android Studio\jbr', [string]$SdkPath = "$env:LOCALAPPDATA\Android\Sdk")
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path -LiteralPath "$JavaHome\bin\java.exe")) { throw 'JDK 17 이상 설치 경로를 -JavaHome으로 지정하세요.' }
$env:JAVA_HOME = $JavaHome
"sdk.dir=$($SdkPath.Replace('\','/'))" | Set-Content -LiteralPath 'local.properties' -Encoding ascii
if (!(Test-Path -LiteralPath '.signing/kana-release.jks')) {
    New-Item -ItemType Directory -Path '.signing' -Force | Out-Null
    $kanaSigningBytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($kanaSigningBytes)
    $env:KANA_SIGNING_PASSWORD = [Convert]::ToBase64String($kanaSigningBytes)
    & "$JavaHome\bin\keytool.exe" -genkeypair -alias kana -keyalg RSA -keysize 3072 -validity 10000 -keystore '.signing/kana-release.jks' -storepass:env KANA_SIGNING_PASSWORD -keypass:env KANA_SIGNING_PASSWORD -dname 'CN=Kana Hangeoreum, O=Kana Learning, C=KR'
    if ($LASTEXITCODE -ne 0) { throw 'APK 서명 키 생성 실패' }
    "password=$env:KANA_SIGNING_PASSWORD" | Set-Content -LiteralPath '.signing/signing.properties' -Encoding ascii
    Remove-Item Env:KANA_SIGNING_PASSWORD
}
& '.\gradlew.bat' --no-daemon assembleRelease
if ($LASTEXITCODE -ne 0) { throw 'APK 빌드 실패' }
$kanaOutput = Join-Path $PSScriptRoot '..\..\가나한걸음.apk'
Copy-Item -LiteralPath 'app/build/outputs/apk/release/app-release.apk' -Destination $kanaOutput -Force
Write-Output "APK: $kanaOutput"
