"""Each fixed video's frames as the reference samples them (`d3_runtime.load_video`: OpenCV's
decoder, 2 frames a second, 4 to 32 spread over the whole video, an odd last one repeated), for
the hosts that read a video as its frames: `<media dir>/<video>.frames/{i:03}.png` and
`times.json`, each frame's time in seconds.

    python frames.py <checkpoint dir> <requests.json> <media dir>
"""

import json
import sys
from pathlib import Path

from PIL import Image


def main():
    checkpoint, requests, media = (Path(arg) for arg in sys.argv[1:4])
    sys.path.insert(0, str(checkpoint))
    from d3_runtime import load_video

    for request in json.loads(requests.read_text()).values():
        for path in request.get("videos", []):
            video = load_video(str(media / path))
            directory = media / f"{path}.frames"
            directory.mkdir(parents=True, exist_ok=True)
            for index, frame in enumerate(video.frames):
                Image.fromarray(frame).save(directory / f"{index:03}.png")
            times = [index / video.fps for index in video.indices]
            (directory / "times.json").write_text(json.dumps(times) + "\n")
            print(f"{path}: {len(times)} frames")


if __name__ == "__main__":
    main()
