/**
 * The plain-text lead paragraph under each tool and landing page heading: what the page does,
 * that it is free and the files are not uploaded, and one real limit. Answer engines quote
 * text that sits early on a page, so it is rendered into the HTML above the tool controls.
 *
 * Built from the data below, or from a hand-written `lead` on a Tool or Preset. Claims rules
 * (tests/lead.spec.ts guards them): say "files are not uploaded", never "no data", "zero requests",
 * "any device", "unlimited" or "no size limit" without the device-memory qualifier; never name ffmpeg
 * or competitors.
 */
import type { Tool } from './tools';

/** What each tool does, with its input and output formats. First sentence of the lead. */
const does: Record<string, string> = {
  'heic-to-jpg': 'Converts iPhone and iPad HEIC or HEIF photos to JPG or PNG, one photo or a whole batch, and can keep or drop the location data.',
  'convert-image': 'Converts images between JPG, PNG, WebP, GIF, BMP, TIFF, ICO and PDF, and reads HEIC, AVIF, JXL and SVG as input.',
  'compress-image': 'Makes JPG, PNG and WebP images smaller: pick a quality, fit a file size such as 100 KB, or resize to exact pixels, for a single file or a batch.',
  'compress-gif': 'Shrinks animated GIFs by dropping unchanged pixels, reducing colours, resizing or removing frames, and saves a smaller GIF.',
  'compress-png': 'Compresses PNG files with a smart colour palette or losslessly, keeps transparency, and saves smaller PNGs.',
  'strip-exif': 'Removes EXIF metadata, GPS location and camera details from JPG, PNG and WebP photos without re-encoding the picture.',
  'exif-viewer': 'Shows the EXIF data inside a JPG, PNG, WebP, HEIC or TIFF photo: GPS location, camera, date and every other field.',
  'merge-pdf': 'Combines several PDF files into one PDF, in the order you set.',
  'split-pdf': 'Splits a PDF into single pages, a page range or chunks, and saves the pieces as PDFs.',
  'compress-pdf': 'Makes a PDF smaller, from a lossless cleanup to aggressive compression, or fits it under a size such as 1 MB.',
  'rotate-pdf': 'Rotates all or selected pages of a PDF by 90, 180 or 270 degrees and saves the PDF with the rotation applied.',
  'unlock-pdf': 'Removes the open password and the print, copy and edit restrictions from a PDF whose password you know, and saves an unlocked PDF.',
  'protect-pdf': 'Adds a password to a PDF with AES-256 encryption and saves the protected PDF.',
  'image-to-pdf': 'Combines JPG, PNG, WebP or HEIC images into one PDF, with the page size and margins you choose.',
  'pdf-to-image': 'Turns PDF pages into JPG or PNG images at the resolution you pick, for all pages or a range.',
  'reorder-pdf': 'Lets you drag the pages of a PDF into a new order, delete pages you do not need, and saves a new PDF.',
  'sign-pdf': 'Lets you draw or type a signature, place it on any page of a PDF and download the signed PDF.',
  'pdf-page-numbers': 'Stamps page numbers on every page of a PDF, in the position, format and starting number you choose.',
  'pdf-to-word': 'Converts a PDF to an editable Word document (.docx) or plain text, rebuilding paragraphs and headings from the text layer.',
  'crop-image': 'Crops a photo to a box you draw, exact pixels, a square, 16:9, a passport size or a circle, and saves the cropped image.',
  'blur-image': 'Blurs, pixelates or blacks out faces, number plates and text in a photo, and saves the edited image.',
  'rotate-image': 'Rotates photos by 90 or 180 degrees and flips or mirrors them, for one image or a batch.',
  'color-picker': 'Picks any colour from an image, shows its HEX, RGB and HSL codes, and lists the image’s main colours as a palette.',
  'image-to-text': 'Reads the text in a photo, screenshot or scan (JPG, PNG, HEIC, WebP) with OCR and lets you copy it.',
  'video-to-mp3': 'Pulls the audio out of a video (MOV, MKV, WebM, MP4) or converts M4A, WAV and FLAC audio to MP3.',
  'video-to-gif': 'Turns an MP4, MOV or WebM clip into an animated GIF, with trimming, size and frame rate options.',
  'gif-to-mp4': 'Converts animated GIFs to MP4 video (H.264, with no sound track since GIFs have none), usually much smaller than the GIF.',
  'compress-video': 'Makes MP4, MOV and WebM videos smaller, or fits them under a size such as 10 MB for Discord or 25 MB for email, and saves an MP4.',
  'video-to-mp4': 'Converts MOV, MKV and WebM videos to MP4.',
  'trim-video': 'Trims a video to the start and end you pick (MP4, MOV, WebM or MKV) and saves the clip in the same format.',
  'mute-video': 'Removes the sound track from a video (MP4, MOV, WebM or MKV) and saves it in the same format, with the picture copied untouched.',
  'resize-video': 'Resizes a video, for example 4K to 1080p or 1080p to 720p, from MP4, MOV or WebM to MP4.',
  'rotate-video': 'Rotates a video by 90° or 180° or flips it, from MP4, MOV or WebM to MP4.',
  'crop-video': 'Crops a video to a box you draw or to 9:16, 1:1 or 4:5, from MP4, MOV or WebM to MP4.',
  'video-speed': 'Speeds a video up to 2×, 4× or 8× or slows it to 0.5× or 0.25×, keeps the pitch of the sound, and saves an MP4.',
  'merge-videos': 'Joins two or more videos (MP4, MOV, WebM, MKV) end to end into one MP4, in the order you set.',
  'add-audio-to-video': 'Puts an MP3, WAV or M4A track on a video, or swaps in the sound of another clip, and saves a new video.',
  'reverse-video': 'Plays a video backwards, with the sound reversed or removed, from MP4, MOV, WebM or MKV to MP4.',
  'video-to-jpg': 'Saves frames from an MP4, MOV, WebM or MKV video as JPG or PNG images: one per second, spread across the clip, or every frame.',
  'trim-audio': 'Cuts the part you want from an MP3, WAV, M4A, OGG or FLAC file, or from a video’s sound, with fades, and saves MP3 or WAV.',
  'audio-converter': 'Converts audio between MP3, WAV, FLAC, M4A and OGG, or pulls the sound out of a video, for one file or a batch.',
  'qr-code-generator': 'Makes a QR code for a link, Wi-Fi network, contact card, email or phone number, and saves it as PNG or SVG.',
  'screen-recorder': 'Records your screen, a window or a browser tab, with sound and your microphone if you choose, and saves the video.',
  'voice-recorder': 'Records your voice with your microphone and saves it as MP3, WAV or M4A.',
  'volume-booster': 'Makes an MP3, voice memo or video louder or quieter, or normalizes a batch to the same loudness.',
  'remove-noise': 'Cleans hiss, hum, fan and room noise out of a voice recording or video and keeps its format.',
  'merge-audio': 'Joins two or more audio files into one MP3 or WAV, in the order you choose, with silence or a crossfade between them.',
  'mic-test': 'Tests your microphone with a live level meter, a plain verdict, and a 5-second recording you can play back.',
  'webcam-test': 'Tests your webcam with a live preview, its real resolution and frame rate, a mirror view and a snapshot.',
  'audio-to-video': 'Makes a video from a song, podcast or voice note and a cover picture, in 16:9, square or 9:16.',
  'compress-audio': 'Makes MP3, WAV, M4A and other audio files smaller, or fits them under 8, 16 or 25 MB.',
  'add-text-to-image': 'Puts text on a photo, with the font, colour, outline or box you choose, and saves the image at full size.',
  'split-image': 'Cuts a picture into a grid, a carousel or any number of rows and columns, and saves the tiles.',
  'collage-maker': 'Combines photos into one image as a grid, side by side or stacked, with spacing and a background colour.',
  'extract-pdf-images': 'Saves every picture inside a PDF as PNG or JPG, at the resolution it was stored.',
  'pitch-changer': 'Shifts a song or recording up or down by semitones without changing its length, or changes its speed without changing its pitch (MP3, WAV, M4A, FLAC).',
  'tuner': 'Tunes a guitar, bass, ukulele, violin or any instrument from your microphone, showing the note, the cents and a needle.',
  'metronome': 'Plays a steady metronome from 20 to 300 BPM, in any time signature, with subdivisions and tap tempo.',
  'fill-pdf-form': 'Lets you type into the fields of a fillable PDF form, tick its boxes and pick from its lists, then saves the filled PDF.',
  'blur-face-video': 'Finds every face in a video (MP4, MOV, WebM) and blurs or pixelates it frame by frame.',
  'remove-silence': 'Cuts the long pauses out of a podcast, lecture or voice memo (MP3, WAV, M4A and more) and trims quiet starts and ends.',
  'image-to-svg': 'Traces a PNG or JPG into a vector SVG of filled shapes, in black and white, a few flat colours or full detail.',
  'gif-maker': 'Makes an animated GIF from photos, screenshots or drawings, with the order, timing, size and loop you set.',
  'flatten-pdf': 'Flattens a filled-in PDF form, comments, stamps and signatures into the page so they cannot be edited, and keeps the text selectable.',
  'resize-pdf': 'Changes the page size of a PDF to A4, US Letter, Legal, A3, A5 or Tabloid, scaling and centring the content.',
  'transcribe': 'Turns speech in an audio or video file (MP3, WAV, M4A, MP4, MOV) into text, SRT subtitles or WebVTT captions with Whisper, in 16 or more languages.',
  'add-subtitles-to-video': 'Burns captions into an MP4, MOV or WebM and saves an MP4, either written from the speech by Whisper or taken from your own SRT or VTT file.',
  'vocal-remover': 'Removes the vocals from a song for karaoke, or keeps only the vocals, using an AI separation model (MP3, WAV, M4A, FLAC or video in).',
  'video-background-remover': 'Removes the background behind the person in a video: blur it, fill it with a colour or green screen, or put a picture behind them.',
  'ocr-pdf': 'Turns a scanned PDF into a searchable PDF by reading the text and laying it invisibly over each page.',
  'document-scanner': 'Turns phone photos of documents into a clean, straightened PDF by finding the page, flattening it and lifting shadows.',
  'epub-to-pdf': 'Converts an EPUB ebook to a PDF with chapters on new pages, pictures and a contents page.',
  'pdf-to-epub': 'Converts a PDF into an EPUB ebook whose text reflows to fit a phone or e-reader screen, with chapters and a table of contents.',
  'archive-extractor': 'Extracts ZIP, RAR, 7z and TAR archives, including password-protected ZIP files, and downloads the files inside.',
  'create-zip': 'Zips files or whole folders into one ZIP and can lock it with an AES-256 password.',
  'favicon-generator': 'Makes favicon.ico, apple-touch-icon, Android and maskable icons and a site.webmanifest from one PNG, JPG or SVG.',
  'remove-background': 'Removes the background from a photo and saves a transparent PNG, or a white or coloured background, at full resolution.',
  'passport-photo': 'Makes a 2 × 2 inch US passport photo or a 35 × 45 mm photo from a selfie, plus a 4 × 6 print sheet.',
  'watermark-image': 'Adds a text watermark to photos, such as your name, a copyright line or a website, in a corner, across the middle or repeated.',
  'watermark-pdf': 'Stamps text such as CONFIDENTIAL or DRAFT on every page of a PDF, diagonally, repeated or in a corner.',
  'remove-pdf-metadata': 'Shows and removes the hidden author, software, dates, XMP data and file ID in a PDF.',
  'sticker-maker': 'Turns a photo into a sticker by removing the background and adding a white die-cut border, as a transparent PNG or a 512 px WebP.',
  'profile-picture-maker': 'Turns a photo into a profile picture, with the background removed and your face centred on a colour, as a circle or square at 1024 px.',
  'upscale-image': 'Makes a small or blurry picture 2, 3 or 4 times bigger with an AI upscaler, for sharper edges and fewer JPEG blocks.',
  'remove-object': 'Lets you paint over a person, a bin, a wire or a date stamp in a photo and fills the area in with an AI model.',
  'adjust-image': 'Brightens, adds contrast, changes colour, warmth and sharpness, or inverts a photo, with a live preview, for one image or a batch.',
  'emote-resizer': 'Resizes art or animated GIFs into Twitch emotes, sub badges, Discord emoji and stickers or Slack emoji, within each size limit.',
  'pixel-art-converter': 'Turns any photo or drawing into pixel art, with a pixel width, colour count or retro palette, dithering and a grid.',
  'photo-to-sketch': 'Turns a photo into a pencil sketch, charcoal drawing or coloured pencil sketch at full resolution.',
  'add-border-to-image': 'Puts a white, black or coloured border around a picture and can round its corners, from a subtle frame to a circle.',
  'black-and-white-image': 'Turns photos black and white as grayscale, high contrast, pure black and white for scans, or sepia.',
  'grayscale-pdf': 'Turns a colour PDF into grayscale for printing or submission, keeping text as text.',
  'crop-pdf': 'Crops PDF pages to an area you draw, or trims white margins from every page in one click.',
  'redact-pdf': 'Blacks out names, numbers and addresses in a PDF so the text underneath is removed, not just covered.',
  'file-checksum': 'Computes the MD5, SHA-1 or SHA-256 checksum of a file so you can compare it with the one the publisher lists.',
};

interface Download {
  /** What is downloaded, with the size taken from the progress text in the tool's code. */
  what: string;
  size: string;
  /** Replaces the default "The first run downloads … then works offline" sentence. */
  text?: string;
}

/** Tools that download a model or engine on first use, by base tool slug. */
const downloads: Record<string, Download> = {
  'remove-background': { what: 'cut-out model', size: '46 MB' },
  'sticker-maker': { what: 'cut-out model', size: '46 MB' },
  'passport-photo': { what: 'face finder and cut-out model', size: '50 MB' },
  'profile-picture-maker': { what: 'face finder and cut-out model', size: '50 MB' },
  'upscale-image': { what: 'upscaling model', size: '4.9 MB' },
  'remove-object': { what: 'object removal model', size: '28 MB' },
  'image-to-text': { what: 'text reader', size: '6 MB' },
  'ocr-pdf': { what: 'text reader', size: '6 MB' },
  'transcribe': { what: 'speech model', size: '76 MB' },
  'vocal-remover': { what: 'separation model', size: '67 MB' },
  'video-background-remover': { what: 'person finder', size: '16 MB' },
  'blur-face-video': { what: 'face detector', size: '4 MB' },
  'add-subtitles-to-video': {
    what: 'speech model',
    size: '76 MB',
    text: 'Writing captions from speech downloads the speech model (76 MB) on first use and then works offline; burning in your own SRT or VTT file needs no model.',
  },
};

/**
 * Tools whose engine is fetched on first use rather than on page load, so they work offline only
 * after one run: a model (the `downloads` above), the MP3 encoder, the archive, checksum, noise
 * and encrypted-PDF engines, and the face finder behind blur-image. tests/claims.spec.ts
 * checks that a tool importing one of these engines is listed. Everything else is fully cached
 * on the first visit (pages, scripts and the image decoders).
 */
const firstUseEngines = [
  'video-to-mp3', 'merge-audio', 'trim-audio', 'audio-converter', 'compress-audio', 'volume-booster',
  'pitch-changer', 'remove-silence', 'voice-recorder', 'remove-noise', 'file-checksum',
  'archive-extractor', 'unlock-pdf', 'protect-pdf', 'blur-image',
];

/** The offline badge: after the first visit, or, for tools that fetch an engine on first run, after the first use. */
export function offlineBadge(base: string): string {
  return needsFirstUse(base) ? 'Works offline after first use' : 'Works offline after first visit';
}

/** True for a tool that is offline-ready only after one run, because it fetches a model or engine when used. */
export const needsFirstUse = (base: string): boolean => base in downloads || firstUseEngines.includes(base);

/** Rewrites "after one visit" to "after your first run" for a tool that needs a first run. */
export const offlineWhen = (base: string, text: string): string =>
  needsFirstUse(base) ? text.replace(/\bafter one visit\b/g, 'after your first run').replace(/\bAfter one visit\b/g, 'After your first run') : text;

/** The size badge: a tool's own `sizeFact`, else a watermark claim with the real limit. */
export const defaultSizeBadge = 'No watermark · limit is your device’s memory';

/** Tools with no file to size-limit; their fact says what is true of them instead. */
const facts: Record<string, string> = {
  'qr-code-generator': 'The codes are static, so they never expire, and after one visit the page works offline.',
  'screen-recorder': 'Recordings are built in your device’s memory, so how long you can record depends on the device. After one visit the page works offline.',
  'voice-recorder': 'Recordings are built in your device’s memory, so how long you can record depends on the device. After one visit the page works offline.',
  'mic-test': 'Your browser asks for microphone permission, and after one visit the page works offline.',
  'webcam-test': 'Your browser asks for camera permission, and after one visit the page works offline.',
  'tuner': 'Your browser asks for microphone permission, and after one visit the page works offline.',
  'metronome': 'After one visit the page works offline.',
  'blur-image': 'Finding faces downloads a small face detector (about 4 MB) the first time you use that button; marking areas by hand needs no download. After one visit the page works offline.',
};

const freeLine = (what: string) => `It is free, and ${what} not uploaded: everything runs in your browser on your device.`;
/** The privacy sentence, naming what the tool handles where that is not a file. */
const free: Record<string, string> = {
  'tuner': freeLine('the sound from your microphone is'),
  'mic-test': freeLine('the sound from your microphone is'),
  'webcam-test': freeLine('the picture from your camera is'),
  'qr-code-generator': freeLine('what you type is'),
  'screen-recorder': freeLine('your recordings are'),
  'voice-recorder': freeLine('your recordings are'),
};
const freeFiles = freeLine('your files are');
const memory = 'The only size limit is your device’s memory, and after one visit the page works offline.';

/** The opening of a description: its first sentence, plus the next when that is short or a question, unless the next is a "no upload, no size caps" slogan. */
function opening(text: string): string {
  const sentences = text.match(/.*?[.!?](?=\s|$)/g) ?? [text];
  let out = sentences[0]!.trim();
  if ((out.length < 60 || out.endsWith('?')) && sentences[1] && !/\b(no|nothing|free|works offline|batches)\b/i.test(sentences[1])) out += ' ' + sentences[1].trim();
  return out;
}

/** The 2–3 sentence lead for a tool or landing page. `base` is the tool whose script runs the page. */
export function leadFor(tool: Tool, base: string = tool.slug, kind: 'tool' | 'landing' = 'tool'): string {
  if (tool.lead) return tool.lead;
  const first = kind === 'tool' ? does[tool.slug] : opening(tool.description);
  if (!first) throw new Error(`No lead sentence for ${tool.slug}`);
  const dl = downloads[base];
  const third = dl ? (dl.text ?? `The first run downloads the ${dl.what} (about ${dl.size}) to your browser, and after that the tool works offline.`) : (facts[base] ?? (tool.sizeFact && /memory/i.test(tool.sizeFact) ? tool.sizeFact : memory));
  // Tools that fetch an engine on first run are not offline after the visit alone.
  const offline = firstUseEngines.includes(base) ? third.replace(/\bafter one visit\b/i, (m) => (m[0] === 'A' ? 'After' : 'after') + ' your first run') : third;
  return [first, free[base] ?? freeFiles, offline].join(' ');
}
