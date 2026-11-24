import {mkdir,readFile,writeFile,cp,rename,rm,stat,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arch=process.arch==='x64'?'x64':'arm64';
const zipName=`electron-v42.0.0-darwin-${arch}.zip`;
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
 if(!downloaded)throw Error('Failed to download Electron darwin runtime');
}

const staging=path.join(root,'dist/m6-mac');
const extractDir=path.join(staging,'extracted');
const bundleDir=path.join(staging,'PetLink-Mac');
const appBundle=path.join(bundleDir,'PetLink.app');

run('rm',['-rf',staging]);
await mkdir(extractDir,{recursive:true});
await mkdir(bundleDir,{recursive:true});

// Use macOS ditto to preserve framework symlinks inside Electron.app
run('ditto',['-x','-k',archive,extractDir]);
run('rm',['-rf',appBundle]);
run('mv',[path.join(extractDir,'Electron.app'),appBundle]);
run('rm',['-rf',extractDir]);

const appResources=path.join(appBundle,'Contents/Resources/app');
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

await mkdir(path.join(appResources,'node_modules'),{recursive:true});
for(const name of ['ws','uiohook-napi','node-gyp-build']){
 await cp(path.join(root,'node_modules',name),path.join(appResources,'node_modules',name),{recursive:true});
}
await access(path.join(appResources,`node_modules/uiohook-napi/prebuilds/darwin-${arch}/uiohook-napi.node`));

// Customize Info.plist display name
const plistPath=path.join(appBundle,'Contents/Info.plist');
let plist=await readFile(plistPath,'utf8');
plist=plist
 .replace(/<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/,'<key>CFBundleDisplayName</key>\n\t<string>PetLink</string>')
 .replace(/<key>CFBundleName<\/key>\s*<string>[^<]*<\/string>/,'<key>CFBundleName</key>\n\t<string>PetLink</string>')
 .replace(/<key>CFBundleIdentifier<\/key>\s*<string>[^<]*<\/string>/,'<key>CFBundleIdentifier</key>\n\t<string>petlink.desktop</string>');
await writeFile(plistPath,plist,'utf8');

await writeFile(path.join(bundleDir,'使用说明-Mac.txt'),
`PetLink (macOS 版) 使用说明：
1. 双击 PetLink.app 启动（控制窗先行展示分步启动进度，桌宠窗口置顶显示）。
2. 双信号陪伴引擎：
   - 优先级 1：AI 状态变化（等待输入 / 完成 / 报错 / 工作中）——最高优响应；
   - 优先级 2：键鼠活跃信号（活跃打字 / 短暂空闲 / 5 分钟无操作进入离开睡眠），打字时桌宠弹出原创轻量互动浮字，支持窗口鼠标穿透开关；
   - 优先级 3：陪伴经济系统（积分、商店购买、背包投喂、陪伴分）。
3. 键盘热力图（控制页 → 热力图）：
   - 支持 104 / 87 / 75% 三种配列切换与 4 套预设热力配色 + 自定义颜色选择器。
4. 今日陪伴日报（控制页 → 日报）：
   - 一键生成包含键鼠统计、趣味换算、24 小时节奏曲线、AI 协同工作时长与桌宠陪伴摘要的日报长图，支持保存为本地 PNG 文件。
5. 主题皮肤（控制页顶部或宠物页）：
   - 内置「蜜桃米白（默认）」「薄荷奶绿」「芋泥星夜」3 套可切换皮肤。
6. 隐私承诺：
   - 本地 SQLite (WITHOUT ROWID) 只记聚合次数与时间桶，绝不记录输入内容、按键顺序或窗口标题，不联网上传任何统计数据。
7. 注意：macOS 全局键鼠计数若需跨应用监听，请在「系统设置 → 隐私与安全性 → 辅助功能」中勾选允许 PetLink。

----------------------------------------
开源社区素材致谢与授权声明：
本软件使用的部分角色素材来自开源社区项目，特此致谢：
· 大肥鱼（深深）动画素材 — 原始来源 PC2005-cloud/dsh-pet
  https://github.com/PC2005-cloud/dsh-pet
  桌面版整理：MerZlin（dsh-pet-indesktop）
  角色 OC「溟月」© 画师上善无形，以 CC BY-NC-SA 类条款授权，仅限个人非商业使用
以上素材仅供个人非商业用途，与相关 AI 公司无官方关联。
`,'utf8');

const outZip=path.resolve(root,'../../outputs',`PetLink-Mac-${arch}.zip`);
await rm(outZip,{force:true});
run('ditto',['-c','-k','--sequesterRsrc','--keepParent',bundleDir,outZip]);

// Build native macOS drag-to-Applications .dmg installer
const dmgStage=path.join(staging,'dmg-stage');
run('rm',['-rf',dmgStage]);
await mkdir(dmgStage,{recursive:true});
run('ditto',[appBundle,path.join(dmgStage,'PetLink.app')]);
run('ln',['-s','/Applications',path.join(dmgStage,'Applications')]);
await cp(path.join(bundleDir,'使用说明-Mac.txt'),path.join(dmgStage,'使用说明-Mac.txt'));
const outDmg=path.resolve(root,'../../outputs',`PetLink-Mac-${arch}.dmg`);
await rm(outDmg,{force:true});
run('hdiutil',['create','-volname','PetLink','-srcfolder',dmgStage,'-ov','-format','UDZO',outDmg]);
run('rm',['-rf',dmgStage]);

console.log(`Packaged macOS app bundle: ${appBundle}`);
console.log(`Packaged macOS zip archive: ${outZip} (${(await stat(outZip)).size} bytes)`);
console.log(`Packaged macOS dmg installer: ${outDmg} (${(await stat(outDmg)).size} bytes)`);
