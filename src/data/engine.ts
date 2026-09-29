/**
 * The "in your browser, not on a server" section of every tool page: what
 * actually runs, in one short paragraph, plus the honest comparison with
 * upload-based tools. Written per tool so the copy is specific, not a template.
 */
export interface Engine {
  /** What runs in the tab, named libraries included. */
  how: string;
  /** One line on why that beats the upload-based version of this tool. */
  versus: string;
}

export const engines: Record<string, Engine> = {
  'heic-to-jpg': {
    how: 'The page loads libheif, the same open-source HEIC decoder used by Linux desktops, compiled to WebAssembly. It decodes each photo to raw pixels inside your tab, and the browser’s own image encoder writes the JPG or PNG. The decoder is fetched once as a program file from a CDN and cached; your photos are never part of any request.',
    versus: 'Upload-based HEIC converters send every photo, location data included, to a server you have never heard of, then cap you at a handful per day. Here a hundred photos convert in the time the first one would take to upload.',
  },
  'convert-image': {
    how: 'Stayput first reads the opening bytes of each file, where every image format writes its signature, so it knows what the file really is whatever it is called. Your browser decodes JPG, PNG, WebP, GIF, BMP, AVIF and SVG itself; TIFF goes through UTIF.js, HEIC through the libheif WebAssembly decoder, and JPEG XL (or AVIF, in a browser without native support) through the Squoosh decoders, all served from this site and cached. The browser re-encodes JPG, PNG and WebP; PDF, ICO, GIF, BMP and TIFF files are written by small encoders in the page. Nothing here needs a server.',
    versus: 'Online converters upload your image, convert it on their machine, keep it for hours and cap you at a few files a day. This does the same conversion on your device, for as many files as you like, in less time than the upload.',
  },
  'compress-image': {
    how: 'Resizing uses stepped downscaling on a canvas so text and edges stay sharp, and the browser encodes the result at the quality you choose. Everything happens in memory in your tab. Large batches are processed one image at a time so the page stays responsive on a phone.',
    versus: 'Image compressors that upload your photos limit you to a few files, a small size, or a watermark until you pay. This one has no counter to reset because there is no server to keep one.',
  },
  'strip-exif': {
    how: 'This tool does not re-encode your photo at all. It reads the JPG, PNG or WebP container byte by byte and removes only the metadata segments (EXIF, XMP, ICC, IPTC), writing the untouched image data back out. That is why the output is pixel-identical and the file only gets smaller.',
    versus: 'Sending a photo to a website to remove its location data is a contradiction: the site has the location the moment you upload it. Here the GPS block is deleted on your device and never travels anywhere.',
  },
  'exif-viewer': {
    how: 'The viewer reads the bytes of the photo in your tab and walks its container by hand: JPEG segments, PNG chunks, WebP RIFF chunks, HEIC boxes or the TIFF header of a DNG. It finds the EXIF block, follows its directories (camera, shot settings, GPS, thumbnail) and turns each field into plain words. It is the same parser the EXIF remover uses, a few hundred lines of TypeScript with no library behind it.',
    versus: 'An online EXIF viewer that uploads your photo has read the location before it shows it to you. Checking a photo for private data by sending it to a stranger defeats the point; here the file is never part of any request.',
  },
  'merge-pdf': {
    how: 'pdf-lib, an open-source PDF library written in TypeScript, opens each document in your tab and copies its pages into a new PDF, preserving text, vector graphics, links and images as they are. The merged file is assembled in memory and handed to your browser’s download. Password-protected PDFs are unlocked first by qpdf, compiled to WebAssembly and loaded only when needed; the password is checked in your tab and the result is saved without encryption.',
    versus: 'Upload-based mergers cap the number of files, the total size, or the number of merges per day. This one is bound only by your device’s memory, and your contracts, statements and scans are never copied to anyone’s server.',
  },
  'split-pdf': {
    how: 'pdf.js, the PDF renderer inside Firefox, draws page thumbnails so you can see what you are extracting. pdf-lib then builds the new PDFs from the pages you chose, copying them exactly rather than rasterising them. All of it runs in a web worker inside your tab.',
    versus: 'Online splitters make you upload the whole document to extract two pages from it. Here the document stays on your disk and only the pages you asked for are written out.',
  },
  'compress-pdf': {
    how: 'Lossless cleanup rewrites the PDF with pdf-lib using object streams and deduplicated resources. Image recompression uses pdf.js to find embedded images, re-encodes each one at a lower quality on a canvas, and pdf-lib swaps the new streams in. Flatten renders every page to an image at the resolution you pick. Each mode runs entirely in your browser.',
    versus: 'PDF compressors online are the most upload-hungry tools there are, because the whole document has to go up before anything happens. Here a 50 MB scan is processed without a single byte leaving your machine.',
  },
  'rotate-pdf': {
    how: 'pdf.js renders thumbnails so you can see each page. Rotating sets the page’s rotation attribute with pdf-lib, which is exactly what desktop PDF editors do, so the file is not re-rendered and loses no quality. The result is written in your tab.',
    versus: 'A sideways scan should take one click to fix, not an upload, a wait and a download page. The rotation here is instant because there is no round trip.',
  },
  'unlock-pdf': {
    how: 'qpdf, the open-source PDF transformation tool, compiled to WebAssembly, is served by this site and loaded into the tab when you run the tool. It checks your password and rewrites each PDF without its encryption, copying every page, font and image as they are. The password is used in memory and dropped when you close the tab.',
    versus: 'Online unlockers ask for the file and its password together, which is everything someone would need to read it. Here neither leaves your device.',
  },
  'protect-pdf': {
    how: 'qpdf, compiled to WebAssembly and served by this site, encrypts each PDF with AES-256 using the password you type, the same standard Acrobat uses. The encrypted file is written in your tab and handed to your browser’s download.',
    versus: 'Uploading a document to protect it hands the unprotected copy to a stranger first. Here the only copy that ever exists outside your device is the encrypted one you choose to send.',
  },
  'image-to-pdf': {
    how: 'JPG and PNG images are embedded directly into the PDF by pdf-lib without re-encoding. Other formats are decoded by your browser (HEIC via libheif, TIFF via UTIF.js, one page per TIFF page) and embedded as JPG or PNG. Page size, orientation and margins are applied while laying out each page in memory.',
    versus: 'Uploading a folder of receipts or ID scans to make one PDF is exactly the kind of thing that should not need a server. The PDF is assembled on your device in the time it takes to pick the files.',
  },
  'pdf-to-image': {
    how: 'pdf.js renders each page to a canvas at the resolution you choose, the same engine Firefox uses to display PDFs. The browser encodes each page as JPG or PNG, and if there is more than one they are zipped in your tab with fflate.',
    versus: 'Online PDF-to-image tools rasterise your document on their server and often limit you to the first few pages. Here every page is rendered locally, at any resolution, with no page cap.',
  },
  'reorder-pdf': {
    how: 'pdf.js renders a thumbnail of every page so you can see what you are moving. When you save, pdf-lib copies the pages you kept, in your order, into a new document. The page contents are not re-rendered or recompressed, so text stays text and images keep their quality.',
    versus: 'Reordering pages is a five-second job that upload-based tools turn into an upload, a queue and a download page, often behind a login or a daily cap. Here the thumbnails appear as fast as your device can draw them and the result is written in your tab.',
  },
  'sign-pdf': {
    how: 'Your signature is captured as strokes on a canvas (or typed with an embedded handwriting font), turned into a transparent PNG in memory, and drawn onto the page with pdf-lib at the exact spot and size you chose on the pdf.js preview. The signed PDF is assembled in your tab and handed to your browser’s download.',
    versus: 'E-signature sites keep a copy of your contract, your signature and your email address, and most limit free users to a few documents a month. This tool has no server, so there is nothing to keep, nothing to count and nothing to leak.',
  },
  'pdf-page-numbers': {
    how: 'pdf-lib opens the document and draws each number with one of the standard PDF fonts (Helvetica, Times or Courier), which every PDF reader has built in, so no font is embedded and the file barely grows. The position is computed per page from its size and rotation so the number lands in the same corner as the reader sees it.',
    versus: 'Adding page numbers should not require uploading a 200-page report to a stranger’s server. Here the stamping happens on your device and finishes in about the time the upload alone would take.',
  },
  'pdf-to-word': {
    how: 'pdf.js, the PDF engine inside Firefox, reads every positioned text run on each page. Stayput groups the runs into lines by baseline, joins lines into paragraphs from their spacing and font size, and writes the result as a .docx (a zip of standard Office XML built with fflate) or a .txt file, all in memory in your tab.',
    versus: 'Upload-based PDF to Word converters are the ones most likely to ask for your email address before the download, and the PDFs people convert are contracts, statements and CVs. Here the document is read on your device and the Word file never exists anywhere else.',
  },
  'crop-image': {
    how: 'The photo is decoded by your browser (or by the libheif and Squoosh WebAssembly decoders for HEIC, AVIF and JPEG XL) and drawn onto a canvas in your tab. The crop box you drag maps to a rectangle of source pixels; those pixels are copied onto a new canvas, clipped to a circle if you asked for one, and encoded once in the format you chose. No pixel is resampled unless it has to be.',
    versus: 'Online croppers upload the whole photo to crop a corner of it, then hand back a recompressed copy through a page full of ads. This one crops at full resolution on your device and finishes before an upload would have started.',
  },
  'to-ico': {
    how: 'Your browser decodes the picture, then Stayput draws it on a transparent square canvas once for every icon size, halving the resolution step by step so the small sizes stay crisp. Each size is saved as a PNG and a small encoder in the page writes the ICO header and size directory around them. The whole file is assembled in memory in your tab.',
    versus: 'Icon converters that upload your image often hand back a single 32 pixel frame or a blurry resize, and keep a copy of your logo on their server. Here every size is drawn locally from your original, and nothing leaves the device.',
  },
  'video-to-gif': {
    how: 'Your browser opens the video with its own built-in decoder, the same one that plays it in the player above. Stayput seeks to each moment you asked for, copies that frame onto a canvas at the width you chose, and gifenc (MIT) picks the best 256 colours for it and compresses it. The GIF is assembled frame by frame in memory in your tab.',
    versus: 'Online GIF makers upload the whole video to trim a few seconds of it, cap the file size, and often stamp a watermark on the result. Personal clips of family, pets or a screen with your inbox on it are exactly what should not sit on a stranger’s server. Here the video never leaves your device, whatever its size.',
  },
  'blur-image': {
    how: 'Your browser decodes the photo (libheif or the Squoosh decoders step in for HEIC, AVIF and JPEG XL) and draws it on a canvas in your tab. Each area you mark is pixelated by averaging blocks of pixels, blurred by three passes of a box blur that reads the pixels around the area so the edge blends in, or filled with solid black. The same code draws the preview and the full-size file, which is encoded once in the format you chose. Find faces runs Google’s MediaPipe face detector (Apache-2.0) as WebAssembly in your tab, loaded from this site only when you press the button.',
    versus: 'The photos people blur are the ones that should not be uploaded: a child’s face, a car’s number plate, a bank screenshot, an ID card. Online blur tools and editors take the unblurred original onto their server first, and several ask for an account before the download. Here the original never leaves your device.',
  },
  'rotate-image': {
    how: 'Your browser decodes each image (libheif or the Squoosh decoders step in for HEIC, AVIF and JPEG XL), applying the EXIF orientation so the starting point is what you see. Stayput then draws it onto a canvas turned by a quarter, a half or three quarters and mirrored if you asked, which moves every pixel exactly without resampling, and encodes the result once in the format you chose.',
    versus: 'Rotating a photo is a one-second job that upload-based sites turn into a transfer of the whole file to their server, and design apps into a sign-up. Here a batch of phone photos is turned on your device, and the originals are never copied anywhere.',
  },
  'video-to-mp3': {
    how: 'Your browser decodes the sound track with the same audio decoders it uses to play media on any website (AAC for MP4, MOV and M4A; Opus or Vorbis for WebM; FLAC, WAV and MP3). The samples are resampled to 44.1 kHz and handed to LAME, the reference MP3 encoder, compiled to WebAssembly and served by this site. WAV files are written directly by a few lines of code in the page. Everything happens in memory in your tab.',
    versus: 'Online converters upload the whole video just to keep its sound, cap free files at a few hundred megabytes, and make you wait in a queue. Home videos, lectures and voice memos are personal. Here the file never leaves your device, so a 2 GB video converts as fast as your computer can read it.',
  },
  'trim-video': {
    how: 'Your browser plays the video from the file on your device so you can pick the start and end. Mediabunny (MPL-2.0) then reads the MP4, MOV, WebM or MKV container in your tab and copies the packets between those two points into a new file of the same type, starting from the nearest key frame within half a second. When there is none that close, or when you ask for an exact cut, the clip is decoded and re-encoded by your browser’s own video encoder (WebCodecs).',
    versus: 'Online video cutters upload the whole file just to throw most of it away, cap free videos at a few hundred megabytes and often add a watermark. Here nothing is uploaded, and a clip from a 2 GB recording is cut in seconds because the video is copied rather than re-encoded.',
  },
  'compress-gif': {
    how: 'gifuct-js (MIT) reads the GIF byte by byte in your tab and every frame is composited the way browsers play it, honouring each frame’s delay and disposal rule. The frames are then written back with gifenc’s (MIT) colour quantizer and LZW coder: each frame after the first stores only the rectangle that changed, with unchanged pixels left transparent, and the stronger levels use fewer colours and ignore changes too small to see. The new GIF is assembled in memory.',
    versus: 'Online GIF compressors upload the file to optimise it on their server, cap free files at around 50 MB, keep uploads for a while, and some add a watermark. Screen recordings and reaction GIFs of friends are often personal. Here the GIF never leaves your device, and you can compress a whole folder at once.',
  },
  'compress-png': {
    how: 'UPNG.js (MIT), the PNG codec from the Photopea editor, reads the PNG byte by byte in your tab, so the exact pixels are used, not a canvas copy. For lossy compression it reduces the image to a palette of up to 256 colours chosen for that image and writes an 8-bit PNG with full transparency; lossless mode keeps every pixel and picks the tightest colour type and filters. The result is compressed with pako’s deflate (MIT) and saved from memory.',
    versus: 'TinyPNG and similar sites upload every PNG to their server, limit free use to a handful of files at 5 MB each, and keep the files for a while. Screenshots, design exports and logos are often confidential. Here they never leave your device, and there is no daily limit or file cap.',
  },
  'mute-video': {
    how: 'Mediabunny (MPL-2.0), a media toolkit written in TypeScript, reads the MP4, MOV, WebM or MKV container in your tab and copies every video packet into a new file of the same type, leaving the sound track out. Nothing is decoded or re-encoded, so the picture is bit-for-bit the same and the job takes about as long as reading the file.',
    versus: 'Online tools that remove audio upload the whole video to do it, cap free files at a few hundred megabytes, and often re-encode the picture or add a watermark. Here nothing is uploaded, the picture is untouched, and a 2 GB file is done in seconds.',
  },
  'resize-video': {
    how: 'Mediabunny (MPL-2.0) reads the MP4, MOV, WebM or MKV container in your tab. Your browser’s own video decoder and encoder (WebCodecs) decode each frame, scale it to the new size and encode it again, H.264 where the browser has it and VP9 or AV1 otherwise. The sound is copied as it is when the MP4 can hold it, and Mediabunny writes the new MP4 in memory.',
    versus: 'Online resizers upload the whole video before they start, which for a 4K phone clip can take longer than the resize, cap free files at a few hundred megabytes, and often add a watermark. Here the video never leaves your device.',
  },
  'rotate-video': {
    how: 'Mediabunny (MPL-2.0) reads the MP4, MOV, WebM or MKV container in your tab. Each frame is decoded by your browser (WebCodecs), turned and flipped, and encoded again, H.264 where the browser has it and VP9 or AV1 otherwise, so the turn is part of the picture rather than a flag some players ignore. The sound is copied as it is when the MP4 can hold it.',
    versus: 'Online rotators upload the video to turn it on a server, cap the file size, and some add a watermark. A sideways phone video is often a personal one. Here it never leaves your device, and you can rotate a batch at once.',
  },
  'crop-video': {
    how: 'Your browser shows a frame from the video on your device so you can draw the box. Mediabunny (MPL-2.0) then reads the MP4, MOV, WebM or MKV container in your tab; each frame is decoded by your browser (WebCodecs), cut to the box, and encoded again, H.264 where available and VP9 or AV1 otherwise. The sound is copied as it is when the MP4 can hold it.',
    versus: 'Online croppers upload the whole video to change its frame, cap free files at a few hundred megabytes, and many stamp a watermark on the result. Here the video never leaves your device.',
  },
  'video-speed': {
    how: 'Mediabunny (MPL-2.0) decodes the video in your tab and gives every frame a new time; when speeding up, frames beyond 60 a second are dropped. The sound track is decoded by your browser and stretched with WSOLA, a method that overlaps short slices of sound so the pitch stays the same. Both are encoded again by your browser (WebCodecs) into an MP4, H.264 and AAC where available.',
    versus: 'Online speed changers upload the video to process it, cap free files, and often add a watermark or turn voices into chipmunks. Here the video stays on your device and the sound keeps its pitch.',
  },
  'merge-videos': {
    how: 'Mediabunny (MPL-2.0) reads each MP4, MOV, WebM or MKV clip in your tab. Your browser decodes the frames (WebCodecs), draws them one clip after another onto a picture the size of the first clip, and encodes the whole once into an MP4, H.264 where available and VP9 or AV1 otherwise. Each clip’s sound is decoded by your browser and laid end to end to match.',
    versus: 'Online video mergers upload every clip before they start, cap free files at a few hundred megabytes, and often stamp a watermark on the result. Here the clips never leave your device.',
  },
  'add-audio-to-video': {
    how: 'Mediabunny (MPL-2.0) reads the MP4, MOV, WebM or MKV video in your tab and copies its picture packet by packet into a new file, with no re-encoding. The sound file is decoded by your browser, looped or cut and faded to the length of the video, mixed with the video’s own sound if you asked, and encoded as AAC (or Opus) by your browser (WebCodecs).',
    versus: 'Online editors upload the video and the song to a server, re-encode the whole picture, cap free exports and often add a watermark. Here nothing leaves your device and the picture is not touched.',
  },
  'reverse-video': {
    how: 'Mediabunny (MPL-2.0) reads the MP4, MOV, WebM or MKV container in your tab. Because video can only be decoded forwards, your browser (WebCodecs) decodes it in short windows from the end to the start; each window’s frames are held in memory, encoded last first, and freed. The sound is decoded by your browser and reversed. Both go into an MP4, H.264 and AAC where available.',
    versus: 'Online reversers upload the clip to a server, limit free videos to a short length, and often add a watermark. Here the video never leaves your device.',
  },
  'video-to-jpg': {
    how: 'Mediabunny (MPL-2.0) reads the MP4, MOV, WebM or MKV container in your tab and asks your browser’s own decoder (WebCodecs) for only the frames you chose. Each one is drawn upright onto a canvas at full size and saved as JPG or PNG by your browser.',
    versus: 'Online frame extractors upload the whole video to grab a few images, cap free videos by size or length, and some watermark the frames. Here the video never leaves your device.',
  },
  'trim-audio': {
    how: 'Your browser’s own audio decoders read the file (MP3, AAC in M4A or MP4, Opus or Vorbis in WebM and OGG, FLAC, WAV) into plain samples in your tab. The part you chose is copied, faded if asked, and written as MP3 by LAME compiled to WebAssembly, or as a 16-bit WAV.',
    versus: 'Online audio cutters upload your file to a server, surround the download with ads, and some keep the file. Voice memos, interviews and unreleased tracks are private. Here the sound never leaves your device.',
  },
  'audio-converter': {
    how: 'Your browser decodes the sound with the decoders it uses to play media on any website. The new file is written in your tab: MP3 by LAME compiled to WebAssembly, WAV by a few lines of code, FLAC by a small lossless encoder in this site’s code (fixed predictors and Rice coding, as the FLAC format describes), and M4A or OGG by the browser’s own AAC and Opus encoders (WebCodecs), packed by Mediabunny (MPL-2.0). WAV and FLAC keep the original sample rate.',
    versus: 'Online audio converters upload every file, queue it, cap free use at a few files or a few hundred megabytes, and keep the upload for hours. Recordings of meetings, unreleased songs and voice memos are private. Here the files never leave your device and a whole folder converts at once.',
  },
  'qr-code-generator': {
    how: 'A QR encoder written for this site (byte mode, versions 1 to 40, Reed–Solomon error correction and the standard’s mask scoring) turns your text into the grid of squares in your tab. The PNG is drawn on a canvas by your browser and the SVG is written as one path, so both are exact, with no blur.',
    versus: 'Most QR code sites make you sign up, send your link and Wi-Fi password to their servers, and hand out “dynamic” codes that redirect through their domain, so they can count scans and switch your code off when a trial ends. Here the code holds your text directly, never expires, and nothing you type leaves your device.',
  },
  'screen-recorder': {
    how: 'Your browser’s own screen picker (getDisplayMedia) lets you choose what to share, and its built-in recorder (MediaRecorder) writes the video in your tab, as MP4 in Chrome, Edge and Safari or WebM in Firefox. When you stop, Mediabunny (MPL-2.0) copies the video into a fresh file without re-encoding so its length is written and players can seek it.',
    versus: 'Online screen recorders make you install an extension or desktop app, sign up, stamp a watermark on free recordings, cap them at a few minutes, and upload the video to their servers to share it. Screens show emails, chats, dashboards and customer data. Here the recording never leaves your device.',
  },
  'voice-recorder': {
    how: 'Your browser records the microphone with its built-in recorder (MediaRecorder), with its own noise and echo reduction if you leave it on. When you stop, the sound is decoded and written in your tab: MP3 by LAME compiled to WebAssembly, WAV by a few lines of code, or M4A by the browser’s AAC encoder.',
    versus: 'Online voice recorders upload the recording to their servers to convert it, show ads around the download, and some keep your recordings in an account. Voice memos, interviews and dictation are private. Here the sound never leaves your device.',
  },
  'volume-booster': {
    how: 'Your browser decodes the sound with its own audio decoders. Every sample is multiplied by the gain you chose (or the gain that brings the gated loudness to about −14 LUFS), then a look-ahead peak limiter turns down only the moments that would pass −1 dBFS, easing in over 5 ms and out over 150 ms. The file is written again in your tab: MP3 by LAME in WebAssembly, WAV and FLAC by code in this site, M4A and OGG by the browser’s own encoders. For a video, Mediabunny (MPL-2.0) copies the picture packets unchanged and adds the new sound.',
    versus: 'Online volume boosters upload the recording or video, cap the file size, and often just multiply the samples so loud parts clip and crackle. Here nothing leaves your device and the limiter keeps boosted sound clean.',
  },
  'remove-noise': {
    how: 'Your browser decodes the sound with its own audio decoders. RNNoise (BSD-3-Clause, from Xiph.Org and Mozilla), a small recurrent neural network compiled to WebAssembly, then reads it 10 ms at a time at 48 kHz, estimates how much of each frequency band is voice, and turns the rest down. The file is written again in your tab: MP3 by LAME in WebAssembly, WAV and FLAC by code in this site, M4A and OGG by the browser’s own encoders. For a video, Mediabunny (MPL-2.0) copies the picture packets unchanged and adds the cleaned sound.',
    versus: 'Online noise removers upload your recording to their servers, cap free use at a few minutes, and often ask for an account before you can download. Interviews, voice notes and meetings are private. Here the network runs on your device and the sound never leaves it.',
  },
  'merge-audio': {
    how: 'Your browser’s own audio decoders read each file (MP3, AAC in M4A or MP4, Opus or Vorbis, FLAC, WAV) into plain samples at 44.1 kHz in your tab. The sounds are laid end to end, with equal-power crossfades if you chose them, and written once as MP3 by LAME compiled to WebAssembly, or as a 16-bit WAV.',
    versus: 'Online audio joiners upload every file, cap free use at a few files or a few minutes, and keep the uploads on their servers. Here the files never leave your device, and there is no limit on how many you join.',
  },
  'mic-test': {
    how: 'Your browser opens the microphone (getUserMedia) with its own clean-up turned off, and the Web Audio API measures the level of each moment of sound in your tab. The play-back check is recorded by the browser’s built-in recorder into memory and played straight back.',
    versus: 'Many online mic tests record you and upload the clip to play it back, or run ads and trackers around the test. Here nothing is stored or sent: the sound goes from your microphone to this tab and nowhere else.',
  },
  'webcam-test': {
    how: 'Your browser opens the camera (getUserMedia) and shows it in a video element on this page. The resolution comes from the picture itself, the frame rate is counted from the frames that actually arrive, and a snapshot is drawn to a canvas and saved as JPG by your browser.',
    versus: 'Many online webcam tests send your picture to their servers to take a photo or record a clip, and run ads and trackers around the test. Here the picture goes from your camera to this tab and nowhere else.',
  },
  'audio-to-video': {
    how: 'Your browser decodes the sound into plain samples, draws the picture once onto a canvas (fitted whole over a blurred copy, or the title on a plain colour), and its own WebCodecs encoders write that still frame once a second with the sound as AAC or Opus. Mediabunny (MPL-2.0) packs them into an MP4.',
    versus: 'Online MP3-to-video converters upload your music and cover art, add their logo to free videos, and cap the length. Unreleased tracks and private recordings stay private here: nothing leaves your device.',
  },
  'compress-audio': {
    how: 'Your browser decodes the sound with its own audio decoders. When you set a size limit, the bitrate is worked out from the length of the sound so the file lands under it. The smaller file is then written in your tab, as MP3 by LAME compiled to WebAssembly or as OGG by the browser’s own Opus encoder (WebCodecs) with Mediabunny (MPL-2.0) writing the container.',
    versus: 'Online audio compressors upload the recording before they shrink it, which for a large WAV is the slowest part, and cap free files at 50 to 100 MB. Here nothing is uploaded, so there is no cap and private recordings stay on your device.',
  },
  'add-text-to-image': {
    how: 'Your browser decodes each image (libheif or the Squoosh decoders step in for HEIC, AVIF and JPEG XL) and draws it on a canvas in your tab at full size. Your text is wrapped to fit, then drawn with the canvas text functions at a size that is a share of the image, with an outline, shadow or backing box if chosen, and the result is encoded once in the format you picked. Fonts come from your device, apart from the site’s own Archivo and Caveat.',
    versus: 'Online text and meme tools upload the picture, many stamp their own watermark on the free version, and some keep the uploads to show in a public gallery. Here the image never leaves your device and the file you save carries no mark but yours.',
  },
  'split-image': {
    how: 'Your browser decodes the picture (libheif or the Squoosh decoders step in for HEIC, AVIF and JPEG XL). When the tiles must be square or 4:5, the middle of the picture is kept at the right proportions. Each tile is then copied pixel for pixel from the original onto its own canvas, without scaling, and encoded once in the format you chose.',
    versus: 'Grid and carousel apps ask for your whole photo library, add a watermark unless you subscribe, and web versions upload the picture. Here it never leaves your device and the tiles carry no mark.',
  },
  'collage-maker': {
    how: 'Your browser decodes each picture (libheif or the Squoosh decoders step in for HEIC, AVIF and JPEG XL). The layout is worked out with plain arithmetic: pictures in a row share a height, in a stack share a width, and in a grid get equal cells, cropped from the middle or fitted whole. Each picture is then drawn once at its place on a single canvas in your tab with high-quality scaling, and the collage is encoded in the format you chose.',
    versus: 'Collage apps and websites upload every photo, lock layouts behind a subscription and often add their logo to the result. Here the photos never leave your device and the collage carries no mark.',
  },
  'extract-pdf-images': {
    how: 'pdf.js (Apache 2.0), the PDF engine inside Firefox, opens the file in your tab and lists every drawing instruction on each chosen page. Each instruction that paints a stored picture hands over that picture decoded at its own size, whatever the format inside the PDF (JPEG, JPEG 2000, Flate, JBIG2 or fax-style CCITT), with any transparency mask applied. It is then saved as PNG or JPG. Pictures smaller than 50 pixels and repeats found by comparing a small thumbnail are left out unless you untick those options.',
    versus: 'Online extractors upload the whole PDF to pull out a few photos, and the PDFs people mine for pictures are often private: contracts with scanned signatures, property reports, medical letters, a friend’s wedding brochure. Here the file never leaves your device, and every image comes out at its stored resolution rather than as a screenshot of the page.',
  },
  'pitch-changer': {
    how: 'Your browser’s own audio decoders read the file in the tab. The speed is changed with WSOLA (waveform-similarity overlap-add): the sound is cut into overlapping 43 ms windows, spread out or packed together, and each window is nudged to line up with the one before so there are no clicks. The pitch is then moved by resampling through a windowed-sinc filter, which also shortens or lengthens the sound, so the stretch is sized to leave exactly the speed you asked for. The result is written with the same encoders as the audio converter.',
    versus: 'Online pitch shifters upload the whole song or recording and many cap the length or the number of files on a free plan. Here the file never leaves your device, a whole album can go in one batch, and nothing is added to the sound.',
  },
  'tuner': {
    how: 'Your browser opens the microphone (getUserMedia) with its noise suppression and automatic gain turned off, and the Web Audio API hands this page about 85 ms of sound twenty times a second. Each slice is compared with delayed copies of itself (the McLeod pitch method) to find the period of the note, which gives its frequency to a fraction of a hertz; the reading is then dropped. The string buttons play a tone from a Web Audio oscillator.',
    versus: 'Tuner apps ask for an install and access to much more than the microphone, and many tuner websites are buried in ads and trackers. Here the sound goes from your microphone to this tab and nowhere else, and nothing is kept.',
  },
  'metronome': {
    how: 'A Web Audio oscillator makes each click, shaped by a gain envelope a few milliseconds long. Every 25 ms the page schedules the clicks due in the next 120 ms at exact times on the audio clock, which is driven by your sound card rather than the page’s timers, and the beat lights are drawn from the same clock. Tap tempo takes the median gap between your last eight taps.',
    versus: 'Metronome apps want an install and often a subscription for odd time signatures or subdivisions, and metronome websites run ads and trackers that can make the page stutter. This one has every setting free, no ads, and keeps working offline.',
  },
  'fill-pdf-form': {
    how: 'pdf-lib reads the form’s fields (AcroForm) and where each one sits on the page, and pdf.js draws every page in your tab with the fields left off. The fields are laid over the pages as ordinary inputs. When you save, pdf-lib writes your answers into the same fields, draws their appearance with the standard Helvetica font, and, if you ask, flattens them into the page.',
    versus: 'Online form fillers upload the whole form, answers included, and many keep it on their servers or put the download behind an account. Here the form and everything you type into it stay on your device.',
  },
  'blur-face-video': {
    how: 'Mediabunny (MPL-2.0) reads the video and your browser’s WebCodecs decoder turns it into frames. About ten times a second, Google’s MediaPipe face detector (BlazeFace, Apache-2.0) scans the frame on your device, whole and in overlapping halves for small faces. Each face is covered on a canvas, and kept covered for half a second after it was last seen, before the frame goes to the browser’s own H.264 encoder (VP9 or AV1 where H.264 is missing). The sound is copied as it is.',
    versus: 'Online face-blurring services upload the whole video to run their AI, and video editors make you draw and move a mask by hand, frame by frame. Here the detection is automatic and happens on your device, so the faces you are hiding are never sent anywhere.',
  },
  'remove-silence': {
    how: 'Your browser’s own audio decoders turn the file into plain samples in your tab. The level is measured in 10 ms windows, using the loudest channel, and every quiet stretch longer than your chosen length is cut down to the pause you chose, with a 5 ms fade at each join. The sound is then written again: MP3 by LAME in WebAssembly, WAV and FLAC by code in this site, M4A and OGG by the browser’s own encoders.',
    versus: 'Online silence removers upload the recording, cap free files by length or size, and some keep the uploads. Here nothing is uploaded and there is no cap, which matters for long lectures and for private interviews.',
  },
  'image-to-svg': {
    how: 'Your browser decodes the image in the tab. It is scaled so its longest side is between 400 and 1,000 pixels (800 for the Detailed style) and handed to imagetracerjs (public domain), running in a background worker. The colours are reduced to a palette (2, up to 8 or up to 32), the outline of every area of each colour is traced, and each outline is fitted with straight lines and quadratic curves. The shapes are scaled back to the image’s own width and height and written as SVG paths. Black and white first sets each pixel to black or white with a threshold chosen from the image’s own brightness (Otsu’s method).',
    versus: 'Online vectorizers upload your artwork, and the good ones charge per image or add a watermark to the free result. Here the logo or drawing is traced on your device, as many files as you like, with a preview beside the original before you download.',
  },
  'gif-maker': {
    how: 'Your browser decodes each picture in the tab. Every frame is the shape of the first picture at the width you choose, and each picture is drawn onto it whole or cropped to fill. gifenc (MIT) picks the best 256 colours for each frame, maps the pixels onto them and compresses the frame with LZW, with the time per picture and the loop setting written into the GIF. The file is assembled in memory.',
    versus: 'Online GIF makers upload every picture, and many stamp a watermark on the free result or ask you to sign up first. Here the pictures stay on your device, there is no watermark, and the preview plays the exact timing before you make the file.',
  },
  'flatten-pdf': {
    how: 'pdf-lib (MIT) reads the PDF in your tab. Fields filled in by an app that did not draw them get their appearance drawn first. Then each form field and annotation’s own appearance is placed into the page exactly where a reader shows it (scaled from its bounding box onto its rectangle, as the PDF specification describes) and the annotation is removed, along with the form. Links keep working, and sticky notes with no drawing of their own stay as notes. The image option instead renders each page with pdf.js (Apache-2.0) at 150 dpi, annotations included, and builds a new PDF from the pictures.',
    versus: 'Online flatteners upload the filled-in form, which is usually the most personal document you have: tax returns, applications, contracts, medical forms. Here it is flattened on your device, and text stays real text unless you ask for images.',
  },
  'resize-pdf': {
    how: 'pdf-lib (MIT) opens the PDF in your tab. Each page gets the new paper size, turned to match the page as it is shown, and its existing content is wrapped in a single transform that scales it to fit inside the margin and centres it, with a clip at the old page edge. Nothing is redrawn or rasterised, so text, vector drawings and images are unchanged. Links, form fields and comments are moved and scaled by the same amount.',
    versus: 'Online resizers upload the PDF, and many rasterise the pages or cap free use. Here the document stays on your device, the text stays real text, and there is no limit on pages or files.',
  },
  'transcribe': {
    how: 'Your browser’s own decoders read the sound, from an audio file or a video’s soundtrack, and it is resampled to 16 kHz mono in the tab. The recording is cut at pauses into pieces of up to 28 seconds, and each piece goes to OpenAI’s Whisper base model (MIT), 8-bit ONNX weights run by transformers.js (Apache-2.0) and onnxruntime-web (MIT) in a background worker. The model, 76 MB, is downloaded from this site on first use and cached. Its timed segments become paragraphs, SRT or WebVTT.',
    versus: 'Online transcription services upload the recording to their servers, cap free minutes, and some keep your audio to train their models. Here the model runs on your device: nothing is uploaded, there is no minute limit, and it works offline after the first run.',
  },
  'add-subtitles-to-video': {
    how: 'Without a subtitle file, the soundtrack is transcribed exactly as in Transcribe: decoded in your tab at 16 kHz, cut at pauses, and timed by OpenAI’s Whisper base model (MIT) running in a background worker through transformers.js (Apache-2.0) and onnxruntime-web (MIT). With an SRT or WebVTT file, its captions are read as they are. Each caption is wrapped to fit the width of the picture, two lines at most, and a long one becomes several in a row. Mediabunny (MPL-2.0) then decodes the video, every frame is drawn on a canvas with the caption that is due, and your browser’s own video encoder (WebCodecs) writes a new MP4, with the sound copied across.',
    versus: 'Online captioning apps upload the whole video, cap free minutes, and many stamp their logo on the result or keep it for training. Here the video and its words stay on your device, with no watermark and no minute limit.',
  },
  'vocal-remover': {
    how: 'Your browser’s own decoders read the song, from an audio file or a video’s soundtrack, at 44.1 kHz stereo. It is cut into pieces of about six seconds, and each piece becomes a spectrogram (a short-time Fourier transform with a 6144-point window, as the model was trained with). UVR-MDX-NET Inst HQ 3, an MDX-Net model from the Ultimate Vocal Remover project (MIT), predicts the spectrogram of the music without the voice; it runs through onnxruntime-web (MIT) on the graphics chip with WebGPU where the browser has it, or on the CPU with WebAssembly. The answer is turned back into sound, and the vocals are the song minus the music.',
    versus: 'Online vocal removers upload the whole song, queue it, cap free minutes or songs per day, and ask for an account to download WAV. Here the song never leaves your device, there is no limit, and the model works offline after the first run.',
  },
  'video-to-mp4': {
    how: 'Mediabunny (MPL-2.0), a media toolkit written in TypeScript, reads the MOV, MKV, WebM or MP4 container in your tab. H.264 video and AAC or MP3 sound are copied into the new MP4 packet by packet, which takes seconds and changes nothing in the picture. Other video (VP8, VP9, AV1) is decoded and re-encoded by your browser’s own video encoder through WebCodecs, H.264 where available, and other sound becomes AAC or Opus. The MP4 is written in memory.',
    versus: 'Online converters upload the whole video just to rewrap it, which can take longer than the conversion itself, cap free files at 100 MB to 1 GB, and keep a copy on their server. Here the file never leaves your device, and a large MOV from your phone converts in seconds because nothing is re-encoded that does not need to be.',
  },
  'compress-video': {
    how: 'Mediabunny (MPL-2.0), a media toolkit written in TypeScript, reads the MP4, MOV, WebM or MKV container in your tab. Your browser’s own hardware-backed video decoder and encoder (WebCodecs) re-encode the picture at the bitrate and size you chose, H.264 where available and VP9 or AV1 otherwise, and the sound as AAC or Opus. Mediabunny then writes a new MP4 in memory. For a target size, the bitrate is worked out from the length of the video, and the resolution is lowered when a long video would otherwise turn to mush.',
    versus: 'Online compressors upload the whole video before they start, cap free files at a few hundred megabytes, and often add a watermark or a queue. Phone videos are some of the most personal files people have. Here the video never leaves your device, and a 2 GB file is compressed as fast as your computer can encode it.',
  },
  'gif-to-mp4': {
    how: 'Stayput reads the GIF byte by byte in your tab with gifuct-js (MIT), decompresses each frame and composites it the way browsers play GIFs, honouring each frame’s delay and disposal rule. Every finished frame goes to your browser’s own video encoder through WebCodecs: H.264 where the browser has one (Chrome, Edge, Safari), VP9 or AV1 where it does not. The encoded frames are written into an MP4 container by mp4-muxer (MIT), all in memory.',
    versus: 'GIF to MP4 sites upload the file to convert it on a server, cap the size, and some add a watermark or keep the file for hours. Here the conversion runs on your device, so a reaction GIF, a screen recording of your product or a clip of your kids never leaves it, and the page keeps working offline.',
  },
  'image-to-text': {
    how: 'Your browser decodes the image (libheif or the Squoosh decoders step in for HEIC, AVIF and JPEG XL), enlarges small screenshots so letters are big enough to read, and hands the pixels to Tesseract, the open-source OCR engine first built at HP and later developed by Google, compiled to WebAssembly by tesseract.js (Apache-2.0). Its neural network model for English is served by this site and loaded the first time you run it. The text is recognised line by line inside a worker in your tab.',
    versus: 'The pictures people want text from are often private: a letter, a receipt, a bank statement, a prescription, a screenshot of a conversation. Online OCR sites upload the image to their server to read it and keep it for hours, and several limit free use or ask for an account. Here the image never leaves your device, and the page keeps working with Wi-Fi off.',
  },
  'remove-background': {
    how: 'ISNet, an open image segmentation model (Apache 2.0), runs in a web worker through onnxruntime-web compiled to WebAssembly. Your photo is shrunk to 1024 × 1024 in memory, the model marks every pixel as subject or background, and that mask is scaled back up and applied to the original pixels on a canvas, so the cut-out keeps full resolution. The model and runtime are served from this site, downloaded once and cached.',
    versus: 'Online background removers upload your photo, give back a small preview for free and charge for the full-size file. Here the full-size cut-out is made on your device, with no credits, no watermark and no copy of your photo on anyone’s server.',
  },
  'passport-photo': {
    how: 'Two open models run in your tab. MediaPipe’s BlazeFace face detector (Apache 2.0) finds your eyes and mouth, from which the chin is estimated, and ISNet (Apache 2.0) running on onnxruntime-web finds the outline of your head, whose highest point is the top of your hair. The photo is scaled so the head fills the middle of the allowed range, drawn at 600 pixels per inch, and tiled onto a 4 × 6 inch sheet at 300 pixels per inch with cut lines.',
    versus: 'Passport photo sites and apps upload a picture of your face to crop it, and many charge to download the result or to remove a watermark. A face photo for an identity document is exactly the file you want to keep to yourself. Here it never leaves your device, and the print sheet costs whatever your local photo counter charges for a 4 × 6.',
  },
  'watermark-image': {
    how: 'Your browser decodes each photo (libheif or the Squoosh decoders step in for HEIC, AVIF and JPEG XL) and draws it on a canvas in your tab at full size. The text is drawn on top with your device’s own fonts at the chosen opacity, sized to the photo’s shorter side so the same setting looks alike on every photo, and the canvas is saved as JPG, PNG or WebP by the browser’s own encoder.',
    versus: 'Watermark sites and apps upload the photos you most want to protect, the unpublished ones, and several add their own branding on the free tier. Here the photos never leave your device, and there is no limit on how many you do at once.',
  },
  'watermark-pdf': {
    how: 'pdf-lib (MIT) opens the PDF in your tab. For each page size, the watermark is drawn once on a transparent canvas at about 216 dpi and embedded as a PNG, then placed over every page of that size, following each page’s crop box and rotation. The original page content is not rewritten, so text, links and forms are untouched.',
    versus: 'Online PDF watermark tools upload the whole document to add a line of text to it, and the documents people watermark are the confidential ones. Here nothing is sent anywhere, there is no page or file limit, and nothing but your watermark is added.',
  },
  'remove-pdf-metadata': {
    how: 'pdf-lib (MIT) parses the PDF in your tab (an encrypted file is first decrypted by qpdf, compiled to WebAssembly and served from this site). The trailer’s information dictionary and file ID are dropped, every /Metadata XMP stream and /PieceInfo entry is unlinked from the catalog, pages, images and fonts, and every object nothing refers to any more is deleted before the file is written back out, so the removed data is really gone rather than just hidden.',
    versus: 'The PDFs people clean before sharing are the ones where the author matters: CVs, legal filings, reports sent anonymously, documents for a client who should not see who drafted them. Uploading them to a metadata-removal site hands the full document, name included, to a stranger. Here nothing is sent anywhere.',
  },
  'upscale-image': {
    how: 'Your browser decodes the picture. Real-ESRGAN general x4v3 (BSD-3-Clause, Xintao Wang and others), a compact neural network, runs in a web worker through onnxruntime-web (MIT) compiled to WebAssembly. It enlarges the picture 4× in overlapping 128-pixel tiles whose seams are cut away; for 2× and 3× the picture is first shrunk so that 4× lands on the size you asked for. Transparency is enlarged separately and put back. The result is saved by your browser’s own image encoder.',
    versus: 'Online AI upscalers upload your photo to a GPU server, limit free use to a few images a day, add watermarks or ask for an account, and keep the upload. Here the network runs on your device and the picture never leaves it.',
  },
  'remove-object': {
    how: 'Your browser decodes the photo and you paint the area to remove on a canvas. MI-GAN (MIT, Picsart AI Research), an inpainting network built to run on phones, runs in a web worker through onnxruntime-web (MIT) compiled to WebAssembly. The model crops around the painted area, fills it at 512 × 512 from the surrounding pixels and blends it back at full size; only painted pixels change. The result is saved by your browser’s own image encoder.',
    versus: 'Online magic erasers upload your photo to a GPU server, often cap the free size, add a watermark or ask for an account, and keep the upload. The photos people clean up are often personal: family, homes, holidays. Here the network runs on your device and the photo never leaves it.',
  },
  'adjust-image': {
    how: 'Your browser decodes each photo (libheif or the Squoosh decoders step in for HEIC, AVIF and JPEG XL) and draws it on a canvas in your tab. Brightness is a gamma curve and contrast an S-shaped stretch around middle grey, both applied through a 256-entry lookup table per channel; warmth shifts red against blue, saturation mixes each pixel with its own Rec. 709 brightness, and sharpening is an unsharp mask: the picture plus a share of its difference from a blurred copy. The browser then saves the canvas as JPG, PNG or WebP.',
    versus: 'Online photo editors upload the picture for a slider move a phone could do offline, and many add a watermark or keep the upload. Here the photos stay on your device, a whole batch gets the same settings in one go, and the result is compressed only once.',
  },
  'black-and-white-image': {
    how: 'Your browser decodes each image (libheif or the Squoosh decoders step in for HEIC, AVIF and JPEG XL) and draws it on a canvas in your tab. Each pixel’s brightness is computed with the Rec. 709 weights, the way the eye weighs red, green and blue. High contrast stretches the tones to the full range; pure black and white picks the split point with Otsu’s method, which finds the threshold that best separates ink from paper. The browser then saves the canvas as JPG, PNG or WebP.',
    versus: 'Photo filter sites upload your pictures to apply a filter a phone could do offline, and many add a watermark or keep the images. Here the photos stay on your device, there is no limit on how many you convert at once, and the result is not recompressed more than once.',
  },
  'grayscale-pdf': {
    how: 'pdf-lib (MIT) opens the PDF in your tab and draws one neutral grey rectangle over each page with the PDF Saturation blend mode. Blending keeps the brightness of whatever is underneath and takes the grey’s zero saturation, so every colour, in text, drawings and photos alike, turns into its own shade of grey. Nothing on the page is rewritten or re-rendered, so text stays text.',
    versus: 'Most online converters rasterise every page to make it grayscale, which uploads your document, makes text unselectable and often makes the file much larger. Here nothing leaves your device, text stays sharp and searchable, and the file grows by a few hundred bytes.',
  },
  'crop-pdf': {
    how: 'pdf.js (Apache 2.0) draws each page in your tab so you can see what you are keeping. Trim white margins renders every page at 72 dpi and finds the smallest box holding all the ink. When you save, pdf-lib (MIT) sets each page’s media and crop box to that area, mapped through the page’s rotation. The page content itself is not re-rendered, so text stays sharp and selectable and the file barely changes size.',
    versus: 'Online PDF croppers upload the whole document to change four numbers per page, and several only crop the first pages on a free plan or add a watermark. Here the file never leaves your device, every page is cropped, and nothing is added.',
  },
  'redact-pdf': {
    how: 'pdf.js (Apache 2.0) renders each page in your tab and reads its text layer, so a search finds every match with its position. When you save, each page with a box is rendered at 200 dpi, the boxes are painted onto the pixels, and pdf-lib (MIT) replaces that page’s content with the image. The old text, fonts, links, comments and form values on those pages are then deleted from the file along with its metadata, so nothing is left under the black.',
    versus: 'Redacting on a website means uploading the exact document you are trying to keep private, and many free editors only draw a black rectangle on top, so the name or number underneath can still be copied, searched or extracted. Here the file never leaves your device and the text under each box is removed, not hidden.',
  },
  'sticker-maker': {
    how: 'The same open segmentation model as the background remover (ISNet, Apache 2.0, running on onnxruntime-web in a web worker) marks the subject. The cut-out is trimmed to the subject’s bounds, and the border is drawn by stamping a tinted silhouette of it in rings around the edge on a canvas, so it follows every curve. The canvas is saved as PNG or WebP by your browser.',
    versus: 'Sticker apps and sites upload your photos of people and pets to a server to cut them out, and many add a watermark or ask for a subscription. Here the photo never leaves your device and the sticker is yours at full size.',
  },
  'profile-picture-maker': {
    how: 'Two open models run in your tab: MediaPipe’s BlazeFace (Apache 2.0) finds your face and eyes, and ISNet (Apache 2.0) on onnxruntime-web cuts you out of the photo. The cut-out is scaled and placed so the face sits in the standard headshot position, over a solid colour, clipped to a circle if you choose, and saved at 1024 × 1024 by your browser.',
    versus: 'Profile picture and AI headshot apps upload your face, often keep it to train models, and charge for the full-size file. Here your photo is processed on your device, and the result is yours at full size with no watermark.',
  },
  'color-picker': {
    how: 'Your browser decodes the image (libheif or the Squoosh decoders step in for HEIC, AVIF and JPEG XL) and draws it on a canvas in your tab. The colour under the cursor is read straight from that canvas, one pixel at a time, at up to 4096 pixels across, so a pick matches the file exactly. The main colours come from k-means clustering over a sample of about 20,000 pixels, run in the page with a fixed seed so the same image always gives the same palette.',
    versus: 'Colour pickers online upload the picture to show it back to you, which is a strange trade for a screenshot of a client’s unreleased design or a photo from your phone. Browser extensions that pick colours can read every page you visit. Here the image never leaves your device, and there is nothing to install.',
  },
  'favicon-generator': {
    how: 'Your browser decodes the logo (libheif or the Squoosh decoders step in for HEIC, AVIF and JPEG XL) and Stayput centres it on a 512 pixel square canvas, with your padding and background. Every icon is resized from that square with stepped downscaling so small sizes stay crisp. favicon.ico is written byte by byte by a small encoder in the page, and the manifest and HTML are plain text built in your tab.',
    versus: 'The logo you turn into a favicon is often for a site that has not launched yet. Upload-based generators take a copy of it, and at least one was caught sending logos to a third-party analytics service. Here there is no server to send it to.',
  },
};

export const engineFor = (slug: string): Engine => engines[slug] ?? engines['convert-image']!;
