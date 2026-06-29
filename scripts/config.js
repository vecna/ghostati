/**
 * @module config
 * @description
 * Centralised configuration constants for Ghostati. Lives in one place so that
 * URLs, detector thresholds, and recording defaults can be changed without
 * touching engine code. All values here are static and module-load-time
 * resolvable; runtime-mutable state belongs in `state.js`.
 *
 * Why a separate module: keeps testable engines free of hard-coded URLs
 * (which makes them mockable) and concentrates the network surface in one
 * file so the upgrade path to npm + bundler is mechanical.
 */

/**
 * Public CDN URLs for the face-api.js model shards (TinyFaceDetector + the
 * landmarks / recognition / age-gender heads). These point at the canonical
 * `face-api.js-models` mirror, which serves the same weights for both the
 * unmaintained original library and the @vladmandic fork in use here.
 *
 * @see scripts/main.js – `loadModels()` reads these and calls `faceapi.nets.*.loadFromUri()`.
 */
export const MODEL_URLS = {
   tiny:        'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/tiny_face_detector',
   landmarks:   'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_landmark_68',
   recognition: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_recognition',
   ageGender:   'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/age_gender_model'
};

/**
 * Root CDN URL for the @mediapipe/tasks-vision package. Used as a base for
 * dynamic ES-module imports of `FaceLandmarker` and `ImageEmbedder`.
 *
 * @see scripts/engine-3d.js – `loadMobileNet()` does `await import(MEDIAPIPE_TASKS_VISION_URL)`.
 * @see scripts/mediapipe-loop.js – uses the same package for face landmarks.
 */
export const MEDIAPIPE_TASKS_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35';

/**
 * URL of the MediaPipe WASM blob loaded by `FilesetResolver.forVisionTasks()`.
 * The path must match the package version of `MEDIAPIPE_TASKS_VISION_URL` to
 * avoid runtime version mismatch errors.
 *
 * @see scripts/engine-3d.js
 * @see scripts/mediapipe-loop.js
 */
export const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

/**
 * URL of the MediaPipe FaceLandmarker `.task` bundle (float16, 478 landmarks).
 * Hosted by Google's `mediapipe-models` storage.
 *
 * @see scripts/mediapipe-loop.js – passed to `FaceLandmarker.createFromOptions()`.
 */
export const MEDIAPIPE_FACE_LANDMARKER_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/**
 * URL of the MediaPipe ImageEmbedder model bundle (MobileNetV3 Small, float32).
 * Produces the embedding vector consumed by the 3D recognition pipeline.
 *
 * @see scripts/engine-3d.js – passed to `ImageEmbedder.createFromOptions()`.
 */
export const MEDIAPIPE_IMAGE_EMBEDDER_URL = 'https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite';

/**
 * Pre-built TinyFaceDetector options reused across every face-api detection
 * call so the inference parameters stay consistent between the live loop, the
 * efficacy composite, and the save/find pipelines. `scoreThreshold` is the
 * minimum confidence for a face to be reported; `inputSize` is the square
 * input dimension fed to the detector (larger = more accurate, slower).
 *
 * @see scripts/engine.js – `detectFaceInCam`, `runEffectPass`, `compositeAndDetect`.
 */
export const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
   inputSize: 416,
   scoreThreshold: 0.5
});

/**
 * Defaults for the in-app one-second video recording feature. Mode selects
 * between a direct browser download and an HTTP POST to a backend endpoint;
 * the upload contract is documented inline so the backend implementer doesn't
 * need to read the recording code.
 *
 * @see scripts/camera.js – `recordOneSecond()` reads `mode`, `uploadEndpoint`, `durationMs`.
 */
export const RECORDING_CONFIG = {
   // Mode of operation: 'download' (triggers direct browser download) or
   // 'upload' (POSTs to uploadEndpoint).
   mode: 'download',

   // Endpoint used in 'upload' mode.
   // Expected backend contract:
   //   - Method:        POST
   //   - Content-Type:  multipart/form-data
   //   - Payload field: 'video' (the recording blob)
   //   - Response:      any 2xx status counts as success; anything else is an error.
   uploadEndpoint: 'http://localhost:3000/upload',

   // Duration of the recording in milliseconds (default: 2 seconds).
   durationMs: 2000
};
