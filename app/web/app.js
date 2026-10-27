import { ComputePool, SPAWN_COMPUTE } from '../../vendor/fusor-ai/packages/host/compute.js';

// The engine bridge. The page's state lives in Rust (src/app.rs); this module owns the engine
// worker and, in threaded builds, its compute workers (fusor-ai's ComputePool), and the media:
// images chosen, dropped or pasted are decoded here to RGBA pixels, and videos sampled to frames
// as the reference samples them (2 a second, 4 to 32 spread over the whole video), each drawn as
// a thumbnail, then handed to the engine worker with the request when Decide is pressed. It
// measures each decision and reports back with `engine` events.

const params = new URLSearchParams(location.search);
const cores = navigator.hardwareConcurrency || 4;
// One compute worker per core minus two (the page and the engine worker), at most 8; `?threads=1`
// forces the single-threaded build. Never more than the cores: the barriers spin.
const requestedThreads = Number.parseInt(params.get('threads') ?? '', 10);
const THREADS = Math.min(cores, requestedThreads > 0 ? requestedThreads : Math.max(1, Math.min(8, cores - 2)));
// The model size (`?size=nano`, d3-lite unless asked), its bundle served next to the page
// (`just serve` mounts dist/model there); `?model=<url>` loads another one, `?build=web-single`
// pins a runtime build.
const SIZES = ['lite', 'nano'];
const SIZE = SIZES.includes(params.get('size')) ? params.get('size') : SIZES[0];
// A Hugging Face Space holds at most 1 GB, so the Space loads the bundle from the model repo
// fusorlabs/d3-web (`just deploy-model`) instead of from beside the page.
const HOSTED_MODEL = 'https://huggingface.co/fusorlabs/d3-web/resolve/main/';
const DEFAULT_MODEL = location.hostname.endsWith('.hf.space') ? HOSTED_MODEL : 'model/';
const MODEL_URL = new URL(params.get('model') ?? `${DEFAULT_MODEL}${SIZE}/`, document.baseURI).href;
// The runtime's limits (`d3::session::MAX_IMAGES`, `MAX_VIDEOS`) and the reference's sampling
// (`d3_runtime`'s `VIDEO_FPS`, `VIDEO_MIN_FRAMES`, `VIDEO_MAX_FRAMES`).
const MAX_IMAGES = 8;
const MAX_VIDEOS = 4;
const SAMPLES_PER_SECOND = 2;
const MIN_FRAMES = 4;
const MAX_FRAMES = 32;
// The frames a video's rate is measured over, and the rate assumed where it cannot be.
const RATE_FRAMES = 6;
const DEFAULT_RATE = 24;
// Merged patches per language-model token.
const MERGED = 4;

const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

export function onMount({ root, inputs, onCleanup }) {
  const report = (detail) => root.dispatchEvent(new CustomEvent('engine', { detail: JSON.stringify(detail) }));
  const engine = new Worker(new URL('engine/worker.js', document.baseURI), { type: 'module', name: 'd3-engine' });
  const computePool = new ComputePool(crash);
  let build = null;
  let notice = '';
  let loaded = false;
  let broken = false;
  let jobs = 0;
  let job = null;
  let media = [];
  let added = 0;
  let readyAt = Infinity;

  const handlers = {
    [SPAWN_COMPUTE]: (message) => computePool.spawn(message),
    runtime: (message) => (build = message),
    warning: ({ message }) => {
      console.warn(message);
      notice = ` (${message})`;
    },
    progress: ({ done, total, network, cache }) => {
      const source = cache && !network ? 'from this device' : cache ? `${mb(network)} downloaded, ${mb(cache)} cached` : 'downloading';
      report({ type: 'loading', fraction: done / total, detail: `${mb(done)} / ${mb(total)} · ${source}` });
    },
    ready: ({ ms, cache, total }) => {
      loaded = true;
      readyAt = performance.now();
      const loadedInfo = { build: `${build.build}${notice}`, threads: build.threads, bundle_bytes: total, load_ms: ms, from_device: cache === total };
      report({ type: 'ready', loaded: loadedInfo });
    },
    started: (message) => {
      if (message.job !== job?.id) return;
      job.plan = message.plan;
      const seen = message.plan.media.images.length + message.plan.media.videos.length;
      const status = seen ? 'Looking at the images and videos…' : 'Reading the questions…';
      report({ type: 'progress', status, fraction: 0, metrics: metrics() });
    },
    step: (message) => {
      if (message.job !== job?.id) return;
      if (message.stage === 'see') job.seenAt = performance.now();
      const status = message.stage === 'see' ? 'Looking at the images and videos…' : `Answering · ${message.done} of ${message.steps} steps`;
      report({ type: 'progress', status, fraction: message.done / message.steps, metrics: metrics(message) });
    },
    done: (message) => {
      if (message.job !== job?.id) return;
      job.doneAt = performance.now();
      job.inputTokens = message.response?.usage.input_tokens ?? 0;
      const response = message.stopped ? '' : JSON.stringify(message.response, null, 2);
      report({ type: 'done', response, status: message.stopped ? 'Stopped.' : 'Done.', metrics: metrics(message) });
      job = null;
    },
    error: ({ message }) => {
      if (!loaded) return fail(message);
      job = null;
      report({ type: 'error', message });
    },
    fatal: ({ message }) => fail(message),
  };

  engine.onmessage = ({ data }) => {
    if (!broken) handlers[data.type]?.(data);
  };
  engine.onerror = (event) => crash(event.message || 'the engine worker failed');
  engine.postMessage({ type: 'load', modelUrl: MODEL_URL, threads: THREADS, build: params.get('build') });
  report({ type: 'size', size: SIZE });

  /** Decodes `files`, images to RGBA pixels as stored and videos to sampled frames, and adds them. */
  async function add(files) {
    if (job) return;
    for (const file of files) {
      const video = file.type.startsWith('video/');
      const count = media.filter((medium) => Boolean(medium.times) === video).length;
      if (count === (video ? MAX_VIDEOS : MAX_IMAGES)) {
        report({ type: 'error', message: `at most ${MAX_IMAGES} images and ${MAX_VIDEOS} videos` });
        continue;
      }
      try {
        const decoded = video ? await sampleVideo(file) : await decodeImage(file);
        media.push({ index: added++, name: file.name || 'pasted image', ...decoded });
      } catch (error) {
        report({ type: 'error', message: `could not read ${file.name || 'the file'} (${error?.message ?? error})` });
      }
    }
    listMedia();
  }

  /** Replaces the media with the files at `paths` under /examples/. */
  async function attach() {
    clear();
    const paths = JSON.parse(inputs.attach.get());
    const files = await Promise.all(
      paths.map(async (path) => {
        const blob = await (await fetch(new URL(`examples/${path}`, document.baseURI))).blob();
        return new File([blob], path, { type: blob.type });
      }),
    );
    await add(files);
  }

  function listMedia() {
    const listed = media.map(({ index, name, width, height, frames }) => ({ index, name, width, height, frames: frames?.length }));
    report({ type: 'media', media: listed });
  }

  /** Draws each image or video's first frame into its thumbnail once the page has drawn the canvas for it. */
  function drawThumbnails() {
    for (const canvas of root.querySelectorAll('canvas[data-medium]')) {
      const medium = media.find((entry) => String(entry.index) === canvas.dataset.medium);
      if (!medium || canvas.dataset.drawn === canvas.dataset.medium) continue;
      canvas.dataset.drawn = canvas.dataset.medium;
      const scale = Math.min(1, (96 * devicePixelRatio) / medium.height);
      canvas.width = Math.round(medium.width * scale);
      canvas.height = Math.round(medium.height * scale);
      canvas.getContext('2d').drawImage(medium.bitmap, 0, 0, canvas.width, canvas.height);
    }
  }

  function decide() {
    job = { id: ++jobs, t0: performance.now(), seenAt: null, doneAt: null, plan: null, inputTokens: 0 };
    const images = media.filter((medium) => !medium.times);
    const videos = media.filter((medium) => medium.times);
    const pictures = [...images.map((image) => image.rgba), ...videos.flatMap((video) => video.frames)];
    const rgba = new Uint8Array(pictures.reduce((sum, values) => sum + values.length, 0));
    let at = 0;
    for (const values of pictures) {
      rgba.set(values, at);
      at += values.length;
    }
    const layout = JSON.stringify({
      images: images.map(({ width, height }) => [width, height]),
      videos: videos.map(({ width, height, times }) => ({ width, height, times })),
    });
    engine.postMessage({ type: 'decide', job: job.id, request: inputs.request.get(), rgba, layout }, [rgba.buffer]);
  }

  function stop() {
    if (job) engine.postMessage({ type: 'stop', job: job.id });
  }

  function clear() {
    for (const medium of media) medium.bitmap.close();
    media = [];
    listMedia();
  }

  async function copy() {
    const text = root.querySelector('#response')?.textContent ?? '';
    await navigator.clipboard.writeText(text).catch(() => {}); // a refused clipboard has nothing to report
  }

  function metrics(message = {}) {
    const ownRequests = performance.getEntriesByType('resource').filter((entry) => entry.startTime >= readyAt).length;
    const plan = job?.plan;
    const tokens = (rows, columns) => (rows * columns) / MERGED;
    const imageTokens = (plan?.media.images ?? []).reduce((sum, [rows, columns]) => sum + tokens(rows, columns), 0);
    const videoTokens = (plan?.media.videos ?? []).reduce((sum, [groups, rows, columns]) => sum + groups * tokens(rows, columns), 0);
    const readFrom = job?.seenAt ?? job?.t0;
    return {
      total_ms: job?.doneAt ? job.doneAt - job.t0 : null,
      prompt_tokens: job?.inputTokens ?? 0,
      media_tokens: imageTokens + videoTokens,
      reading_ms: job?.doneAt && readFrom ? job.doneAt - readFrom : 0,
      requests: ownRequests + (message.networkRequests ?? 0),
    };
  }

  /** The model could not load, or the engine or a compute thread died. */
  function fail(message) {
    broken = true;
    engine.terminate();
    computePool.terminate();
    report({ type: 'broken', message });
  }

  function crash(message) {
    fail(`The engine stopped: ${message}.`);
  }

  const file = root.querySelector('#file');
  const isMedia = (type) => type.startsWith('image/') || type.startsWith('video/');
  const onFile = () => {
    add([...file.files]);
    file.value = '';
  };
  const onDrop = (event) => {
    event.preventDefault();
    add([...(event.dataTransfer?.files ?? [])].filter((entry) => isMedia(entry.type)));
  };
  const onDragOver = (event) => event.preventDefault();
  const onPaste = (event) => {
    const items = [...(event.clipboardData?.items ?? [])].filter((entry) => isMedia(entry.type));
    if (items.length) add(items.map((item) => item.getAsFile()));
  };
  const thumbnails = new MutationObserver(drawThumbnails);
  thumbnails.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-medium'] });
  file.addEventListener('change', onFile);
  root.addEventListener('drop', onDrop);
  root.addEventListener('dragover', onDragOver);
  document.addEventListener('paste', onPaste);
  onCleanup(onClicks(inputs.decides, decide));
  onCleanup(onClicks(inputs.stops, stop));
  onCleanup(onClicks(inputs.clears, clear));
  onCleanup(onClicks(inputs.copies, copy));
  onCleanup(onClicks(inputs.attaches, attach));
  onCleanup(() => {
    file.removeEventListener('change', onFile);
    root.removeEventListener('drop', onDrop);
    root.removeEventListener('dragover', onDragOver);
    document.removeEventListener('paste', onPaste);
    thumbnails.disconnect();
    engine.terminate();
    computePool.terminate();
  });
}

/** An image's RGBA pixels as stored (no color conversion), and its bitmap. */
async function decodeImage(file) {
  const bitmap = await createImageBitmap(file, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  return { width: bitmap.width, height: bitmap.height, rgba: pixels(bitmap, bitmap.width, bitmap.height), bitmap };
}

/** The RGBA pixels of `source` drawn at `width × height`. */
function pixels(source, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height, { colorSpace: 'srgb' }).data;
}

/**
 * A video's frames as the reference samples them: of its `total` frames, `count` (2 a second,
 * 4 to 32) at `round(linspace(0, total - 1, count))`, an odd last one repeated, each with its
 * time, its index over the frame rate.
 */
async function sampleVideo(file) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = URL.createObjectURL(file);
  try {
    await settled(video, 'loadeddata');
    const rate = await frameRate(video);
    const total = Math.max(1, Math.round(video.duration * rate));
    const count = Math.min(Math.max(Math.floor((total / rate) * SAMPLES_PER_SECOND), MIN_FRAMES), MAX_FRAMES, total);
    const indices = linspace(total - 1, count).map(roundHalfEven);
    if (indices.length % 2) indices.push(indices.at(-1));
    const { videoWidth: width, videoHeight: height } = video;
    const frames = [];
    let bitmap = null;
    for (const index of indices) {
      video.currentTime = Math.min((index + 0.5) / rate, video.duration);
      await settled(video, 'seeked');
      frames.push(pixels(video, width, height));
      bitmap ??= await createImageBitmap(video);
    }
    return { width, height, frames, times: indices.map((index) => index / rate), bitmap };
  } finally {
    URL.revokeObjectURL(video.src);
  }
}

/** The video's frame rate, from the shortest gap between frames presented while it plays. */
function frameRate(video) {
  return new Promise((resolve) => {
    if (!('requestVideoFrameCallback' in video)) return resolve(DEFAULT_RATE);
    const times = [];
    const onFrame = (_, { mediaTime }) => {
      times.push(mediaTime);
      if (times.length < RATE_FRAMES) return video.requestVideoFrameCallback(onFrame);
      video.pause();
      const gaps = times.slice(1).map((time, at) => time - times[at]).filter((gap) => gap > 0);
      resolve(gaps.length ? 1 / Math.min(...gaps) : DEFAULT_RATE);
    };
    video.requestVideoFrameCallback(onFrame);
    video.play().catch(() => resolve(DEFAULT_RATE));
  });
}

/** NumPy's `linspace(0, last, count)`: each step's multiple, the last exactly `last`. */
function linspace(last, count) {
  const step = count > 1 ? last / (count - 1) : 0;
  return Array.from({ length: count }, (_, at) => (at === count - 1 ? last : at * step));
}

/** NumPy's `round`: halves to the even neighbour. */
function roundHalfEven(value) {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Resolves on the media element's next `event`, rejects on its error. */
function settled(element, event) {
  return new Promise((resolve, reject) => {
    element.addEventListener(event, resolve, { once: true });
    element.addEventListener('error', () => reject(new Error('the video could not be decoded')), { once: true });
  });
}

/** Runs `action` once per click a click counter counts, clicks before this module loaded included. */
function onClicks(counter, action) {
  let seen = 0;
  return counter.subscribe((count) => {
    for (; seen < count; seen++) action();
  });
}
