"""공식 Google Android 8 에뮬레이터 이미지를 받아 테스트용 AVD를 만듭니다."""
from pathlib import Path
import hashlib
import os
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

sdk = Path(os.environ['LOCALAPPDATA']) / 'Android/Sdk'
metadata = ET.fromstring(urllib.request.urlopen('https://dl.google.com/android/repository/sys-img/google_apis/sys-img2-1.xml').read())
package = next(p for p in metadata.findall('remotePackage') if p.attrib['path'] == 'system-images;android-26;google_apis;x86')
archive = package.find('archives/archive/complete')
target = sdk / 'system-images/android-26/google_apis/x86'
target.mkdir(parents=True, exist_ok=True)
if not (target / 'system.img').exists():
    zip_path = sdk / '.temp/kana-qa-image.zip'
    zip_path.parent.mkdir(exist_ok=True)
    sha = hashlib.sha1()
    count = 0
    with urllib.request.urlopen('https://dl.google.com/android/repository/sys-img/google_apis/' + archive.findtext('url')) as response, zip_path.open('wb') as out:
        while block := response.read(4 * 1024 * 1024):
            out.write(block)
            sha.update(block)
            count += len(block)
            if count % (100 * 1024 * 1024) < len(block):
                print(f'Official image: {count // 1024 // 1024} MB', flush=True)
    if sha.hexdigest() != archive.findtext('checksum'):
        raise ValueError('Google image checksum mismatch')
    with zipfile.ZipFile(zip_path) as archive_zip:
        for entry in archive_zip.infolist():
            parts = Path(entry.filename).parts
            if parts[0] == 'x86':
                parts = parts[1:]
            destination = target.joinpath(*parts).resolve()
            if not destination.is_relative_to(target.resolve()):
                raise ValueError('Invalid archive path')
            if entry.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive_zip.open(entry) as source, destination.open('wb') as out:
                    while block := source.read(4 * 1024 * 1024):
                        out.write(block)
    zip_path.unlink()
avds = Path.home() / '.android/avd'
avd = avds / 'KanaHangeoreumQA.avd'
avd.mkdir(parents=True, exist_ok=True)
(avds / 'KanaHangeoreumQA.ini').write_text(f'avd.ini.encoding=UTF-8\npath={avd}\ntarget=android-26\n', encoding='utf-8')
(avd / 'config.ini').write_text('''avd.ini.encoding=UTF-8
abi.type=x86
hw.cpu.arch=x86
hw.cpu.ncore=2
hw.ramSize=1536
hw.lcd.width=420
hw.lcd.height=900
hw.lcd.density=160
hw.gpu.enabled=yes
hw.gpu.mode=swiftshader_indirect
hw.keyboard=yes
hw.audioInput=no
hw.audioOutput=yes
hw.mainKeys=no
image.sysdir.1=system-images/android-26/google_apis/x86/
tag.id=google_apis
tag.display=Google APIs
disk.dataPartition.size=2G
showDeviceFrame=no
''', encoding='utf-8')
print('KanaHangeoreumQA ready.', flush=True)
