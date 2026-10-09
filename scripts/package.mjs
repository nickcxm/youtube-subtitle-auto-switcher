import { rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await rm('youtube-subtitle-auto-switcher.zip',{force:true});
execFileSync('zip',['-q','-r','../youtube-subtitle-auto-switcher.zip','.'],{cwd:'dist',stdio:'inherit'});
console.log('已生成 youtube-subtitle-auto-switcher.zip');
