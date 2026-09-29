/**
 * What to suggest after a job finishes, per base tool (experiment E2 in
 * stayput-ops company/experiments.md). Two tools each, most likely first:
 * the job people typically do next with the same kind of file.
 */
export const nextSteps: Record<string, [string, string]> = {
  'heic-to-jpg': ['strip-exif', 'compress-image'],
  'convert-image': ['compress-image', 'strip-exif'],
  'compress-image': ['strip-exif', 'image-to-pdf'],
  'strip-exif': ['compress-image', 'crop-image'],
  'exif-viewer': ['strip-exif', 'compress-image'],
  'crop-image': ['compress-image', 'strip-exif'],
  'image-to-pdf': ['compress-pdf', 'merge-pdf'],
  'pdf-to-image': ['compress-image', 'crop-image'],
  'merge-pdf': ['compress-pdf', 'pdf-page-numbers'],
  'split-pdf': ['compress-pdf', 'merge-pdf'],
  'compress-pdf': ['merge-pdf', 'sign-pdf'],
  'rotate-pdf': ['compress-pdf', 'merge-pdf'],
  'reorder-pdf': ['compress-pdf', 'pdf-page-numbers'],
  'sign-pdf': ['compress-pdf', 'merge-pdf'],
  'pdf-page-numbers': ['compress-pdf', 'sign-pdf'],
  'pdf-to-word': ['split-pdf', 'compress-pdf'],
  'favicon-generator': ['crop-image', 'compress-image'],
  'video-to-gif': ['gif-to-mp4', 'compress-image'],
  'gif-to-mp4': ['video-to-gif', 'video-to-mp3'],
  'blur-image': ['compress-image', 'crop-image'],
  'rotate-image': ['crop-image', 'compress-image'],
  'video-to-mp3': ['video-to-gif', 'compress-image'],
  'image-to-text': ['blur-image', 'image-to-pdf'],
  'color-picker': ['crop-image', 'compress-image'],
  'unlock-pdf': ['merge-pdf', 'compress-pdf'],
  'protect-pdf': ['compress-pdf', 'sign-pdf'],
};
