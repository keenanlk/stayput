/**
 * Next-step links that carry the finished file along (see src/lib/handoff.ts),
 * so the next tool opens with it already in the list. Keyed by the base tool
 * the file comes from; each target is one of that tool's next steps
 * (tests/handoff.spec.ts checks it) and takes the output as its one input.
 *
 * Left on today's behaviour (the next tool asks for a file as usual):
 * - merge-videos, merge-pdf, merge-audio and add-audio-to-video as targets: they
 *   need a second file, so a carried one is only half the job
 * - mute-video → video-to-mp3: the muted video has no sound to take
 * - gif-to-mp4 → video-to-gif/video-to-mp3: no sound, and the gif is the original
 * - protect-pdf as a source: the output is encrypted, so the next PDF tool would fail
 * - tools whose output is several files, a zip, text or a recording made in the page
 *   (screen recorder, voice recorder, transcribe, pdf-to-word, split-pdf, ...)
 * - image tools: runs often make several files, and a handoff carries exactly one;
 *   the pairs below are the single-output video, audio and PDF jobs
 * A run that makes more than one file never hands anything over, whatever the pair.
 */
export const handoffs: Record<string, string[]> = {
  // Video → video
  'add-subtitles-to-video': ['compress-video', 'trim-video'],
  'video-to-mp4': ['compress-video', 'video-to-gif'],
  'compress-video': ['video-to-mp3', 'video-to-gif'],
  'trim-video': ['compress-video', 'video-to-gif'],
  'mute-video': ['compress-video'],
  'resize-video': ['compress-video', 'trim-video'],
  'rotate-video': ['trim-video', 'compress-video'],
  'crop-video': ['resize-video', 'compress-video'],
  'video-speed': ['compress-video', 'video-to-gif'],
  'reverse-video': ['video-to-gif'],
  'blur-face-video': ['compress-video', 'trim-video'],
  'merge-videos': ['compress-video'],
  // Audio → audio
  'audio-converter': ['trim-audio'],
  'volume-booster': ['trim-audio', 'audio-converter'],
  'pitch-changer': ['trim-audio', 'volume-booster'],
  'remove-noise': ['volume-booster', 'remove-silence'],
  'remove-silence': ['compress-audio', 'trim-audio'],
  'compress-audio': ['trim-audio', 'audio-converter'],
  'merge-audio': ['trim-audio'],
  'vocal-remover': ['pitch-changer', 'trim-audio'],
  // PDF → PDF
  'rotate-pdf': ['compress-pdf'],
  'reorder-pdf': ['compress-pdf', 'pdf-page-numbers'],
  'sign-pdf': ['compress-pdf'],
  'fill-pdf-form': ['sign-pdf', 'compress-pdf'],
  'pdf-page-numbers': ['compress-pdf', 'sign-pdf'],
  'flatten-pdf': ['compress-pdf'],
  'ocr-pdf': ['compress-pdf', 'pdf-to-word'],
  'image-to-pdf': ['compress-pdf'],
  'resize-pdf': ['pdf-page-numbers'],
  'crop-pdf': ['compress-pdf'],
  'grayscale-pdf': ['compress-pdf', 'pdf-page-numbers'],
  'watermark-pdf': ['protect-pdf', 'compress-pdf'],
  'remove-pdf-metadata': ['protect-pdf', 'compress-pdf'],
  'redact-pdf': ['remove-pdf-metadata', 'protect-pdf'],
  'unlock-pdf': ['compress-pdf'],
  'compress-pdf': ['sign-pdf'],
};
