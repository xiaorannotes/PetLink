"""Read only authorized character media, never fork source."""
from pathlib import Path
import json,shutil,subprocess
source=Path.home()/'workspace/ai-buddy-mac/resource-root/assets/pet-characters/claude'
target=Path(__file__).resolve().parents[1]/'characters/xiaodada'
m=json.loads((target/'manifest.json').read_text());m['clips']={}
for name in ['bowl','noodles','handheld','spoon','icecream','drink','candy']:
    clip='eat-'+name;dest=target/clip;dest.mkdir(exist_ok=True)
    for file in ['motion.webm','static-0000.webp','static-0075.webp']:shutil.copyfile(source/clip/file,dest/file)
    m['clips'][clip]={'file':clip+'/motion.webm','durationMs':5000,'fallbackFrames':[clip+'/static-0000.webp',clip+'/static-0075.webp']}
for state,action in [('waiting','waiting'),('error','fail'),('offline','sleep-loop'),('done','jump')]:
    dest=target/'frames'/state/action;dest.mkdir(parents=True,exist_ok=True)
    for stale in dest.glob('frame_*.webp'):stale.unlink()
    subprocess.run(['ffmpeg','-v','error','-c:v','libvpx-vp9','-i',str(source/action/'motion.webm'),'-vf','fps=24,scale=256:280','-c:v','libwebp','-lossless','1',str(dest/'frame_%03d.webp'),'-y'],check=True)
    frames=sorted(dest.glob('frame_*.webp'));assert len(frames)>=(2 if state=='done' else 24)
    previous=[a for a in m['states'][state] if state=='done' and a['name']!=action]
    m['states'][state]=[{'name':action,'fps':24,'loop':state in ['waiting','offline'],'frames':[str(f.relative_to(target)) for f in frames]}]+previous
m['emotions']=[]
for folder in sorted(source.glob('emotion-*')):
    dest=target/'emotions';dest.mkdir(exist_ok=True);file=dest/(folder.name+'.webp');shutil.copyfile(folder/'static-0000.webp',file)
    m['emotions'].append({'name':folder.name,'file':str(file.relative_to(target))})
assert len(m['emotions'])==8
m['placeholder']=False;m['version']='0.6.0'
(target/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
