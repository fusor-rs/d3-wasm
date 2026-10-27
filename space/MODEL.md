---
license: apache-2.0
base_model:
  - vllm-sr/d3-lite
  - vllm-sr/d3-nano
pipeline_tag: image-text-to-text
library_name: fusor-ai
tags:
  - webassembly
  - wasm
  - on-device
---

# Decision 3.0, compiled for the browser

vLLM Semantic Router's Decision 3.0 models, [d3-lite](https://huggingface.co/vllm-sr/d3-lite) in
`lite/` and [d3-nano](https://huggingface.co/vllm-sr/d3-nano) in `nano/`, compiled into
[fusor-ai](https://github.com/fusor-rs/fusor-ai) bundles: the weights the browser runtime of
[d3-wasm](https://github.com/fusor-rs/d3-wasm) loads to decide questions about text, images and
videos on the device's CPU. Try them in the Space
[fusorlabs/d3-wasm](https://huggingface.co/spaces/fusorlabs/d3-wasm).

- **Source:** `vllm-sr/d3-lite` at revision `03560c26f5199c3c04129a2ccb38960c913635e0`, compiled
  with the `q7` profile, every large matrix 7-bit (984 MB); `vllm-sr/d3-nano` at revision
  `462efc366229ea268cf4eed3738b3fc4415e4817`, compiled with the `mix` profile, 4-bit
  feed-forwards and everything else 7-bit (2066 MB).
- **Format:** each `manifest.json` lists every tensor and part; each part is named by its BLAKE3
  hash, which the runtime checks as it loads.
- **Reproduce them:** `just model` in d3-wasm downloads the checkpoints and compiles the same
  bundles.

These are not PyTorch or safetensors checkpoints: they only load in the d3-wasm runtime.

The models are Apache-2.0, built on Qwen3.5; each size ships its LICENSE and NOTICE.
