import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const forbidden=/^(?:\.env(?:\.|$)|node_modules\/|dist\/|work\/|\.playwright(?:-cli)?\/)|\.(?:pem|key|p12|pfx)$|(?:^|\/)credentials[^/]*\.json$/i;
const patterns=[/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/,/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,/\bAKIA[A-Z0-9]{16}\b/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/,/https?:\/\/[^\s/@]+:[^\s/@]+@/];
const failures=[];
for(const file of files){
 if(forbidden.test(file))failures.push(`${file}: forbidden tracked path`);
 if(/\.(?:png|jpg|woff2|ico)$/.test(file))continue;
 const text=await readFile(file,'utf8');
 for(const pattern of patterns)if(pattern.test(text))failures.push(`${file}: credential-like content`);
}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`Checked ${files.length} tracked files: no forbidden paths or known credential patterns. This is a targeted check, not a guarantee against every secret format.`);
