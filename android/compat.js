// Android 8의 기본 WebView에서도 최신 웹 소스를 실행하기 위한 최소 호환 처리.
if(!Array.prototype.flat)Array.prototype.flat=function(depth){depth=depth===undefined?1:depth;return depth?this.reduce(function(out,item){return out.concat(Array.isArray(item)?item.flat(depth-1):item);},[]):this.slice();};
if(!Array.prototype.flatMap)Array.prototype.flatMap=function(mapper,thisArg){return this.map(mapper,thisArg).flat();};
if(!Element.prototype.replaceChildren)Element.prototype.replaceChildren=function(){while(this.firstChild)this.removeChild(this.firstChild);this.append.apply(this,arguments);};
if(!Blob.prototype.text)Blob.prototype.text=function(){var blob=this;return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(reader.result);};reader.onerror=reject;reader.readAsText(blob);});};
