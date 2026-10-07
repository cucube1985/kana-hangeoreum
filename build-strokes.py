"""KanjiVG의 가나 SVG에서 획 경로와 번호 위치를 뽑아 stroke-data.js를 만드는 제작 도구.

필순 데이터 출처: KanjiVG (https://kanjivg.tagaini.net), Ulrich Apel, CC BY-SA 3.0.
실행: python build-strokes.py  (인터넷 필요, 받은 SVG는 .kanjivg-cache 폴더에 보관)
"""
import json
import re
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / '.kanjivg-cache'
SOURCE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{:05x}.svg'


def needed_chars():
    script = ("const d=require('./kana-data.js');const s=new Set();"
              "d.KANA_DATA.forEach(i=>[i.hira,i.kata].forEach(t=>t&&[...t].forEach(c=>s.add(c))));"
              "console.log(JSON.stringify([...s]))")
    return json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT, text=True, encoding='utf-8'))


def fetch(char):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / f'{ord(char):05x}.svg'
    if not path.exists():
        with urllib.request.urlopen(SOURCE.format(ord(char)), timeout=30) as response:
            path.write_bytes(response.read())
    return path.read_text(encoding='utf-8')


def parse(svg):
    strokes = re.findall(r'<path[^>]*?id="kvg:[0-9a-f]+-s\d+"[^>]*?\sd="([^"]+)"', svg)
    numbers = [[round(float(x), 1), round(float(y), 1)] for x, y in
               re.findall(r'<text transform="matrix\(1 0 0 1 ([\d.\-]+) ([\d.\-]+)\)">\d+</text>', svg)]
    return {'s': strokes, 'n': numbers}


def main():
    data, missing = {}, []
    for char in needed_chars():
        try:
            parsed = parse(fetch(char))
        except Exception as error:  # 데이터가 없는 글자는 앱에서 안내 문구를 보여 줘요.
            missing.append(f'{char} ({error})')
            continue
        if parsed['s']:
            data[char] = parsed
        else:
            missing.append(char)
    header = ('/* 가나 필순 데이터. build-strokes.py로 생성 — 직접 고치지 마세요.\n'
              '   출처: KanjiVG (https://kanjivg.tagaini.net), Copyright (C) Ulrich Apel.\n'
              '   라이선스: CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/) — 이 파일도 같은 라이선스를 따릅니다.\n'
              '   형식: 글자 → {s: 획 경로(viewBox 0 0 109 109, 쓰는 순서), n: 획 번호 위치} */\n')
    (ROOT / 'stroke-data.js').write_text(header + 'const STROKE_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f'Strokes: {len(data)} characters' + (f'; missing: {", ".join(missing)}' if missing else ''))


if __name__ == '__main__':
    main()
