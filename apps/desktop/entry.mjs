import path from 'node:path';
if(path.basename(process.execPath).toLowerCase()==='petlinktyping.exe')await import('../../packages/typing/main.mjs');else await import('./main.mjs');
