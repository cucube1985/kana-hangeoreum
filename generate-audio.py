"""학습 콘텐츠의 일본어 음성 파일을 생성하는 제작 도구. 실행에는 edge-tts 필요."""
import asyncio
import json
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parent

async def main():
    texts = json.loads((ROOT / 'audio-texts.json').read_text(encoding='utf-8'))
    output = ROOT / 'audio'
    output.mkdir(exist_ok=True)
    semaphore = asyncio.Semaphore(10)
    mapping = {text: f'audio/{index:03}.mp3' for index, text in enumerate(texts)}
    completed = 0
    async def create(text, relative):
        nonlocal completed
        async with semaphore:
            path = ROOT / relative
            if not path.exists() or path.stat().st_size < 500:
                for attempt in range(3):
                    try:
                        await edge_tts.Communicate(text, 'ja-JP-NanamiNeural').save(str(path))
                        break
                    except Exception:
                        if attempt == 2:
                            raise
                        await asyncio.sleep(1)
            completed += 1
            if completed % 25 == 0 or completed == len(texts):
                print(f'Audio: {completed}/{len(texts)}', flush=True)
    await asyncio.gather(*(create(text, relative) for text, relative in mapping.items()))
    (ROOT / 'audio-map.js').write_text('const AUDIO_FILES = ' + json.dumps(mapping, ensure_ascii=False) + ';\n', encoding='utf-8')

if __name__ == '__main__':
    asyncio.run(main())
