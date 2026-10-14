/**
 * The plain-text lead paragraph under each tool and landing page heading: what the page does,
 * that it is free and the files are not uploaded, and one real limit. Answer engines quote
 * text that sits early on a page, so it is rendered into the HTML above the tool controls.
 *
 * Built from the data below, or from a hand-written `lead` on a Tool or Preset. Claims rules
 * (tests/lead.spec.ts guards them): say "files are not uploaded", never "no data", "zero requests",
 * "any device", "unlimited" or "no size limit" without the device-memory qualifier; never name ffmpeg
 * (the licenses, privacy and about pages carry the approved FFmpeg-libraries wording, not the leads)
 * or competitors.
 */
import type { Tool } from './tools';
import { SPEECH_MODEL_SIZE } from './speech-size.ts';

/** What each tool does, with its input and output formats. First sentence of the lead. */
const does: Record<string, string> = {
  'heic-to-jpg': 'Converts iPhone and iPad HEIC or HEIF photos to JPG or PNG, one photo or a whole batch, and can keep or drop the location data.',
  'convert-image': 'Converts images between JPG, PNG, WebP, GIF, BMP, TIFF, ICO and PDF, and reads HEIC, AVIF, JXL and SVG as input, and has ready-made pages for turning any image into JPG or PNG.',
  'compress-image': 'Makes JPG, PNG and WebP images smaller: pick a quality, fit a file size such as 100 KB, or resize to exact pixels, for a single file or a batch.',
  'resize-gif': 'Changes the width and height of animated GIFs by percent or in exact pixels, keeping the animation, frame timing and loop.',
  'add-text-to-gif': 'Puts text on every frame of an animated GIF, with the font, colour and outline you choose, and saves a new GIF with the same timing.',
  'gif-speed': 'Speeds an animated GIF up or slows it down, or plays it backwards, by rescaling every frame’s time and saving a new GIF with the same loop setting.',
  'gif-frame-splitter': 'Splits an animated GIF into its frames, each drawn whole the way a browser plays it, and saves them as PNG files one by one or as a zip, with every frame’s delay.',
  'gif-rotate': 'Turns an animated GIF by 90°, 180° or 270° or flips it horizontally or vertically, keeping every frame, its timing and the loop.',
  'crop-gif': 'Crops an animated GIF to a box you draw, a square, 16:9 or 9:16, keeping every frame, its timing and the loop.',
  'compress-gif': 'Shrinks animated GIFs by dropping unchanged pixels, reducing colours, resizing or removing frames, and saves a smaller GIF.',
  'compress-png': 'Compresses PNG files with a smart colour palette or losslessly, keeps transparency, and saves smaller PNGs.',
  'strip-exif': 'Removes EXIF metadata, GPS location and camera details from JPG, PNG and WebP photos, copying the image data unchanged unless a sideways JPG is turned upright.',
  'exif-viewer': 'Shows the EXIF data inside a JPG, PNG, WebP, HEIC or TIFF photo: GPS location, camera, date and every other field.',
  'merge-gifs': 'Joins several animated GIFs into one, in the order you set, fitting GIFs of other sizes to the first and keeping each frame’s timing.',
  'merge-pdf': 'Combines several PDF files into one PDF, in the order you set.',
  'split-pdf': 'Splits a PDF into single pages, a page range or chunks, and saves the pieces as PDFs.',
  'compress-pdf': 'Makes a PDF smaller, from a lossless cleanup to aggressive compression, or fits it under a size such as 1 MB.',
  'rotate-pdf': 'Rotates all or selected pages of a PDF by 90, 180 or 270 degrees and saves the PDF with the rotation applied.',
  'unlock-pdf': 'Removes the open password and the print, copy and edit restrictions from a PDF whose password you know, and saves an unlocked PDF.',
  'protect-pdf': 'Adds a password to a PDF with AES-256 encryption and saves the protected PDF.',
  'image-to-pdf': 'Combines JPG, PNG, WebP or HEIC images into one PDF, with the page size and margins you choose.',
  'pdf-to-image': 'Turns PDF pages into JPG or PNG images at the resolution you pick, for all pages or a range.',
  'reorder-pdf': 'Lets you drag the pages of a PDF into a new order, delete pages you do not need, and saves a new PDF.',
  'edit-pdf': 'Adds text, cover boxes, highlights, drawings and images on top of a PDF and lets you rotate, delete or reorder its pages, but it cannot change the text already in the file.',
  'sign-pdf': 'Lets you draw or type a signature, place it on any page of a PDF and download the signed PDF.',
  'pdf-page-numbers': 'Stamps page numbers on every page of a PDF, in the position, format and starting number you choose.',
  'pdf-to-word': 'Converts a PDF to an editable Word document (.docx) or plain text, rebuilding paragraphs and headings from the text layer.',
  'crop-image': 'Crops a photo to a box you draw, exact pixels, a square, 16:9, a passport size or a circle, and saves the cropped image.',
  'blur-image': 'Blurs, pixelates or blacks out faces, number plates and text in a photo, and saves the edited image.',
  'rotate-image': 'Rotates photos by 90 or 180 degrees and flips or mirrors them, for one image or a batch.',
  'color-picker': 'Picks any colour from an image, shows its HEX, RGB and HSL codes, and lists the image’s main colours as a palette.',
  'image-to-word': 'Reads the text in photos, screenshots and scans (JPG, PNG, HEIC, WebP) with OCR and saves it as one Word document (.docx), one page per image. Only the text is kept.',
  'image-to-text': 'Reads the text in a photo, screenshot or scan (JPG, PNG, HEIC, WebP) with OCR and lets you copy it.',
  'video-to-mp3': 'Pulls the audio out of a video (MOV, MKV, WebM, MP4) or converts M4A, WAV and FLAC audio to MP3.',
  'video-to-gif': 'Turns an MP4, MOV or WebM clip into an animated GIF, with trimming, size and frame rate options.',
  'gif-to-mp4': 'Converts animated GIFs to MP4 video (H.264, with no sound track since GIFs have none), usually much smaller than the GIF.',
  'gif-to-animated-png': 'Converts animated GIFs to animated PNG (APNG), keeping each frame’s timing, the loop count and transparency.',
  'compress-video': 'Makes MP4, MOV and WebM videos smaller, or fits them under a size such as 10 MB for Discord or 25 MB for email, and saves an MP4.',
  'video-to-mp4': 'Converts MOV, MKV and WebM videos to MP4.',
  'video-to-webm': 'Converts MP4, MOV and MKV videos to WebM with VP9 (or VP8) video and Opus sound, copying WebM streams as they are, and says so when a browser cannot write WebM.',
  'video-to-mov': 'Converts MP4, WebM and MKV videos to MOV, copying H.264 video and AAC sound as they are and re-encoding anything else.',
  'trim-video': 'Trims a video to the start and end you pick (MP4, MOV, WebM or MKV) and saves the clip in the same format.',
  'mute-video': 'Removes the sound track from a video (MP4, MOV, WebM or MKV) and saves it in the same format, with the picture copied untouched.',
  'resize-video': 'Resizes a video, for example 4K to 1080p or 1080p to 720p, from MP4, MOV or WebM to MP4.',
  'rotate-video': 'Rotates a video by 90° or 180° or flips it, from MP4, MOV or WebM to MP4.',
  'crop-video': 'Crops a video to a box you draw or to 9:16, 1:1 or 4:5, from MP4, MOV or WebM to MP4.',
  'add-watermark-to-video': 'Puts a text or logo watermark on every frame of a video (MP4, MOV, WebM or MKV), in a corner or the centre at a size and opacity you pick, and saves an MP4 with the sound kept.',
  'video-speed': 'Speeds a video up to 2×, 4× or 8× or slows it to 0.5× or 0.25×, keeps the pitch of the sound, and saves an MP4.',
  'merge-videos': 'Joins two or more videos (MP4, MOV, WebM, MKV) end to end into one MP4, in the order you set.',
  'repeat-video': 'Repeats a video clip end to end 2 to 50 times, or to a length you set, copying the picture and sound as they are where it can, and saves one longer file.',
  'add-audio-to-video': 'Puts an MP3, WAV or M4A track on a video, or swaps in the sound of another clip, and saves a new video.',
  'reverse-video': 'Plays a video backwards, with the sound reversed or removed, from MP4, MOV, WebM or MKV to MP4.',
  'video-to-jpg': 'Saves frames from an MP4, MOV, WebM or MKV video as JPG or PNG images: one per second, spread across the clip, or every frame.',
  'trim-audio': 'Cuts the part you want from an MP3, WAV, M4A, OGG or FLAC file, or from a video’s sound, with fades, and saves MP3, WAV or M4R.',
  'audio-converter': 'Converts audio between MP3, WAV, FLAC, M4A and OGG, or pulls the sound out of a video, for one file or a batch.',
  'qr-code-generator': 'Makes a QR code for a link, Wi-Fi network, contact card, email or phone number, and saves it as PNG or SVG.',
  'qr-code-scanner': 'Reads QR codes and barcodes from an image, a screenshot or your camera and shows what they hold, without opening anything for you.',
  'barcode-generator': 'Makes a Code 128, Code 39, UPC-A, EAN-13, ITF-14 or other barcode from the number or text you type, and saves it as PNG, SVG or PDF.',
  'signature-maker': 'Makes a signature image you can draw, type in a script font or take from a photo of your handwriting, and saves it as a transparent PNG, or an SVG when you draw it.',
  'screen-recorder': 'Records your screen, a window or a browser tab, with sound and your microphone if you choose, and saves the video.',
  'voice-recorder': 'Records your voice with your microphone and saves it as MP3, WAV or M4A.',
  'audio-reverser': 'Plays an audio file backwards, from MP3, WAV, M4A, FLAC or OGG, and saves it in the same or another format.',
  'volume-booster': 'Makes an MP3, voice memo or video louder or quieter, or normalizes a batch to the same loudness.',
  'remove-noise': 'Cleans hiss, hum, fan and room noise out of a voice recording or video and keeps its format.',
  'merge-audio': 'Joins two or more audio files into one MP3 or WAV, in the order you choose, with silence or a crossfade between them.',
  'mic-test': 'Tests your microphone with a live level meter, a plain verdict, and a 5-second recording you can play back.',
  'webcam-test': 'Tests your webcam with a live preview, its real resolution and frame rate, a mirror view and a snapshot.',
  'dead-pixel-test': 'Fills your whole screen with black, white, red, green and blue, one at a time, so you can spot dead or stuck pixels.',
  'speaker-test': 'Plays a tone through the left speaker, the right speaker or both, a frequency sweep or pink noise, so you can hear whether each side works.',
  'keyboard-tester': 'Lights each key on an on-screen keyboard as you press it, in an ANSI or ISO layout, and logs the key and code of every press.',
  'audio-to-video': 'Makes a video from a song, podcast or voice note and a cover picture, in 16:9, square or 9:16.',
  'photo-slideshow-maker': 'Makes an MP4 slideshow from 2 to 100 photos in the order you set, with seconds per photo, a crossfade and an optional song.',
  'compress-audio': 'Makes MP3, WAV, M4A and other audio files smaller, or fits them under 8, 16 or 25 MB.',
  'add-text-to-image': 'Puts text on a photo, with the font, colour, outline or box you choose, and saves the image at full size.',
  'split-image': 'Cuts a picture into a grid, a carousel or any number of rows and columns, and saves the tiles.',
  'collage-maker': 'Combines photos into one image as a grid, side by side or stacked, with spacing and a background colour.',
  'extract-pdf-images': 'Saves every picture inside a PDF as PNG or JPG, at the resolution it was stored.',
  'bpm-key-finder': 'Finds the tempo (BPM) and musical key of a song from an audio file, and gives the Camelot code DJs use to match keys.',
  'pitch-changer': 'Shifts a song or recording up or down by semitones without changing its length, or changes its speed without changing its pitch (MP3, WAV, M4A, FLAC).',
  'tuner': 'Tunes a guitar, bass, ukulele, violin or any instrument from your microphone, showing the note, the cents and a needle.',
  'tone-generator': 'Plays a steady test tone from 20 Hz to 20 kHz as a sine, square, triangle or sawtooth wave, with presets for 440 Hz, 1 kHz and bass.',
  'metronome': 'Plays a steady metronome from 20 to 300 BPM, in any time signature, with subdivisions and tap tempo.',
  'fill-pdf-form': 'Lets you type into the fields of a fillable PDF form, tick its boxes and pick from its lists, then saves the filled PDF.',
  'blur-face-video': 'Finds the faces that look towards the camera in a video (MP4, MOV, WebM) and blurs or pixelates them frame by frame; you check the result before sharing.',
  'remove-silence': 'Cuts the long pauses out of a podcast, lecture or voice memo (MP3, WAV, M4A and more) and trims quiet starts and ends.',
  'image-to-svg': 'Traces a PNG or JPG into a vector SVG of filled shapes, in black and white, a few flat colours or full detail.',
  'gif-maker': 'Makes an animated GIF from photos, screenshots or drawings, with the order, timing, size and loop you set.',
  'flatten-pdf': 'Flattens a filled-in PDF form, comments, stamps and signatures into the page so they cannot be edited, and keeps the text selectable.',
  'resize-pdf': 'Changes the page size of a PDF to A4, US Letter, Legal, A3, A5 or Tabloid, scaling and centring the content.',
  'transcribe': 'Turns speech in an audio or video file (MP3, WAV, M4A, MP4, MOV) into text, SRT subtitles or WebVTT captions with Whisper, in 16 or more languages.',
  'add-subtitles-to-video': 'Burns captions into an MP4, MOV or WebM and saves an MP4, either written from the speech by Whisper or taken from your own SRT or VTT file.',
  'mp3-to-midi': 'Turns a recording of one instrument, a voice or a hummed tune (MP3, WAV, M4A, FLAC) of up to five minutes into a MIDI file of its notes, with an AI model.',
  'vocal-remover': 'Removes the vocals from a song for karaoke, or keeps only the vocals, using an AI separation model (MP3, WAV, M4A, FLAC or video in).',
  'video-background-remover': 'Removes the background behind the person in a video: blur it, fill it with a colour or green screen, or put a picture behind them.',
  'ocr-pdf': 'Turns a scanned PDF into a searchable PDF by reading the text and laying it invisibly over each page.',
  'document-scanner': 'Turns phone photos of documents into a clean, straightened PDF by finding the page, flattening it and lifting shadows.',
  'epub-to-pdf': 'Converts an EPUB ebook to a PDF with chapters on new pages, pictures and a contents page.',
  'text-to-pdf': 'Turns typed or pasted text, or .txt, .md, .csv and .log files, into a PDF with the page size, margins and type size you choose.',
  'pdf-to-epub': 'Converts a PDF into an EPUB ebook whose text reflows to fit a phone or e-reader screen, with chapters and a table of contents.',
  'archive-extractor': 'Extracts ZIP, RAR, 7z and TAR archives, including password-protected ZIP files, and downloads the files inside.',
  'create-zip': 'Zips files or whole folders into one ZIP and can lock it with an AES-256 password.',
  'rename-files': 'Renames many files at once with a prefix or suffix, numbering, find and replace or a letter-case change, shows every new name first, and downloads the result as a ZIP.',
  'image-to-base64': 'Encodes PNG, JPG, WebP, GIF, SVG, AVIF and ICO images as Base64 and gives you the data URI, HTML and CSS snippets, with the size the encoding adds.',
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
  'compare-images': 'Compares two images pixel by pixel with a slider, a difference map or a fade, and shows the percentage of pixels that differ, saving the map as a PNG.',
  'pixel-art-converter': 'Turns any photo or drawing into pixel art, with a pixel width, colour count or retro palette, dithering and a grid.',
  'photo-to-sketch': 'Turns a photo into a pencil sketch, charcoal drawing or coloured pencil sketch at full resolution.',
  'add-border-to-image': 'Puts a white, black or coloured border around a picture and can round its corners, from a subtle frame to a circle.',
  'black-and-white-image': 'Turns photos black and white as grayscale, high contrast, pure black and white for scans, or sepia.',
  'grayscale-pdf': 'Turns a colour PDF into grayscale for printing or submission, keeping text as text.',
  'crop-pdf': 'Crops PDF pages to an area you draw, or trims white margins from every page in one click.',
  'redact-pdf': 'Blacks out names, numbers and addresses in a PDF so the text underneath is removed, not just covered.',
  'file-checksum': 'Computes the MD5, SHA-1 or SHA-256 checksum of a file so you can compare it with the one the publisher lists.',
  'audio-splitter': 'Splits one audio file into separate MP3 or WAV parts at the times you set or at equal lengths.',
  'subtitle-converter': 'Converts a subtitle file from SRT to WebVTT or from WebVTT to SRT, keeping every caption’s words and timing.',
  'json-to-csv': 'Converts JSON to CSV or CSV to JSON, flattening nested objects, with the delimiter, headers and Excel-friendly encoding you choose.',
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
  'remove-background': { what: 'cut-out model', size: '42 MB', text: 'The first run downloads the cut-out model and the WebAssembly engine that runs it (about 42 MB in all) to your browser, and after that the tool works offline.' },
  'sticker-maker': { what: 'cut-out model', size: '42 MB', text: 'The first run downloads the cut-out model and the WebAssembly engine that runs it (about 42 MB in all) to your browser, and after that the tool works offline.' },
  'passport-photo': { what: 'face finder and cut-out model', size: '46 MB', text: 'The first run downloads the face finder, the cut-out model and the WebAssembly engines that run them (about 46 MB in all) to your browser, and after that the tool works offline.' },
  'profile-picture-maker': { what: 'face finder and cut-out model', size: '46 MB', text: 'The first run downloads the face finder, the cut-out model and the WebAssembly engines that run them (about 46 MB in all) to your browser, and after that the tool works offline.' },
  'upscale-image': { what: 'upscaling model', size: '4.9 MB' },
  'remove-object': { what: 'object removal model', size: '28 MB' },
  'image-to-word': { what: 'text reader', size: '6 MB' },
  'image-to-text': { what: 'text reader', size: '6 MB' },
  'ocr-pdf': { what: 'text reader', size: '6 MB' },
  'transcribe': { what: 'speech model', size: SPEECH_MODEL_SIZE },
  'vocal-remover': { what: 'separation model', size: '67 MB' },
  'mp3-to-midi': {
    what: 'note model',
    size: '0.2 MB',
    text: 'The first run downloads the note model (0.2 MB, from this site) and the engine that runs it (about 14 MB, less compressed) to your browser, and after that the tool works offline.',
  },
  'video-background-remover': {
    what: 'person finder',
    size: '28 MB',
    text: 'The first run downloads the person finder and its engine (about 28 MB, or about 12 MB with the Fast option) to your browser, and after that the tool works offline.',
  },
  'blur-face-video': { what: 'face detector', size: '4 MB' },
  'add-subtitles-to-video': {
    what: 'speech model',
    size: SPEECH_MODEL_SIZE,
    text: `Writing captions from speech downloads the speech model (${SPEECH_MODEL_SIZE}) and the engine that runs it on first use and then works offline; burning in your own SRT or VTT file needs no model.`,
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
  'video-to-mp3', 'merge-audio', 'trim-audio', 'audio-splitter', 'audio-converter', 'compress-audio', 'volume-booster', 'audio-reverser',
  'pitch-changer', 'remove-silence', 'voice-recorder', 'remove-noise', 'file-checksum',
  'archive-extractor', 'unlock-pdf', 'protect-pdf', 'blur-image', 'qr-code-scanner',
];

/** The offline badge: after the first visit, or, for tools that fetch an engine on first run, after the first use. */
export function offlineBadge(base: string): string {
  return needsFirstUse(base) ? 'Works offline after first use' : 'Works offline after first visit';
}

/** True for a tool that is offline-ready only after one run, because it fetches a model or engine when used. */
export const needsFirstUse = (base: string): boolean => base in downloads || firstUseEngines.includes(base);

/** Rewrites "after one visit" to "after your first run" for a tool that needs a first run. */
export const offlineWhen = (base: string, text: string): string =>
  needsFirstUse(base) ? text.replace(/\bafter one visit( and a short wait)?\b/g, 'after your first run').replace(/\bAfter one visit( and a short wait)?\b/g, 'After your first run') : text;

/** The size badge: a tool's own `sizeFact`, else a watermark claim with the real limit. */
export const defaultSizeBadge = 'No watermark · limit is your device’s memory; phones hold less';

/** Tools with no file to size-limit; their fact says what is true of them instead. */
const facts: Record<string, string> = {
  'video-to-mp3': 'The limit is your device’s memory, which is smaller on a phone, and after your first run the page works offline.',
  'qr-code-scanner': 'Your browser asks for camera permission only if you press the camera button, and after one visit and a short wait the page works offline.',
  'qr-code-generator': 'The codes are static, so they never expire, and after one visit and a short wait the page works offline.',
  'barcode-generator': 'The barcodes are drawn on this page, and after one visit and a short wait the page works offline.',
  'signature-maker': 'The signature is made on this page and never saved, and after one visit and a short wait the page works offline.',
  'screen-recorder': 'Recordings are built in your device’s memory, so how long you can record depends on the device. After one visit and a short wait the page works offline.',
  'voice-recorder': 'Recordings are built in your device’s memory, so how long you can record depends on the device. After one visit and a short wait the page works offline.',
  'mic-test': 'Your browser asks for microphone permission, and after one visit and a short wait the page works offline.',
  'webcam-test': 'Your browser asks for camera permission, and after one visit and a short wait the page works offline.',
  'keyboard-tester': 'Some keys, such as Fn and most media keys, never reach the browser, and after one visit and a short wait the page works offline.',
  'tuner': 'Your browser asks for microphone permission, and after one visit and a short wait the page works offline.',
  'metronome': 'After one visit and a short wait the page works offline.',
  'tone-generator': 'After one visit and a short wait the page works offline.',
  'json-to-csv': 'A file can be up to 200 MB, and a phone may run out of memory sooner; give the page a short while after one visit to save itself for offline use, and then it works offline.',
  'photo-slideshow-maker': 'A slideshow can hold up to 100 photos, and the limit is your device’s memory (phones hold less); give the page a short while after one visit to save itself for offline use, and then it works offline.',
  'gif-maker': 'A GIF can hold up to 300 pictures, and the limit is your device’s memory (phones hold less); give the page a short while after one visit to save itself for offline use, and then it works offline.',
  'video-to-gif': 'A GIF is capped at 600 frames, and the video itself is limited by your device’s memory (phones hold less); give the page a short while after one visit to save itself for offline use, and then it works offline.',
  'create-zip': 'A ZIP can be up to 4 GB, and phones hold less; give the page a short while after one visit to save itself for offline use, and then it works offline.',
  'rename-files': 'A ZIP can be up to 4 GB, and phones hold less; give the page a short while after one visit to save itself for offline use, and then it works offline.',
  'bpm-key-finder': 'Files longer than 15 minutes are not analysed, and after one visit and a short wait the page works offline.',
  'text-to-pdf': 'Files up to 2 MB are accepted, and Chinese, Japanese, Korean, Arabic, Hebrew, Thai and emoji cannot be drawn by the built-in fonts. After one visit and a short wait the page works offline.',
  'blur-image': 'Finding faces downloads a small face detector (about 4 MB) the first time you use that button; marking areas by hand needs no download. After one visit and a short wait the page works offline.',
};

const freeLine = (what: string) => `It is free, and ${what} not uploaded: everything runs in your browser on your device.`;
/** The privacy sentence, naming what the tool handles where that is not a file. */
const free: Record<string, string> = {
  'tuner': freeLine('the sound from your microphone is'),
  'mic-test': freeLine('the sound from your microphone is'),
  'webcam-test': freeLine('the picture from your camera is'),
  'keyboard-tester': freeLine('the keys you press are'),
  'qr-code-scanner': freeLine('your images and the picture from your camera are'),
  'qr-code-generator': freeLine('what you type is'),
  'barcode-generator': freeLine('what you type is'),
  'json-to-csv': freeLine('what you paste and the files you drop are'),
  'text-to-pdf': freeLine('what you type is'),
  'signature-maker': freeLine('what you draw, type or photograph is'),
  'screen-recorder': freeLine('your recordings are'),
  'voice-recorder': freeLine('your recordings are'),
  // These tools exist to add a watermark, so they must not say they add none.
  'watermark-image': freeLine('your files are'),
  'watermark-pdf': freeLine('your files are'),
};
const freeFiles = 'It is free, needs no account and adds no watermark, and your files are not uploaded: everything runs in your browser on your device.';
const memory = 'The size limit is your device’s memory, and phones hold less; give the page a short while after one visit to save itself for offline use, and then it works offline.';

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
  const third = dl ? (dl.text ?? `The first run downloads the ${dl.what} (about ${dl.size}) and the WebAssembly engine that runs it to your browser, and after that the tool works offline.`) : (facts[base] ?? (tool.sizeFact && /memory/i.test(tool.sizeFact) ? tool.sizeFact : memory));
  // Tools that fetch an engine on first run are not offline after the visit alone.
  const offline = firstUseEngines.includes(base) ? third.replace(/\bafter one visit( and a short wait)?\b/i, (m) => (m[0] === 'A' ? 'After' : 'after') + ' your first run') : third;
  return [first, free[base] ?? freeFiles, offline].join(' ');
}
