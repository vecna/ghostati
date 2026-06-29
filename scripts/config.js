/** @module config */

// tiny: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights',
// URL previously hold here but never actually loeaded: investigate exactly.

export const MODEL_URLS = {
   tiny: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/tiny_face_detector',
   landmarks: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_landmark_68',
   recognition: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_recognition',
   ageGender: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/age_gender_model'
};

export const MEDIAPIPE_TASKS_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35';
export const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
export const MEDIAPIPE_FACE_LANDMARKER_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
export const MEDIAPIPE_IMAGE_EMBEDDER_URL = 'https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite';

export const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
   inputSize: 416,
   scoreThreshold: 0.5
});

export const RECORDING_CONFIG = {
   // Mode of operation: 'download' (triggers direct browser download) or 'upload' (POSTs to uploadEndpoint)
   mode: 'download',

   // Endpoint for 'upload' mode.
   // Expected backend specification:
   // - Protocol: HTTP/HTTPS
   // - Method: POST
   // - Content-Type: multipart/form-data
   // - Payload: The recording file attached under the field name 'video'
   // - Response: HTTP status code 200 (or any 2xx) indicating success, any other status represents an error.
   uploadEndpoint: 'http://localhost:3000/upload',

   // Duration of the recording in milliseconds (2 seconds)
   durationMs: 2000
};

