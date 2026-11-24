import {mkdir,readFile,writeFile,cp,copyFile,rename,rm,stat,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const zipName='electron-v42.0.0-win32-x64.zip';
const cache=path.join(root,'dist/.cache');
const archive=path.join(cache,zipName);
const run=(cmd,args,options={})=>execFileSync(cmd,args,{stdio:'inherit',...options});

await mkdir(cache,{recursive:true});
try{
 await access(archive);
}catch{
 const partial=archive+'.partial';
 const urls=[
  `https://registry.npmmirror.com/-/binary/electron/v42.0.0/${zipName}`,
  `https://github.com/electron/electron/releases/download/v42.0.0/${zipName}`
 ];
 let downloaded=false;
 for(const url of urls){
  try{
   console.log(`Downloading ${url}...`);
   run('curl',['--fail','--location','--retry','2','--connect-timeout','20','--max-time','600',url,'-o',partial]);
   run('unzip',['-tq',partial]);
   await rename(partial,archive);
   downloaded=true;
   break;
  }catch(e){
   console.warn(`Mirror failed: ${e.message}`);
  }
 }
 if(!downloaded)throw Error('Failed to download Electron win32-x64 runtime');
}

const staging=path.join(root,'dist/m6-win');
const folder=path.join(staging,'PetLink-Win');
run('rm',['-rf',staging]);
await mkdir(folder,{recursive:true});

run('unzip',['-q',archive,'-d',folder]);
await copyFile(path.join(folder,'electron.exe'),path.join(folder,'PetLink.exe'));
await rm(path.join(folder,'electron.exe'));

const appResources=path.join(folder,'resources/app');
await mkdir(appResources,{recursive:true});

const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
pkg.main='apps/desktop/entry.mjs';
await writeFile(path.join(appResources,'package.json'),JSON.stringify(pkg,null,2)+'\n');

for(const name of ['apps','packages','characters','assets','extensions']){
 await cp(path.join(root,name),path.join(appResources,name),{
  recursive:true,
  filter:source=>path.basename(source)!=='node_modules'
 });
}

await cp(path.join(root,'extensions/petlink-web-bridge'),path.join(folder,'PetLink-浏览器扩展'),{recursive:true});

await mkdir(path.join(appResources,'node_modules'),{recursive:true});
for(const name of ['ws','uiohook-napi','node-gyp-build']){
 await cp(path.join(root,'node_modules',name),path.join(appResources,'node_modules',name),{recursive:true});
}
await access(path.join(appResources,'node_modules/uiohook-napi/prebuilds/win32-x64/uiohook-napi.node'));

await writeFile(path.join(folder,'使用说明-Win.txt'),[
 'PetLink (Windows x64 版) 使用说明：',
 '1. 解压整个文件夹后，双击 PetLink.exe 即可启动（控制窗展示分步启动进度，桌宠大肥鱼置顶显示）。',
 '2. 9 大 AI Agent 一键自动监测：',
 '   - 在控制页「首页」点击对应 Agent 的「启用自动监测」即可开启（支持 Antigravity / Claude Code / Codex / Cursor / DeepSeek / 豆包专业版 / Muse / GrokBot / WorkBuddy）。',
 '   - 针对 Windows 网页端 AI（如 Muse、DeepSeek、豆包、Grok）：打开 Chrome / Edge 扩展管理页 chrome://extensions，开启右上角「开发者模式」，点击「加载已解压的扩展程序」并选择同目录下的「PetLink-浏览器扩展」文件夹，即可免 Token 自动握手配对！',
 '3. 双信号陪伴引擎与像素级鼠标穿透：',
 '   - AI 状态变化（等待输入 / 完成 / 报错 / 工作中）最高优响应；键盘敲击驱动活跃打字陪伴与浮字互动；角色四周透明像素自动穿透鼠标点击，不遮挡屏幕按钮。',
 '4. 键盘热力图、今日陪伴日报与三套主题皮肤：',
 '   - 热力图支持 104 / 87 / 75% 配列与自定义配色；日报支持一键保存高清 PNG；内置蜜桃米白、薄荷奶绿、芋泥星夜三套主题。',
 '5. 隐私承诺：',
 '   - 100% 本地 SQLite (WITHOUT ROWID) 存储，只记按键类别次数，绝不记录输入文本、按键顺序或窗口标题，零云端遥测。',
 '6. 排障提示：',
 '   - 如遇启动异常，请查看同目录或 %APPDATA%\\petlink 下的 boot.log；更新版本前请在任务管理器中结束 PetLink.exe 进程。',
 '',
 '----------------------------------------',
 '开源社区素材致谢与授权声明：',
 '· 大肥鱼（深深）动画素材 — 原始来源 PC2005-cloud/dsh-pet (https://github.com/PC2005-cloud/dsh-pet)',
 '  桌面版整理：MerZlin（dsh-pet-indesktop）',
 '  角色 OC「溟月」© 画师上善无形，以 CC BY-NC-SA 类条款授权，仅限个人非商业使用。',
 '以上素材仅供个人非商业用途，与相关 AI 公司无官方关联。'
].join('\r\n')+'\r\n','utf8');

const outZip=path.resolve(root,'../../outputs','PetLink-Win-x64.zip');
await rm(outZip,{force:true});
// Python zipfile marks non-ASCII entry names as UTF-8 for Windows extractors.
run('python3',['-c',`import pathlib,sys,zipfile
base=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
 for item in [base, *sorted(base.rglob('*'))]:
  archive.write(item, item.relative_to(base.parent).as_posix())
`,folder,outZip]);
console.log(`Packaged Windows folder: ${folder}`);
console.log(`Packaged Windows zip archive: ${outZip} (${(await stat(outZip)).size} bytes)`);
