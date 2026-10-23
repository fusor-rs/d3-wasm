# Benchmarks

How fast d3-nano and d3-lite decide on one machine, in the runtimes this project has: the page in
Chrome on eight threads, the single-threaded runtimes in Node, and the reference, the checkpoint's
own runtime on PyTorch, on the CPU. Everything here was measured on 2026-10-23 on the machine
below; nothing is quoted from elsewhere.

The model writes nothing: each question is one forward pass over its own prompt, the request's
images and videos read once by the vision tower and shared by every question. The measure is the
time from Decide to every answer.

## The machine

| | |
|---|---|
| Computer | Apple M4 Pro, 14 cores (10 performance, 4 efficiency), 24 GB |
| OS | macOS 27.0.1 (Darwin 27.0.0) |
| Browser | Chrome headless shell (Playwright), Node 22.16.0 |
| Reference | `d3_runtime.D3` as it ships (bf16, 8 questions a pass), torch 2.9.1, transformers 5.17.0 (`benchmarks/pytorch.py`) |
| Bundles | d3-nano `mix`, 2066 MB: 4-bit feed-forwards, every other large matrix 7-bit; d3-lite `q7`, 984 MB |

Other work loaded the machine through most of the measurements, its 1-minute load average from 4
to over 20 on 14 cores: each table says what it ran beside. Rerun them with `just e2e` (`node
e2e/run.mjs --size nano`), `just smoke` and `just pytorch`.

## The requests

`fixtures/requests.json`, the model card's own examples, each decided by the reference into
`fixtures/references/<size>.json`:

| Request | Questions | Prompt tokens, every question's | Of them, the media's |
|---|---|---:|---:|
| `support`: a support ticket | a choice, a yes or no, a score | 345 | 0 |
| `receipt`: a 1.6-megapixel receipt (`example-receipt.png`) | two choices, a yes or no | 2938 | 868 (289 a question) |
| `clip`: a 4-second clip, 8 frames sampled (`example-video.mp4`) | a choice, a yes or no | 1720 | 720 (360 a question) |

## In Chrome

`just e2e` on eight compute threads: relaxed SIMD in three runs, the median with the range beside
it (one run of each size shared the machine with a dozen busy threads, its slowest times), and
plain SIMD128 in one, loaded. The page samples the video itself from its WebM. The first request
is decided while the model loads, so its time includes the end of the load.

| Request | d3-lite | d3-nano | d3-lite, SIMD128 | d3-nano, SIMD128 |
|---|---:|---:|---:|---:|
| support (with the load) | 2.4 s (2.0–3.1) | 4.1 s (4.0–5.4) | 2.7 s | 6.4 s |
| receipt | 5.4 s (5.4–13.6) | 12.3 s (11.9–14.4) | 13.9 s | 33.6 s |
| clip | 3.2 s (3.0–9.4) | 6.7 s (6.7–15.1) | 7.9 s | 19.5 s |

Every run made no network request after the model was ready, and the revisit loaded the bundle
from the browser's storage in 1.3 s (d3-lite) and 2.3–2.9 s (d3-nano).

## In Node

`just smoke`, single-threaded, relaxed SIMD, with a load average around 5: d3-lite decides the
support ticket in 3.0 s, the receipt in 36 s and the clip in 20 s; d3-nano in 6.6 s, 84 s and 48 s.

## The reference

`just pytorch` on eight threads, after a warm-up request, with a load average from 9 to 14: d3-lite
decides the support ticket in 7.0 s, the receipt in 65 s and the clip in 21 s; d3-nano in 9.0 s,
197 s and 47 s. Its bf16 matrix products run slowly on this CPU; on a GPU, its home, it is far
faster. The native CLI was not measured on a quiet machine, so this page compares no native
numbers.

## Agreement with the reference

`just parity` checks every stage of both sizes against the reference's tensors in f32: every
question's prompt is the reference's, token for token, its last row's state agrees within 3·10⁻⁶,
and its options' probabilities within 10⁻⁶. The vision encoder's output differs by up to 10% (its
attention runs on int8 kernels, and its activations reach the thousands); the merged tokens agree
within 2·10⁻⁶ and the answers within 10⁻³.

Every fixed question of both sizes is decided as the reference decides it, in Chrome, in Node and
natively. The shipped bundles' probabilities differ from the reference's by at most:

| Bundle | Size | support | receipt | clip |
|---|---:|---:|---:|---:|
| d3-nano `q7`, every large matrix 7-bit | 2519 MB | 0.011 | 0.0005 | 0.0013 |
| d3-nano `mix` (shipped), 4-bit feed-forwards | 2066 MB | 0.065 | 0.0016 | 0.0052 |
| d3-lite `q7` (shipped) | 984 MB | 0.022 | 0.0024 | 0.072 |
| d3-lite `mix`, 4-bit feed-forwards | 852 MB | 0.034 | 0.029 | 0.26, the color question decided no |

The clip's color question is d3-lite's closest call (the reference says yes with 0.68): its 4-bit
feed-forwards move it across one half, so d3-lite ships 7-bit. Sampled by the page from the WebM
on plain SIMD128, it moves by up to 0.12 and is still decided yes.

## Download

d3-nano's 2066 MB bundle against its checkpoint's 4427 MB of bf16 weights (47%); d3-lite's 984
MB against its 1706 MB (58%).
