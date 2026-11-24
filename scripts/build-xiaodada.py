"""Build only from the explicitly authorized neutral asset directory. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json
source=Path.home()/'workspace/petlink-m4-assets/xiaodada/clips'
root=Path(__file__).resolve().parents[1]
target=root/'characters/xiaodada'
states={}
font=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',18)
labels={'idle':'休息中','working':'工作中','waiting':'等你确认','done':'完成啦','error':'好像出错了','offline':'暂时离线'}
for state,action,loop in [('idle','idle',True),('working','typing',True),('done','wave',False),('pet','pet',False),('drag','drag',False)]:
    folder=target/'frames'/state/action; folder.mkdir(parents=True,exist_ok=True)
    pages=[Image.open(source/f'{action}-{i}.webp').convert('RGBA') for i in range(4)]
    for i in range(120):
        page,cell=divmod(i,36); y,x=divmod(cell,6)
        pages[page].crop((x*256,y*280,(x+1)*256,(y+1)*280)).save(folder/f'frame_{i:03}.webp',lossless=True)
    states[state]=[dict(name=action,fps=24,loop=loop,frames=[f'frames/{state}/{action}/frame_{i:03}.webp' for i in range(120)])]
for state,color in [('waiting','#e7b95b'),('error','#e47d8c'),('offline','#9aa5b5')]:
    folder=target/'frames'/state/'placeholder'; folder.mkdir(parents=True,exist_ok=True)
    im=Image.new('RGBA',(256,280)); d=ImageDraw.Draw(im); d.rounded_rectangle((35,80,221,240),25,fill=color); d.text((70,150),labels[state],fill='black',font=font); im.save(folder/'frame_000.webp',lossless=True)
    states[state]=[dict(name='placeholder',fps=1,loop=state!='error',placeholder=True,frames=[f'frames/{state}/placeholder/frame_000.webp'])]
states['sleep']=[dict(states['idle'][0],name='sleep',fps=1,frames=states['idle'][0]['frames'][:1])]
phrases={'idle':'陪你歇一会儿|今天也在这里|慢慢来呀|伸个小懒腰|看看窗外吧|我在你旁边|喝口水吧|安静陪着你','working':'正在努力呀|小手忙起来|认真做事中|一点点推进|马上就有进展|让我专心一下|键盘响起来|一起加油呀','waiting':'等你确认|来看看我呀|需要你帮忙|等你点点头|这一步交给你|我会耐心等|准备好了吗|一起往下走吧','done':'完成啦|这次辛苦啦|可以歇一会儿|事情做好啦|给你一颗星|又前进一步|一起庆祝吧|收工伸懒腰','error':'好像出错了|我们再看看|别着急呀|需要检查一下|先歇一小会|一起找原因|我陪你处理|慢慢就会好','offline':'先休息一下|等你回来呀|暂时没连接|我在这里等|安静趴一会|下次再一起|回来叫我呀|歇歇小手吧'}
manifest=dict(id='xiaodada',name='肖大大（内测）',author='小染',version='0.1.0',license='负责人自有生成素材，仅供 PetLink 内测；未经许可不得再分发',anchor={'x':.5,'y':1},scale=1,placeholder=True,states=states,lines={k:v.split('|') for k,v in phrases.items()})
(target/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
for label,bg in [('transparent',(0,0,0,0)),('dark','#202633'),('light','#f1f4f7')]:
    canvas=Image.new('RGBA',(256*6,330),bg); d=ImageDraw.Draw(canvas)
    for i,state in enumerate(phrases):
        frame=Image.open(target/states[state][0]['frames'][0]); canvas.alpha_composite(frame,(256*i,0)); d.text((256*i+80,295),labels[state],fill='#8090a0',font=font)
    canvas.save(root/f'docs/m4-previews/{label}.png')
print('Built 603 frames and three previews')
