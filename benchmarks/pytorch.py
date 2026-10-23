"""The reference's speed on this CPU: the checkpoint's own runtime (`d3_runtime.D3`) as it ships,
with its defaults (bf16, 8 questions a pass, its fast path where it applies), deciding each
request of `requests.json` after a warm-up request.

    python pytorch.py <checkpoint dir> <requests.json> <media dir> <threads>
"""

import json
import sys
import time
from pathlib import Path

import torch


def main():
    checkpoint, requests, media = (Path(arg) for arg in sys.argv[1:4])
    torch.set_num_threads(int(sys.argv[4]))
    sys.path.insert(0, str(checkpoint))
    from d3_runtime import D3

    runtime = D3(checkpoint, device="cpu")
    cases = json.loads(requests.read_text())
    for name, request in cases.items():
        def decide():
            return runtime.system_one(
                state=request.get("state"),
                questions=request["questions"],
                images=[str(media / path) for path in request.get("images", [])] or None,
                videos=[str(media / path) for path in request.get("videos", [])] or None,
            )

        decide()
        start = time.perf_counter()
        response = decide()
        seconds = time.perf_counter() - start
        tokens = response["usage"]["input_tokens"]
        print(f"{name}: {tokens} prompt tokens in {seconds:.2f}s ({tokens / seconds:.0f} tokens/s)")


if __name__ == "__main__":
    main()
