import {transform} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const directory=path.join(path.dirname(fileURLToPath(import.meta.url)),'app/src/main/assets/www');
for(const name of ['app.js','daily.js','kana-data.js','audio-map.js','stroke-data.js']){
  const source=await readFile(path.join(directory,name),'utf8');
  const result=await transform(source,{target:'chrome58',charset:'utf8',minify:false});
  await writeFile(path.join(directory,name),result.code);
}
const compat=await readFile(new URL('compat.js',import.meta.url),'utf8');
let html=await readFile(path.join(directory,'index.html'),'utf8');
// 시작 전 테마 스크립트도 구형 WebView가 읽을 수 있도록 바꿉니다.
html=html.replace(/<script>([\s\S]*?)<\/script>/,(_,script)=>'<script>'+script.replace("JSON.parse(localStorage.getItem('kana-step-v1'))?.settings?.theme","(JSON.parse(localStorage.getItem('kana-step-v1'))||{settings:{}}).settings.theme")+'</script>');
html=html.replace('<script src="kana-data.js"','<script>'+compat+'</script>\n  <script src="kana-data.js"');
await writeFile(path.join(directory,'index.html'),html);
