# AGENTS.md

Rules for coding agents in this repository that are its own. fusor-ai's
`vendor/fusor-ai/AGENTS.md` is the standard and binds here too (`CLAUDE.md`
imports both); this file adds what is particular to this product.

d3-wasm is vLLM Semantic Router's Decision 3.0 models d3-nano and d3-lite
(vllm-sr/d3-nano, vllm-sr/d3-lite): the models, multimodal decision models (a
NaViT vision encoder and Qwen3.5 2B or 0.8B, gated delta rule and gated attention
read both ways, with a readout over answer codes), running in the browser on the
CPU, sealed from the network, answering a request's questions about a state,
images and videos with a probability for every option. The README describes what
it does; don't invent scope, features or options beyond the task.

## Repository

- `vendor/fusor-ai/models/d3/runtime`: the wasm-bindgen surface of the model
  (bundle parts, the request's JSON and its images' and video frames' RGBA pixels
  with their layout in, the response's JSON out), built as four browser runtimes
  that load either size.
- `vendor/fusor-ai/models/d3/cli`: the native CLI `d3` (`compile`, `decide`,
  `bench`, `parity`).
- `app/`: the page, a [fusor](https://github.com/fusor-rs/fusor) app with its own
  Cargo workspace (fusor pins wasm-bindgen 0.2.117, the runtime 0.2.129): the
  request, deciding it, the model size and the live measurements as Rust signals
  in `src/app.rs`, the response drawn as each question's options' probabilities
  in `src/answer.rs`, the example requests in `src/examples.rs`, `examples/` and
  `public/examples/`, the template in `web/index.html`, the engine bridge, the
  image decoding and the video sampling in `web/app.js`, and in `engine/` the
  engine worker, beside the runtimes `just runtimes` builds.
- `scripts/`: the checkpoint and media downloads (pinned, sha256-checked), the
  frames of the fixed video as the reference samples them (`frames.py`), its
  WebM for browsers (`webm.py`), the Node smoke test and the agreement with the
  reference; `e2e/run.mjs`: the headless Chrome run of one size; `fixtures/`: the
  requests and each size's reference responses; `benchmarks/pytorch.py`: the
  reference's speed.
- [fusor-ai](https://github.com/fusor-rs/fusor-ai): the model (`d3`), its
  compiler (`d3-compile`), the kernels, blocks and bundle format come from
  `vendor/fusor-ai`, a git submodule pinned to a commit pushed to fusor-ai, with
  the browser loader and compute pool, the runtime build, the import check and
  the dev server.

What belongs where: model code (the prompt and its answer codes, the tensor
names, the media's patches, the readout and the answers) and anything another
model could reuse go to fusor-ai, following its `AGENTS.md`. This repository
holds what turns the model into an app: the page, the checks against the
reference and the deployment. A change to fusor-ai lands there first; this
repository never patches it.

Constraints that hold everywhere:

- fusor-ai comes only from `vendor/fusor-ai`, never a crates.io version, a
  `[patch]` table or a sibling checkout. The submodule moves to another pushed
  fusor-ai commit in a change of its own, with the parity results and the e2e
  result it gave. No copies of fusor-ai code here.
- The reference is the checkpoint's own runtime (`d3_runtime.py`) at the pinned
  revision, on transformers at the versions the justfile pins, in f32 on the CPU,
  one question per forward pass. Every question's prompt must be the reference's,
  token for token; every fixed question must be decided as the reference decides
  it, in both sizes.
- The page owns every capability: decoding the images, sampling the videos
  (files, drops or pastes) to RGBA frames, caching the bundle (OPFS) and
  measuring itself. The runtime receives the pixels, their layout and the
  request, and does no I/O. Nothing is fetched while deciding.
- The weights are Apache-2.0, derived from Qwen3.5: the page and the README
  credit vLLM Semantic Router with links, and each bundle ships the license and
  notice beside it (`model/<size>/LICENSE`, `NOTICE`). Don't remove them.

## Checks

A change is done only when this passes:

```sh
just check
```

It runs formatting and Clippy on the page and syntax checks of the scripts;
fusor-ai's `just check` covers the runtime and the CLI. A change to the runtime,
the page, the CLI or fusor-ai also needs `just runtimes`, `just smoke`, `just
parity` (the same results as before unless the change is meant to move them) and
`just e2e` for both sizes (`node e2e/run.mjs --size nano`, `--size lite`), which must decide every
fixed question as the reference does, every probability within 0.1 of the
reference's (0.15 for a video, which the page decodes itself); a change meant to move speed also needs `just bench`. The model is
checked stage by stage against the reference goldens by `d3 parity`; extend it
rather than adding a parallel harness.

## Measuring

A speed change is judged on the page (`web-threaded-relaxed`, 8 workers, headless
Chrome through `just e2e`): the time from Decide to the answers. Medians of at
least three fresh-profile runs with their spread and the machine's load average;
a change smaller than the spread is not a result, and nothing else runs on the
machine during a measurement. `d3 bench` explains where the time went, stage by
stage. Numerically every accepted change is bit-exact unless it is meant to move
the numbers: the fixed requests get the same responses, `just parity` prints the
same digits. fusor-ai's `knowledge.md` records what the measurements taught about
V8, the kernels and their stores.

## Commits

- Don't commit, push, tag, release or deploy unless asked.
- Git runs as `andreespirela` here: the local config pins the author, the
  credential user and the remote URL, as in the other fusor repositories. Don't
  change it, and clone fusor repositories with
  `https://andreespirela@github.com/fusor-rs/<name>.git`.
