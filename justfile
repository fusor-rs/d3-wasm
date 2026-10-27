# vLLM Semantic Router's d3-nano and d3-lite in the browser. `just ui` builds everything, both
# models included, and serves the page; `just build` then `just serve` do the same in two steps.

import 'vendor/fusor-ai/just/product.just'

name := "d3"
sizes := "nano lite"
# Each size's shipped profile: d3-lite's 4-bit feed-forwards move an uncertain yes-or-no across
# one half (benchmarks.md), so it keeps 7 bits.
profile_nano := "mix"
profile_lite := "q7"
# d3-nano's bundle is 2.1 GB, its activations up to another 0.7 GB.
export MAX_MEMORY := "4294967296"
checkpoints := env_var_or_default("CHECKPOINTS", ".cache")
goldens := "fixtures/goldens"
media := "fixtures/media"
# The reference the goldens come from (vendor/fusor-ai/models/d3/reference): the checkpoint's own
# runtime on transformers, pinned.
reference := "uv run --no-project --python 3.12 --with transformers==5.17.0 --with torch==2.9.1 --with torchvision==0.24.1 --with numpy==2.5.4 --with pillow==13.0.0 --with opencv-python-headless==5.0.0.93 --with safetensors==0.8.0 --with huggingface-hub==1.33.0 --with accelerate==1.15.0 python"

host:
    bash -n scripts/fetch-checkpoint.sh
    bash -n scripts/fetch-media.sh
    python3 -m py_compile scripts/frames.py
    python3 -m py_compile scripts/webm.py
    python3 -m py_compile benchmarks/pytorch.py
    node --check app/web/app.js
    node --check app/engine/worker.js
    node --check scripts/node-smoke.mjs
    node --check scripts/agreement.mjs
    node --check e2e/run.mjs
    node --check scripts/render-images.mjs

# Downloads each size's pinned checkpoint (4.4 GB and 1.7 GB, sha256-checked) unless it is already
# there, then compiles its bundle into dist/model/<size>, its license and notice beside it.
model: native
    for size in {{sizes}}; do \
      scripts/fetch-checkpoint.sh {{checkpoints}}/checkpoint-$size $size || exit 1; \
      rm -rf {{model}}/$size; \
      profile=$([ $size = nano ] && echo {{profile_nano}} || echo {{profile_lite}}); \
      target/release/d3 compile {{checkpoints}}/checkpoint-$size {{model}}/$size --profile $profile || exit 1; \
      cp {{checkpoints}}/checkpoint-$size/LICENSE {{checkpoints}}/checkpoint-$size/NOTICE {{model}}/$size/; \
    done

# Try it on localhost. The bundles and the runtimes are rebuilt every time (incremental, seconds
# when nothing changed), so they always come from the same fusor-ai.
ui: model runtimes page serve

# The fixed media the checks read: the model card's own example image and video at a pinned
# revision (sha256-checked), the video's frames as the reference samples them, and the video as
# browsers decode it (VP9, lossless), which the page's example and `just e2e` read.
media:
    scripts/fetch-media.sh {{media}}
    scripts/fetch-checkpoint.sh {{checkpoints}}/checkpoint-lite lite
    test -f {{media}}/example-video.mp4.frames/times.json || {{reference}} scripts/frames.py {{checkpoints}}/checkpoint-lite fixtures/requests.json {{media}}
    test -f {{media}}/example-video.webm || uv run --no-project --python 3.12 --with imageio-ffmpeg==0.6.0 python scripts/webm.py fixtures/requests.json {{media}}

# Every stage of both sizes against the reference's goldens (vendor/fusor-ai/models/d3/reference).
parity: model media
    for size in {{sizes}}; do \
      test -f {{goldens}}/$size/golden_f32_support.safetensors || just goldens; \
      target/release/d3 parity {{model}}/$size {{goldens}}/$size/golden_f32_support.safetensors {{goldens}}/$size/golden_f32_receipt.safetensors {{goldens}}/$size/golden_f32_clip.safetensors || exit 1; \
    done

# Golden tensors of every request for both sizes, and the reference's response to each
# (fixtures/references/<size>.json), from the reference in f32 on the CPU.
goldens: media
    for size in {{sizes}}; do \
      scripts/fetch-checkpoint.sh {{checkpoints}}/checkpoint-$size $size || exit 1; \
      {{reference}} {{fusor_ai}}/models/d3/reference/dump.py {{checkpoints}}/checkpoint-$size fixtures/requests.json {{media}} {{goldens}}/$size fixtures/references/$size.json || exit 1; \
    done

bench size="nano": native media
    target/release/d3 bench {{model}}/{{size}} fixtures/requests.json receipt --media {{media}}

# The reference's speed on this CPU (benchmarks/pytorch.py), on the same requests as `just e2e`,
# with as many threads as the page's compute workers.
pytorch size="nano" threads="8": media
    scripts/fetch-checkpoint.sh {{checkpoints}}/checkpoint-{{size}} {{size}}
    {{reference}} benchmarks/pytorch.py {{checkpoints}}/checkpoint-{{size}} fixtures/requests.json {{media}} {{threads}}

# Its tensor parts are named by their BLAKE3, so /model/parts/ can be cached as immutable.
# The page, its four runtimes and the bundle beside it, as a static site in target/site.
site: runtimes page
    rm -rf target/site
    mkdir -p target/site
    cp -R {{app}}/dist/. target/site/
    find target/site -name '.fusor-*.json' -delete
    for size in {{sizes}}; do \
      node scripts/site-bundle.mjs {{model}}/$size target/site/model/$size && \
      cp {{model}}/$size/LICENSE {{model}}/$size/NOTICE target/site/model/$size/ || exit 1; \
    done

# The Space holds at most 1 GB, so it gets the page, the runtimes and the model's licenses, and the
# page loads the bundle from the model repo fusorlabs/d3-web (`just deploy-model`). The Space must
# already exist as a static Space: creating it with the upload makes a Gradio Space, which
# Hugging Face refuses for a free organization.
# The site to the Hugging Face Space fusorlabs/d3-wasm, configured by space/README.md.
deploy-space: site
    #!/usr/bin/env bash
    set -euo pipefail
    rm -rf target/space
    rsync -a --exclude /model target/site/ target/space/
    rsync -a --include '*/' --include 'LICENSE*' --include NOTICE --exclude '*' target/site/model/ target/space/model/
    cp space/README.md target/space/
    uv run --no-project --with huggingface_hub==0.36.2 python - target/space <<'PY'
    import sys
    from huggingface_hub import HfApi

    HfApi().upload_folder(
        repo_id="fusorlabs/d3-wasm",
        repo_type="space",
        folder_path=sys.argv[1],
        delete_patterns="*",
        commit_message="Deploy d3-wasm {{version}}",
    )
    PY

# Deploy it before the Space whenever the bundle changes: the runtime only loads a bundle compiled
# with the same fusor-ai.
# The site's bundle, with space/MODEL.md as its card, to the model repo fusorlabs/d3-web.
deploy-model: site
    #!/usr/bin/env bash
    set -euo pipefail
    cp space/MODEL.md target/site/model/README.md
    uv run --no-project --with huggingface_hub==0.36.2 python - target/site/model <<'PY'
    import sys
    from huggingface_hub import HfApi

    api = HfApi()
    api.create_repo("fusorlabs/d3-web", exist_ok=True)
    api.upload_folder(
        repo_id="fusorlabs/d3-web",
        folder_path=sys.argv[1],
        delete_patterns="*",
        commit_message="Deploy the d3-wasm {{version}} bundle",
    )
    PY

# The fixed inputs the checks read.
fixtures: media
