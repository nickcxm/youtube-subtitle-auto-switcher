import { PaddleOCR } from '@paddleocr/paddleocr-js';
import cvModule from '@techstark/opencv-js';
import { MODELS, MODEL_ROOT, type Profile } from './models';
import { messageError, type OcrResult } from './shared';
let engine: Awaited<ReturnType<typeof PaddleOCR.create>> | undefined;
let engineKey = '';
self.addEventListener('message', async event => {
  const m = event.data;
  try {
    const profile = m.profile as Profile, key = `${profile}:${m.backend}`;
    if (!engine || key !== engineKey) {
      await engine?.dispose(); engine = undefined; engineKey = '';
      engine = await PaddleOCR.create({ worker: false,
        textDetectionModelName: 'PP-OCRv5_mobile_det', textDetectionModelAsset: { url: m.detUrl },
        textRecognitionModelName: MODELS[profile].name, textRecognitionModelAsset: { url: m.recUrl },
        textRecognitionBatchSize: 4,
        fetch: async (input, init) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          if (url.startsWith(MODEL_ROOT)) {
            const response = await (await caches.open('local-captions-models-v1')).match(url);
            if (!response) throw new Error('模型尚未准备好'); return response;
          }
          return fetch(input, init);
        },
        ortOptions: { backend: m.backend, wasmPaths: m.ortUrl, numThreads: 1, simd: true, proxy: false },
      }); engineKey = key;
    }
    // Feed a cv.Mat to bypass the SDK's DOM-only canvas adapter in this Worker.
    const bytes = Uint8Array.from(atob(m.image.slice(m.image.indexOf(',') + 1)), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0); bitmap.close();
    const mat = cvModule.matFromImageData(context.getImageData(0, 0, canvas.width, canvas.height));
    try {
      const [result] = await engine.predict(mat, { textRecScoreThresh: 0.5 });
      const data: OcrResult = { lines: result.items.map(l => ({ text: l.text, score: l.score, poly: l.poly as [number, number][] })), duration: result.metrics.totalMs, backend: `${result.runtime.detProvider}/${result.runtime.recProvider}` };
      self.postMessage({ ok: true, data });
    } finally { mat.delete(); }
  } catch (error) { self.postMessage({ ok: false, error: messageError(error) }); }
});
