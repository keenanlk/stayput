import { videoEditShell } from './video-edit-shell';

/** Remove the sound from a video: the picture is copied untouched (see src/lib/video-edit.ts). */
videoEditShell({ suffix: '-muted', verb: 'Removing sound from', options: () => ({ mute: true }) });
