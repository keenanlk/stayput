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
    how: 'Your browser already knows how to decode JPG, PNG, WebP, AVIF and SVG. Stayput draws each image onto an off-screen canvas and asks the browser to encode it again in the format you picked. HEIC input goes through the libheif WebAssembly decoder. Nothing here needs a server because nothing here is beyond what a browser can do on its own.',
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
    how: 'pdf-lib, an open-source PDF library written in TypeScript, opens each document in your tab and copies its pages into a new PDF, preserving text, vector graphics, links and images as they are. The merged file is assembled in memory and handed to your browser’s download.',
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
};

export const engineFor = (slug: string): Engine => engines[slug] ?? engines['convert-image']!;
