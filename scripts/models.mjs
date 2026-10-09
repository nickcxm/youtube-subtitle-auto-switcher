import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root='https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/';
const base=['PP-OCRv5_mobile_det','PP-OCRv5_mobile_rec','latin_PP-OCRv5_mobile_rec','devanagari_PP-OCRv5_mobile_rec','arabic_PP-OCRv5_mobile_rec'];
const optional=['korean','cyrillic','thai','greek','tamil','telugu'].map(x=>`${x}_PP-OCRv5_mobile_rec`);
await mkdir('public/models',{recursive:true});
const inventory={};
const checksums=JSON.parse(await readFile(new URL('./model-checksums.json',import.meta.url),'utf8'));
for(const name of [...base,...(process.argv.includes('--all')?optional:[])]) {
  const file=`${name}_onnx_infer.tar`,path=`public/models/${file}`;
  let bytes;
  try {bytes=await readFile(path);} catch {
    console.log(`下载官方模型 ${name}`);
    const res=await fetch(root+file,{signal:AbortSignal.timeout(180000)});
    if(!res.ok)throw new Error(`${name}: HTTP ${res.status}`);
    bytes=Buffer.from(await res.arrayBuffer());
    if(bytes.length<100000||bytes.subarray(257,262).toString()!=='ustar')throw new Error(`无效模型档案：${name}`);
    if(checksums[name]&&checksums[name]!==createHash('sha256').update(bytes).digest('hex'))throw new Error(`模型校验失败：${name}`);
    await writeFile(path+'.tmp',bytes);await rename(path+'.tmp',path);
  }
  const digest=createHash('sha256').update(bytes).digest('hex');
  if(checksums[name]&&checksums[name]!==digest)throw new Error(`模型校验失败：${name}，请检查上游是否更新，勿直接跳过校验`);
  inventory[name]={file,size:bytes.length,sha256:digest,source:root+file};
  console.log(`${name}: ${(bytes.length/1048576).toFixed(1)} MiB`);
}
// Keep previously downloaded optional assets in the inventory.
for(const name of optional){try{const file=`${name}_onnx_infer.tar`,bytes=await readFile(`public/models/${file}`);inventory[name]={file,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),source:root+file};}catch{}}
await writeFile('public/models/bundled.json',JSON.stringify(inventory,null,2));
