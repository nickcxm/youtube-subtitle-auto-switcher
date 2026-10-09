import { build } from 'esbuild';
import { patchOpenCv } from './opencv-csp.mjs';
import { mkdir, rm, cp, readdir, readFile, writeFile } from 'node:fs/promises';
await readFile('public/models/bundled.json').catch(()=>{throw new Error('先运行 npm run models 下载官方模型');});
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});
const opencvCsp = {name:'opencv-csp',setup(build){build.onLoad({filter:/opencv\.js$/},async args=>({contents:patchOpenCv(await readFile(args.path,'utf8')),loader:'js'}));}};
const common={plugins:[opencvCsp],bundle:true,target:'chrome116',platform:'browser',minify:true,legalComments:'linked',sourcemap:false,logLevel:'info',define:{'process.env.NODE_ENV':'"production"'},external:['node:*','fs','path','crypto']};
for(const name of ['background','content','bridge','popup'])await build({...common,entryPoints:[`src/${name}.ts`],outfile:`dist/${name}.js`,format:name==='background'?'esm':'iife'});
await build({...common,entryPoints:['src/offscreen.ts'],outfile:'dist/offscreen.js',format:'esm'});
await mkdir('dist/ort',{recursive:true});
for(const file of await readdir('node_modules/onnxruntime-web/dist'))if(file.startsWith('ort-wasm')&&(file.endsWith('.wasm')||file.endsWith('.mjs')))await cp(`node_modules/onnxruntime-web/dist/${file}`,`dist/ort/${file}`);
await cp('LICENSE','dist/LICENSE');
await cp('THIRD_PARTY_NOTICES.md','dist/THIRD_PARTY_NOTICES.md');
await cp('docs/licenses','dist/licenses',{recursive:true});
const runtimePackages=['@paddleocr/paddleocr-js','@techstark/opencv-js','onnxruntime-web','onnxruntime-common','opencc-js','js-yaml','clipper-lib','flatbuffers','long','guid-typescript','platform'];
for(const name of runtimePackages){
  const directory=`node_modules/${name}`;
  let files;try{files=await readdir(directory);}catch{continue;}
  const destination=`dist/licenses/${name.replaceAll('/','-')}`;await mkdir(destination,{recursive:true});
  for(const file of files)if(/^(LICENSE|NOTICE|COPYING|THIRD_PARTY)/i.test(file))await cp(`${directory}/${file}`,`${destination}/${file}`,{recursive:true});
  if(name==='opencc-js')await cp(`${directory}/LICENSES`,`${destination}/LICENSES`,{recursive:true});
}
console.log('加载扩展目录：'+process.cwd()+'/dist');
