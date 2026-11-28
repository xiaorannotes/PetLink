import {mkdir,readFile,writeFile,cp,copyFile,rename,rm,stat,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const version=pkg.version||'1.0.1';
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

pkg.main='apps/desktop/entry.mjs';
await writeFile(path.join(appResources,'package.json'),JSON.stringify(pkg,null,2)+'\n');

const copyFilter=source=>{const base=path.basename(source);return base!=='node_modules'&&base!=='.DS_Store'&&!base.startsWith('._');};
for(const name of ['apps','packages','characters','assets','extensions']){
 await cp(path.join(root,name),path.join(appResources,name),{
  recursive:true,
  filter:copyFilter
 });
}

await cp(path.join(root,'extensions/petlink-web-bridge'),path.join(folder,'PetLink-浏览器扩展'),{recursive:true,filter:copyFilter});

await mkdir(path.join(appResources,'node_modules'),{recursive:true});
for(const name of ['ws','uiohook-napi','node-gyp-build']){
 await cp(path.join(root,'node_modules',name),path.join(appResources,'node_modules',name),{recursive:true,filter:copyFilter});
}
await access(path.join(appResources,'node_modules/uiohook-napi/prebuilds/win32-x64/uiohook-napi.node'));

await writeFile(path.join(folder,'使用说明-Win.txt'),[
 `PetLink v${version} (Windows x64 版) 使用说明：`,
 '1. 安装完成后可通过桌面快捷方式或开始菜单启动 PetLink。',
 '2. v1.0.1 修复了打开其他软件或浏览器时桌宠偶发被遮挡的问题（采用 screen-saver 最高置顶层级 + 自动守护）。',
 '3. 9 大 AI Agent 一键自动监测：在控制页「首页」点击对应 Agent 的「启用自动监测」即可开启。',
 '4. 网页端 AI（Muse / DeepSeek / 豆包 / Grok）：打开 chrome://extensions 加载安装目录下的「PetLink-浏览器扩展」即可免 Token 自动握手配对。',
 '5. 隐私承诺：100% 本地 SQLite (WITHOUT ROWID) 存储，只记按键类别次数，绝不记录输入正文或窗口标题。',
 '',
 '开源地址：https://github.com/xiaorannotes/PetLink'
].join('\r\n')+'\r\n','utf8');

// Build genuine Windows NSIS Setup Installer (.exe) via makensis
const outExe=path.resolve(root,'../../outputs',`PetLink-Setup-v${version}-x64.exe`);
await rm(outExe,{force:true});
const iconPath=path.join(root,'assets/app-icon.ico');
const nsiPath=path.join(staging,'installer.nsi');

const nsiScript=`
Unicode True
!include "MUI2.nsh"

Name "PetLink v${version}"
OutFile "${outExe}"
InstallDir "$LOCALAPPDATA\\Programs\\PetLink"
InstallDirRegKey HKCU "Software\\PetLink" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ICON "${iconPath}"
!define MUI_UNICON "${iconPath}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\\PetLink.exe"
!define MUI_FINISHPAGE_RUN_TEXT "立即启动 PetLink 桌宠"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Section "PetLink Core" SecMain
  SetOutPath "$INSTDIR"
  ; Gracefully close any running PetLink.exe before upgrading
  nsExec::Exec 'taskkill /F /IM PetLink.exe /T'
  Sleep 400

  File /r "${folder}/*"

  WriteRegStr HKCU "Software\\PetLink" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PetLink" "DisplayName" "PetLink"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PetLink" "DisplayVersion" "${version}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PetLink" "Publisher" "XiaoRan (xiaorannotes)"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PetLink" "DisplayIcon" "$INSTDIR\\PetLink.exe"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PetLink" "UninstallString" '"$INSTDIR\\Uninstall.exe"'
  WriteUninstaller "$INSTDIR\\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\\PetLink"
  CreateShortCut "$SMPROGRAMS\\PetLink\\PetLink.lnk" "$INSTDIR\\PetLink.exe" "" "$INSTDIR\\resources\\app\\assets\\app-icon.ico"
  CreateShortCut "$SMPROGRAMS\\PetLink\\卸载 PetLink.lnk" "$INSTDIR\\Uninstall.exe"
  CreateShortCut "$DESKTOP\\PetLink.lnk" "$INSTDIR\\PetLink.exe" "" "$INSTDIR\\resources\\app\\assets\\app-icon.ico"
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM PetLink.exe /T'
  Sleep 400
  Delete "$DESKTOP\\PetLink.lnk"
  RMDir /r "$SMPROGRAMS\\PetLink"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\\PetLink"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PetLink"
SectionEnd
`;

await writeFile(nsiPath,nsiScript,'utf8');
run('makensis',['-V2',nsiPath]);

console.log(`Packaged Windows folder: ${folder}`);
console.log(`Packaged Windows NSIS installer: ${outExe} (${(await stat(outExe)).size} bytes)`);
