import json
import os
import shutil
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZIP_PATH = ROOT.parent.parent / "大肥鱼动作素材-106段.zip"
OUT_DIR = ROOT / "characters" / "dafeiyu"
CLIPS_DIR = OUT_DIR / "clips"
FRAMES_DIR = OUT_DIR / "frames"

CORE_MAP = {
    "待机呼吸休闲.webm": ("action-idle", "待机呼吸休闲"),
    "写代码.webm": ("action-working", "写代码"),
    "工作状态-思考冒泡.webm": ("action-agent-working", "思考冒泡"),
    "工作状态-原地踱步张望.webm": ("action-waiting", "原地踱步张望"),
    "工作状态-雀跃庆祝.webm": ("action-done", "雀跃庆祝"),
    "工作状态-垂头叹气冒汗.webm": ("action-error", "垂头叹气冒汗"),
    "打瞌睡被惊醒.webm": ("action-offline", "打瞌睡被惊醒"),
    "原地小憩沉眠.webm": ("action-sleep", "原地小憩沉眠"),
    "被鼠标拖拽悬空反馈.webm": ("action-drag", "拖拽悬空反馈"),
    "点击回应-元气挥手.webm": ("pet-wave", "元气挥手"),
    "点击回应-开心跃动.webm": ("pet-jump", "开心跃动"),
    "点击回应-挠痒咯咯笑.webm": ("pet-tickle", "挠痒咯咯笑"),
    "点击回应-害羞惊讶.webm": ("pet-shy", "害羞惊讶"),
    "点击回应-傲娇生气.webm": ("pet-tsundere", "傲娇生气"),
    "吃白饭.webm": ("eat-bowl", "吃白饭"),
    "吃长寿面.webm": ("eat-noodles", "吃长寿面"),
    "大口吃零食.webm": ("eat-handheld", "大口吃零食"),
    "吃糖葫芦.webm": ("eat-candy", "吃糖葫芦"),
    "吃西瓜.webm": ("eat-drink", "吃西瓜"),
    "吃腊八粥.webm": ("eat-spoon", "吃腊八粥"),
    "吃冰淇淋融化.webm": ("eat-icecream", "吃冰淇淋融化"),
}

if OUT_DIR.exists():
    shutil.rmtree(OUT_DIR)
CLIPS_DIR.mkdir(parents=True, exist_ok=True)
FRAMES_DIR.mkdir(parents=True, exist_ok=True)

def probe_duration_ms(path: Path) -> int:
    try:
        out = subprocess.check_output([
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(path)
        ], text=True).strip()
        val = float(out)
        if val > 0:
            return max(1000, int(round(val * 1000)))
    except Exception:
        pass
    return 5000

def extract_frame(webm_path: Path, png_path: Path):
    png_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.check_call([
        "ffmpeg", "-v", "error", "-y",
        "-c:v", "libvpx-vp9",
        "-i", str(webm_path),
        "-frames:v", "1",
        "-pix_fmt", "rgba",
        str(png_path)
    ])

clips = {}
clip_labels = {}
bonus_idx = 0

with zipfile.ZipFile(ZIP_PATH) as z:
    entries = []
    for info in z.infolist():
        try:
            decoded = info.filename.encode("cp437").decode("utf-8")
        except Exception:
            decoded = info.filename
        if decoded.endswith(".webm"):
            entries.append((info, decoded))

    for info, decoded in entries:
        base_name = os.path.basename(decoded)
        if base_name in CORE_MAP:
            clip_id, label = CORE_MAP[base_name]
        else:
            bonus_idx += 1
            clip_id = f"bonus-{bonus_idx:03d}"
            label = base_name[:-5]

        webm_rel = f"clips/{clip_id}.webm"
        frame_rel = f"frames/{clip_id}.png"
        webm_abs = OUT_DIR / webm_rel
        frame_abs = OUT_DIR / frame_rel

        with open(webm_abs, "wb") as f:
            f.write(z.read(info))

        extract_frame(webm_abs, frame_abs)
        duration_ms = probe_duration_ms(webm_abs)
        clips[clip_id] = {
            "file": webm_rel,
            "durationMs": duration_ms,
            "fallbackFrames": [frame_rel],
        }
        clip_labels[clip_id] = label

def state_entry(name: str, clip_id: str, loop: bool):
    return {
        "name": name,
        "fps": 60,
        "loop": loop,
        "clip": clip_id,
        "durationMs": clips[clip_id]["durationMs"],
        "frames": clips[clip_id]["fallbackFrames"],
    }

manifest = {
    "id": "dafeiyu",
    "name": "大肥鱼",
    "author": "小染",
    "version": "1.0.0",
    "license": "原创角色素材，供 PetLink 使用",
    "anchor": {"x": 0.5, "y": 1},
    "scale": 1,
    "placeholder": False,
    "states": {
        "idle": [state_entry("idle", "action-idle", True)],
        "working": [state_entry("typing", "action-working", True)],
        "agent-working": [state_entry("agent-working", "action-agent-working", True)],
        "waiting": [state_entry("waiting", "action-waiting", True)],
        "done": [state_entry("jump", "action-done", False)],
        "error": [state_entry("fail", "action-error", False)],
        "offline": [state_entry("sleep-loop", "action-offline", False)],
        "sleep": [state_entry("sleep", "action-sleep", True)],
        "drag": [state_entry("drag", "action-drag", True)],
        "pet": [
            state_entry("pet-wave", "pet-wave", False),
            state_entry("pet-jump", "pet-jump", False),
            state_entry("pet-tickle", "pet-tickle", False),
            state_entry("pet-shy", "pet-shy", False),
            state_entry("pet-tsundere", "pet-tsundere", False),
        ],
    },
    "clips": clips,
    "clipLabels": clip_labels,
    "lines": {
        "idle": [
            "大肥鱼吐个泡泡陪你~",
            "今天也要游得开心呀",
            "歇一会儿再出发吧",
            "水波晃呀晃，真舒服",
            "摸摸鱼也没关系哦",
            "随时叫大肥鱼就好",
            "在桌面安安静静陪着你",
            "需要帮忙的时候喊我~"
        ],
        "working": [
            "大肥鱼也在努力敲代码！",
            "噼里啪啦，灵感涌出来啦",
            "节奏超稳，继续加油~",
            "认真干活的样子最帅气",
            "咕噜咕噜，全速推进中",
            "键盘响起来，思路跟着飞",
            "专心致志，大肥鱼陪跑中",
            "这一波操作稳稳的！"
        ],
        "waiting": [
            "大肥鱼等你确认哟~",
            "这边需要你点个头呀",
            "来回踱步等你回来",
            "准备好了，等你拍板！",
            "有新进度等你看看~",
            "眨眨眼，等你发指令",
            "快来看看这一步对不对",
            "大肥鱼乖乖在这里等你"
        ],
        "done": [
            "耶！大肥鱼为你欢呼！",
            "搞定啦，奖励自己一口零食~",
            "完美收工，撒花庆祝！",
            "太棒了，这一轮大成功！",
            "任务完成，气泡都变甜了",
            "顺利通关，开心转圈圈~",
            "大肥鱼拍手叫好！",
            "又完成一件大事啦！"
        ],
        "error": [
            "哎呀，好像遇到小波折了",
            "别慌，大肥鱼陪你一起排查",
            "冒汗了，快看看哪里卡住了",
            "深呼吸，我们慢慢修好它",
            "遇到一个小 Bug，马上拿下",
            "有点棘手，一起想想办法",
            "没关系，调整一下再试一次",
            "大肥鱼给你递擦汗毛巾~"
        ],
        "offline": [
            "先打个盹儿，回头见~",
            "连接休息啦，有事再喊我",
            "大肥鱼先去水里泡一会儿",
            "暂时离线，保持好心情哦",
            "收工休息，记得多喝水",
            "挥挥鳍，下次继续一起玩",
            "任务告一段落，放松一下",
            "大肥鱼随时待命回来~"
        ]
    }
}

(OUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Built dafeiyu character package with {len(clips)} clips at {OUT_DIR}")
