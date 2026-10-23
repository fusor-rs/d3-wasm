// The engine's home: a module Worker that loads the model and decides requests, off the page's
// main thread.
//
// Load: fusor-ai's worker kit (`dist/host/worker.js`) starts the best runtime build and streams
// every part of the bundle into it; the runtime checks each part's size and BLAKE3.
//
// Decide: the page's request with its images' and videos' RGBA pixels and their layout starts a
// decision (`start()`), then one `step()` per macrotask — each image and each two frames of a
// video through the vision tower, then each question through the language model, the last with
// the answers — each posted to the page, so a stop request is seen between steps. A request made
// before the model is ready waits for it.
//
// After the model is loaded nothing else is fetched: deciding is entirely local.

import { engine, load, post, ready, requestsSinceReady, serve, yieldTask } from './dist/host/worker.js';

let stoppedJob = null;

serve({
  load: ({ modelUrl, threads, build }) =>
    load({
      modelUrl,
      threads,
      build,
      glueName: 'd3_runtime',
      cacheName: 'd3-parts',
      distUrl: new URL('./dist/', import.meta.url),
      onRuntime: (started) => post({ type: 'runtime', build: started.build.name, threads: started.threads }),
      onReady: (progress) => post({ type: 'ready', ...progress }),
    }),
  decide,
  stop: ({ job }) => (stoppedJob = job),
});

async function decide({ job, request, rgba, layout }) {
  await ready;
  const stopped = { type: 'done', job, stopped: true, response: null };
  if (stoppedJob === job) return post(stopped);
  const { rt } = engine;
  const plan = JSON.parse(rt.start(request, rgba, layout));
  post({ type: 'started', job, plan });
  for (;;) {
    await yieldTask();
    if (stoppedJob === job) {
      rt.cancel();
      return post({ ...stopped, networkRequests: requestsSinceReady() });
    }
    const progress = JSON.parse(rt.step());
    const message = { job, ...progress, networkRequests: requestsSinceReady() };
    if (progress.response) return post({ ...message, type: 'done', stopped: false });
    post({ ...message, type: 'step' });
  }
}
