import { build } from 'esbuild';
import { mkdir, rm, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
await mkdir('work',{recursive:true});
await build({entryPoints:['src/decision.ts','src/shared.ts','src/models.ts','src/jobs.ts'],outdir:'work/unit',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},logLevel:'silent'});
const {normalize,similarity,Evidence}=await import(pathToFileURL(process.cwd()+'/work/unit/decision.mjs'));
const {effectiveRule,DEFAULTS,isYouTubeWatch}=await import(pathToFileURL(process.cwd()+'/work/unit/shared.mjs'));
const {profileForLanguage}=await import(pathToFileURL(process.cwd()+'/work/unit/models.mjs'));
const execRead=await readFile('node_modules/@techstark/opencv-js/dist/opencv.js','utf8');
let passed=0;
function check(name,fn){fn();passed++;console.log('✓ '+name);}
const line=(text,score=.95,x=100,y=80)=>({text,score,poly:[[x,y],[850,y],[850,y+35],[x,y+35]]});
check('繁简、标点和大小写归一化',()=>assert.equal(normalize('歡迎，觀看！ABC'),normalize('欢迎观看abc')));
check('OCR 少量错字可匹配',()=>assert.ok(similarity('understanding the basics of astronomy','Understanding the basies of astronomy')>.9));
check('短词不触发重复判定',()=>assert.equal(similarity('Hi','Hi'),0));
check('同一句反复取帧不算独立证据',()=>{const e=new Evidence();for(let i=0;i<4;i++)assert.equal(e.add([line('Welcome to our channel')],'Welcome to our channel',960,180),null);});
check('两段不同字幕确认重复',()=>{const e=new Evidence();assert.equal(e.add([line('Welcome to our channel')],'Welcome to our channel',960,180),null);assert.equal(e.add([line('Today we discuss astronomy')],'Today we discuss astronomy',960,180),'duplicate');});
check('低置信度不自动关闭',()=>{const e=new Evidence();for(const t of ['Welcome to our channel','Today we discuss astronomy'])assert.equal(e.add([line(t,.4)],t,960,180),null);});
check('静态水印不作为不同语言字幕',()=>{const e=new Evidence();for(const t of ['Welcome to our channel','Today we discuss astronomy','Let us get started'])assert.equal(e.add([line('欢迎订阅我们的频道')],t,960,180),null);});
check('三段变化且位置稳定的跨文字体系证据',()=>{const e=new Evidence();const hard=['欢迎收看今天的节目','我们一起来了解天文学','现在开始探索宇宙知识'],soft=['Welcome to our channel','Today we discuss astronomy','Let us get started'];for(let i=0;i<3;i++)assert.equal(e.add([line(hard[i])],soft[i],960,180),i===2?'different':null);});
check('视频规则覆盖频道规则，inherit 正确回退',()=>{const s={...DEFAULTS,channelRules:{c:'hide'},videoRules:{v:'show'}};assert.equal(effectiveRule(s,'v','c'),'show');s.videoRules.v='inherit';assert.equal(effectiveRule(s,'v','c'),'hide');});
check('语言模型映射',()=>{assert.equal(profileForLanguage('zh-TW'),'general');assert.equal(profileForLanguage('ko-KR'),'korean');assert.equal(profileForLanguage('ru'),'cyrillic');});
const {patchOpenCv}=await import('./opencv-csp.mjs');
check('OpenCV CSP 适配覆盖全部动态绑定，依赖改变时失败',()=>{const source=execRead;assert.ok(!/new Function\(|new_\(Function,/.test(patchOpenCv(source)));assert.throws(()=>patchOpenCv('changed dependency'));});
const manifest=JSON.parse(await readFile('public/manifest.json','utf8'));
check('仅请求必要权限，没有广域访问或账号服务',()=>{assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.permissions,['storage','offscreen','activeTab','alarms']);assert.equal(manifest.host_permissions.length,2);assert.ok(manifest.host_permissions.every(x=>!x.includes('subtitle.im')));});
const {JobQueue}=await import(pathToFileURL(process.cwd()+'/work/unit/jobs.mjs'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async condition=>{for(let i=0;i<100;i++){if(condition())return;await wait(2);}throw new Error('Async check deadline');};
{
 const q=new JobQueue(10);let unlock;
 const first=q.submit('a',()=>new Promise(resolve=>{unlock=resolve;}));
 const second=q.submit('b',async()=>2);
 await wait(15);assert.equal(q.poll(second,'b').state,'error');
 assert.equal(q.poll(first,'a').state,'running');unlock(1);await until(()=>q.idle);
 assert.equal(q.poll(first,'a').data,1);passed++;console.log('✓ 排队超时不会终止正在运行的另一任务');
}
{
 const q=new JobQueue();let aborted=false;
 const first=q.submit('a',signal=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('cancelled'));})));
 const second=q.submit('b',async()=>42);
 assert.throws(()=>q.poll(first,'wrong-owner'));q.cancel(first,'a');await until(()=>q.idle);
 assert.equal(aborted,true);assert.equal(q.poll(first,'a').state,'error');assert.equal(q.poll(second,'b').data,42);
 passed++;console.log('✓ 取消当前任务后队列继续，其他文档不能读取结果');
}
check('YouTube 目标 URL 精确验证',()=>{assert.equal(isYouTubeWatch('https://www.youtube.com/watch?v=x'),true);assert.equal(isYouTubeWatch('https://www.youtube.com/watchlater'),false);assert.equal(isYouTubeWatch('chrome-extension://id/popup.html'),false);});
await rm('work/unit',{recursive:true,force:true});
console.log(`\n${passed} checks passed`);
