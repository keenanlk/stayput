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
    how: 'Your browser already knows how to decode JPG, PNG, WebP, AVIF and SVG. Stayput draws each image onto an off-screen canvas and asks the browser to encode it again in the format you picked. HEIC input goes through the libheif WebAssembly decoder, and JPEG XL (or AVIF, in a browser without native support) through the Squoosh decoders compiled to WebAssembly, fetched once as program files and cached. Nothing here needs a server because nothing here is beyond what a browser can do on its own.',
    versus: 'Online converters upload your image, convert it on their machine and hand it back through an ad-covered download page. This does the same conversion with the same codecs, on your device, in less time than the upload.',
  },
  'compress-image': {
    how: 'Resizing uses stepped downscaling on a canvas so text and edges stay sharp, and the browser encodes the result at the quality you choose. Everything happens in memory in your tab. Large batches are processed one image at a time so the page stays responsive on a phone.',
    versus: 'Image compressors that upload your photos limit you to a few files, a small size, or a watermark until you pay. This one has no counter to reset because there is no server to keep one.',
  },
  'strip-exif': {
    how: 'This tool does not re-encode your photo at all. It reads the JPG, PNG or WebP container byte by byte and removes only the metadata segments (EXIF, XMP, ICC, IPTC), writing the untouched image data back out. That is why the output is pixel-identical and the file only gets smaller.',
    versus: 'Sending a photo to a website to remove its location data is a contradiction: the site has the location the moment you upload it. Here the GPS block is deleted on your device and never travels anywhere.',
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
  'image-to-pdf': {
    how: 'JPG and PNG images are embedded directly into the PDF by pdf-lib without re-encoding. Other formats are decoded by your browser (HEIC via libheif) and embedded as JPG or PNG. Page size, orientation and margins are applied while laying out each page in memory.',
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
};

export const engineFor = (slug: string): Engine => engines[slug] ?? engines['convert-image']!;
