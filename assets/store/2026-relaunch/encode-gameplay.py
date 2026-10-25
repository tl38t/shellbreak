from pathlib import Path
import re
import subprocess
import sys

LIBS = Path(r"C:\Users\Administrator\AppData\Local\Temp\shellbreak-taptap-video-libs")
sys.path.insert(0, str(LIBS))
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent
FRAMES = Path(r"C:\Users\Administrator\AppData\Local\Temp\shellbreak-taptap-video-frames")
OUTPUT = ROOT / "08-gameplay-recording-1600x900-25s.mp4"
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
command = [
    ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
    "-framerate", "11", "-start_number", "1",
    "-i", str(FRAMES / "frame-%05d.jpg"),
    "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "21",
    "-pix_fmt", "yuv420p", "-r", "15", "-movflags", "+faststart",
    str(OUTPUT),
]
subprocess.run(command, check=True)

probe = subprocess.run([ffmpeg, "-hide_banner", "-i", str(OUTPUT), "-f", "null", "-"],
                       capture_output=True, text=True)
info = probe.stderr
duration = re.search(r"Duration: (\d{2}:\d{2}:\d{2}\.\d{2})", info)
size = OUTPUT.stat().st_size
print(f"Saved {OUTPUT.name}: {size} bytes; reported duration {duration.group(1) if duration else 'unavailable'}")
if size > 500 * 1024 * 1024:
    raise SystemExit("Recording exceeds TapTap mini-game video size limit.")
if not duration or duration.group(1) < "00:00:15.00":
    raise SystemExit("Recording is shorter than TapTap's 15-second minimum.")
