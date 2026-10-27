---
title: d3-wasm
short_description: Decision 3.0 decisions with probabilities, in the browser
sdk: static
app_file: index.html
pinned: false
license: apache-2.0
models:
  - fusorlabs/d3-web
  - vllm-sr/d3-nano
  - vllm-sr/d3-lite
custom_headers:
  cross-origin-embedder-policy: require-corp
  cross-origin-opener-policy: same-origin
  cross-origin-resource-policy: cross-origin
---

Decisions about text, images and videos with vLLM Semantic Router's Decision 3.0 models,
[d3-lite](https://huggingface.co/vllm-sr/d3-lite) and [d3-nano](https://huggingface.co/vllm-sr/d3-nano),
computed on your own CPU in the browser: the model, compiled to WebAssembly with fusor-ai,
downloads once and then runs sealed from the network, answering every question with a
probability for every option. `?size=nano` loads d3-nano instead of d3-lite. The models are
Apache-2.0, built on Qwen3.5; their licenses ship beside the bundles as `model/<size>/LICENSE` and
`model/<size>/NOTICE`. The page's code is MIT; its source is
[github.com/fusor-rs/d3-wasm](https://github.com/fusor-rs/d3-wasm).
