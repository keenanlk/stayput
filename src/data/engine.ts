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
