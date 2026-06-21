/** @module config */

// tiny: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights',
// URL previously hold here but never actually loeaded: investigate exactly.

export const MODEL_URLS = {
   tiny: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/tiny_face_detector',
   landmarks: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_landmark_68',
   recognition: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_recognition',
   ageGender: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/age_gender_model'
};

export const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
   inputSize: 416,
   scoreThreshold: 0.5
});
