export type Category = 'images' | 'pdf' | 'media';

export interface Faq {
  q: string;
  a: string;
}

export interface Tool {
  slug: string;
  /** Short name used in navigation and cards. */
  name: string;
  /** Page <title> (aim for under 60 characters). */
  title: string;
  /** Meta description (aim for under 155 characters). */
  description: string;
  /** Heading shown at the top of the tool page. */
  heading: string;
  /** One-line supporting copy under the heading. */
  tagline: string;
  category: Category;
  /** Accept attribute for the file input. */
  accept: string;
  multiple: boolean;
  /** Label for the drop zone. */
  dropLabel: string;
  /** Label for the primary action button. */
  action: string;
  /** Search phrases this page targets, used for related links and the footer. */
  keywords: string[];
  steps: string[];
  faq: Faq[];
  /** Served path. Defaults to /tools/<slug>. Format-pair landing pages override it. */
  path?: string;
}

export const toolPath = (t: Pick<Tool, 'slug' | 'path'>): string => t.path ?? `/tools/${t.slug}`;

export const tools: Tool[] = [
  {
    slug: 'heic-to-jpg',
    name: 'HEIC to JPG',
    title: 'HEIC to JPG Converter, Free and Private | Stayput',
    description:
      'Convert iPhone HEIC photos to JPG or PNG in your browser. No upload, no limits, no watermark. Batch convert hundreds of photos offline.',
    heading: 'Convert HEIC to JPG',
    tagline:
      'Turn iPhone and iPad photos into JPG or PNG files that open anywhere. Your photos never leave this device.',
    category: 'images',
    accept: '.heic,.heif,image/heic,image/heif',
    multiple: true,
    dropLabel: 'Drop HEIC photos here',
    action: 'Convert',
    keywords: ['heic to jpg', 'heic to png', 'convert heic', 'heic converter', 'iphone photo to jpg'],
    steps: [
      'Drop one or many HEIC or HEIF photos onto the page, or tap to pick them.',
      'Choose JPG or PNG and a quality level.',
      'Download each converted photo, or grab them all in one zip.',
    ],
    faq: [
      {
        q: 'Why do my iPhone photos end up as HEIC files?',
        a: 'Since iOS 11, iPhones save photos in HEIC (High Efficiency Image Container) because it stores the same picture in about half the space of JPG. Windows, many websites and older programs still cannot open HEIC, so people convert to JPG to share or upload them.',
      },
      {
        q: 'Are my photos uploaded to a server?',
        a: 'No. The HEIC decoder (libheif compiled to WebAssembly) runs inside your browser tab. Your photos are read from your disk, converted in memory and saved back to your disk. You can turn off your network after the page loads and it still works.',
      },
      {
        q: 'Is there a file size or quantity limit?',
        a: 'There is no server, so there is no quota. The only limit is your device memory. Batches of a few hundred photos work fine on a modern laptop or phone.',
      },
      {
        q: 'Does converting lose quality?',
        a: 'JPG is a lossy format, so a small amount of detail is lost. At the default quality of 92 the difference is invisible for photos. Pick PNG if you need a lossless copy, at the cost of much larger files.',
      },
      {
        q: 'Does it keep the photo date, location and camera info?',
        a: 'Not by default. Browsers strip EXIF metadata when they re-encode an image, which also removes GPS location. If you want to keep metadata, tick "Keep EXIF metadata" and the original EXIF block is copied into the JPG.',
      },
    ],
  },
  {
    slug: 'convert-image',
    name: 'Image Converter',
    title: 'Free Image Converter, No Upload: JPG, PNG, WebP, PDF, ICO | Stayput',
    description:
      'Drop any image and Stayput detects its real format. Convert to JPG, PNG, WebP, PDF, ICO, GIF, BMP or TIFF without uploading. Free, batches, works offline.',
    heading: 'Convert images between formats',
    tagline: 'Drop any image, see what it really is, pick what you need. Converted on your device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl,.svg',
    multiple: true,
    dropLabel: 'Drop images here',
    action: 'Convert',
    keywords: ['image converter', 'convert image', 'png to jpg', 'webp to png', 'png to ico', 'image to pdf', 'avif to jpg', 'jxl to png'],
    steps: [
      'Drop any images onto the page. Stayput reads each file and shows its real format, even if the extension is wrong.',
      'Pick the output format: type to search, for example "ico" or "pdf". Set the quality for JPG, WebP and PDF.',
      'Download the results one by one or as a zip.',
    ],
    faq: [
      {
        q: 'Which formats can I convert from?',
        a: 'Anything your browser can display: JPG, PNG, WebP, GIF (first frame), BMP, SVG and AVIF. HEIC and HEIF photos are decoded with a WebAssembly build of libheif, and JPEG XL (and AVIF in older browsers) with the Squoosh decoders compiled to WebAssembly, so they work everywhere.',
      },
      {
        q: 'Which formats can I convert to?',
        a: 'JPG, PNG, WebP, PDF (one page per image), ICO (a favicon or Windows icon with every size from 16 to 256 pixels), GIF (a still image, 256 colours), BMP and TIFF. Formats that cannot hold transparency fill it with the background colour you pick.',
      },
      {
        q: 'How does it know what format my file is?',
        a: 'It reads the first bytes of the file, where every image format writes its own signature, instead of trusting the name. A photo called .jpg that is really HEIC, or a download called .png that is really WebP, is shown as what it is and converted correctly.',
      },
      {
        q: 'Why is WebP the smallest option?',
        a: 'WebP compresses photos about 25 to 35 percent smaller than JPG at the same visual quality and supports transparency. Every current browser displays it. Use JPG when you need to send the file to an older program.',
      },
      {
        q: 'What happens to transparency when I convert to JPG?',
        a: 'JPG has no transparency, so transparent areas are filled with the background color you pick (white by default). Convert to PNG or WebP to keep transparency.',
      },
      {
        q: 'Is anything uploaded?',
        a: 'No. Decoding and encoding happen in this browser tab. This page works with your network switched off.',
      },
    ],
  },
  {
    slug: 'compress-image',
    name: 'Compress & Resize Images',
    title: 'Compress and Resize Images Online Without Uploading | Stayput',
    description:
      'Shrink JPG, PNG and WebP images for email or the web. Resize by width or percentage, set quality, batch process. Nothing leaves your browser.',
    heading: 'Compress and resize images',
    tagline: 'Make photos small enough to email or upload. Batch resize, set a quality, see the savings before you download.',
    category: 'images',
    accept: 'image/*,.heic,.heif',
    multiple: true,
    dropLabel: 'Drop images here',
    action: 'Compress',
    keywords: ['compress image', 'resize image', 'reduce image size', 'compress jpg', 'compress png', 'image compressor'],
    steps: [
      'Drop the images you want to shrink.',
      'Set a maximum width or height, or a percentage, and pick a quality.',
      'Compare the before and after sizes, then download.',
    ],
    faq: [
      {
        q: 'How much smaller will my images get?',
        a: 'A 12 megapixel phone photo (around 3 to 4 MB) resized to 2000 pixels wide at quality 80 usually lands between 300 and 600 KB with no visible difference on a screen. The result panel shows the exact saving per file.',
      },
      {
        q: 'Should I pick JPG, WebP or keep the original format?',
        a: 'Keep the format if you are unsure. Choose WebP for the smallest files that still look good in any browser. Choose JPG if the file has to open in older software. PNG stays lossless, so it only shrinks when you resize it.',
      },
      {
        q: 'Does resizing keep the aspect ratio?',
        a: 'Yes. The image is scaled so that neither side exceeds the limits you set, and the proportions never change.',
      },
      {
        q: 'Is metadata kept?',
        a: 'No. Re-encoding drops EXIF data, including GPS location, which is usually what you want before sharing. If you only want to remove metadata without changing pixels, use the EXIF remover instead.',
      },
    ],
  },
  {
    slug: 'strip-exif',
    name: 'Remove EXIF Data',
    title: 'Remove EXIF and GPS Data From Photos, Private | Stayput',
    description:
      'Strip EXIF metadata, GPS location and camera info from JPG, PNG and WebP photos without re-encoding. Lossless, free, runs entirely in your browser.',
    heading: 'Remove EXIF and location data from photos',
    tagline: 'See what a photo reveals, then delete it. Lossless: pixels are untouched, only the metadata is removed.',
    category: 'images',
    accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
    multiple: true,
    dropLabel: 'Drop photos here',
    action: 'Remove metadata',
    keywords: ['remove exif data', 'strip exif', 'remove gps from photo', 'remove metadata from photo', 'exif remover'],
    steps: [
      'Drop your photos. The page lists what metadata each one carries, including whether GPS coordinates are present.',
      'Choose whether to keep the color profile (recommended) and orientation.',
      'Download the cleaned copies.',
    ],
    faq: [
      {
        q: 'What is EXIF data and why remove it?',
        a: 'EXIF is metadata your camera or phone writes into each photo: date and time, camera model, settings and often the exact GPS coordinates where it was taken. Posting a photo with GPS data can reveal your home address. Removing it before sharing is a simple privacy step.',
      },
      {
        q: 'Does removing metadata reduce quality?',
        a: 'No. This tool edits the file structure and drops only the metadata segments. The compressed image data is copied byte for byte, so the picture is identical to the original.',
      },
      {
        q: 'What is kept by default?',
        a: 'The embedded color profile (ICC) is kept because removing it can shift colors. Everything else, including EXIF, XMP, IPTC, comments and thumbnails, is removed. You can choose to drop the color profile too.',
      },
      {
        q: 'What about orientation?',
        a: 'Phones often store photos sideways with an EXIF orientation tag telling viewers to rotate them. If you remove EXIF, that hint disappears. Leave "Apply orientation" on to bake the rotation into the pixels first, which does re-encode the image; turn it off for a purely lossless strip.',
      },
    ],
  },
  {
    slug: 'exif-viewer',
    name: 'EXIF Viewer',
    title: 'EXIF Viewer: See Photo Metadata and GPS, No Upload | Stayput',
    description:
      'View the EXIF data in a photo: GPS location, camera, date, serial numbers and every other field. Reads JPG, PNG, WebP, HEIC and TIFF in your browser. Nothing uploaded.',
    heading: 'EXIF viewer: see what a photo reveals',
    tagline: 'Drop a photo to read its metadata, including the location it was taken. The file is read on this device, so checking a private photo does not share it.',
    category: 'images',
    accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/tiff,.jpg,.jpeg,.png,.webp,.heic,.heif,.tif,.tiff,.dng',
    multiple: true,
    dropLabel: 'Drop photos here',
    action: 'Save report as CSV',
    keywords: ['exif viewer', 'exif data viewer', 'exif viewer online', 'view photo metadata', 'photo location viewer', 'exif reader'],
    steps: [
      'Drop one or more photos. Each one is read the moment it is added.',
      'Check the summary: where it was taken, when, and on which device. Open "All fields" for everything else.',
      'Save the report as a CSV if you need a record, or remove the metadata with the EXIF remover.',
    ],
    faq: [
      {
        q: 'Is it safe to check a photo here?',
        a: 'Yes. The page reads the file with JavaScript in your tab and never sends it anywhere, so you can check a photo you would not want to upload. Most online EXIF viewers upload the photo to their server first, which hands them the very location you are trying to check. Open the network tab while you drop a photo and it stays empty.',
      },
      {
        q: 'Which files can it read?',
        a: 'JPG, PNG, WebP, HEIC and HEIF (iPhone photos), and TIFF-based files including DNG raw files. It reads the EXIF block, including the GPS block and the embedded thumbnail, and lists which other metadata (XMP, IPTC, color profile, comments) the file carries.',
      },
      {
        q: 'Why does my photo show no location?',
        a: 'Either location was off in the camera app, or the photo went through something that removed it. Most messaging apps and social networks strip EXIF when you send or post a photo, and iPhones remove location when you turn off Location in the share sheet options. A screenshot never has GPS data.',
      },
      {
        q: 'Can I see where the photo was taken on a map?',
        a: 'The coordinates are shown as numbers you can copy. The "Open map" link opens OpenStreetMap in a new tab with the point marked; only the coordinates go to OpenStreetMap, and only if you click it.',
      },
      {
        q: 'How do I remove what it found?',
        a: 'Use the Remove EXIF Data tool (linked under the report). It deletes EXIF, GPS, XMP and IPTC without re-encoding, so the picture is unchanged. Drop the cleaned copy back here to confirm nothing is left.',
      },
    ],
  },
  {
    slug: 'merge-pdf',
    name: 'Merge PDF',
    title: 'Merge PDF Files Online, Free, No Upload | Stayput',
    description:
      'Combine multiple PDF files into one in your browser. Reorder pages, no size limit, no watermark, no account. Your documents never leave your device.',
    heading: 'Merge PDF files',
    tagline: 'Combine PDFs into a single document. Drag to reorder. No file limits, no watermark, nothing uploaded.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: true,
    dropLabel: 'Drop PDF files here',
    action: 'Merge PDFs',
    keywords: ['merge pdf', 'combine pdf', 'join pdf', 'pdf merger', 'merge pdf no limit'],
    steps: [
      'Drop two or more PDFs onto the page.',
      'Reorder them with the arrows until they are in the right sequence.',
      'Click Merge and download the single combined PDF.',
    ],
    faq: [
      {
        q: 'Is there a limit on the number or size of files?',
        a: 'No. Other free tools cap you at two or three tasks an hour or a set file size because they pay for servers. This tool has no server, so the only limit is your device memory. Merging fifty PDFs or a few hundred megabytes is fine on a normal laptop.',
      },
      {
        q: 'Are my PDFs uploaded?',
        a: 'No. The merge is performed by pdf-lib, a JavaScript library that runs inside your browser. You can confirm this in your browser network panel: no request carries your file.',
      },
      {
        q: 'Will bookmarks, links and form fields survive?',
        a: 'Page content, images, fonts and internal links within a page are preserved. Bookmarks (outlines) and form fields are not carried across when copying pages between documents. Password-protected PDFs need to be unlocked first.',
      },
      {
        q: 'Can I merge only some pages of a file?',
        a: 'Use the Split PDF tool first to extract the pages you need, then merge the results.',
      },
    ],
  },
  {
    slug: 'split-pdf',
    name: 'Split PDF',
    title: 'Split PDF or Extract Pages Online, Private | Stayput',
    description:
      'Split a PDF into separate pages, extract a page range, or break it into chunks. Runs in your browser, no upload, no limits.',
    heading: 'Split a PDF or extract pages',
    tagline: 'Pull out the pages you need, or break a document into single pages. Done on your device.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: false,
    dropLabel: 'Drop a PDF here',
    action: 'Split PDF',
    keywords: ['split pdf', 'extract pdf pages', 'pdf splitter', 'separate pdf pages', 'remove pages from pdf'],
    steps: [
      'Drop a PDF onto the page.',
      'Choose a mode: extract a range like 1-3, 7, 10-12 into one file, split every page into its own file, or split every N pages.',
      'Download the result, as one PDF or a zip of PDFs.',
    ],
    faq: [
      {
        q: 'How do I write a page range?',
        a: 'Use commas and dashes: "1-3, 7, 10-12" keeps pages 1, 2, 3, 7, 10, 11 and 12 in that order. You can repeat pages or list them out of order to reorder them.',
      },
      {
        q: 'Can I delete pages from a PDF?',
        a: 'Yes. Enter a range that lists every page except the ones you want to remove, and download the result.',
      },
      {
        q: 'Is my document uploaded?',
        a: 'No. Splitting happens in your browser with pdf-lib. Nothing is sent anywhere.',
      },
    ],
  },
  {
    slug: 'compress-pdf',
    name: 'Compress PDF',
    title: 'Compress PDF Online Without Uploading, Free | Stayput',
    description:
      'Reduce PDF file size in your browser. Recompress images, remove unused data, or flatten pages. No upload, no limits, no watermark.',
    heading: 'Compress a PDF',
    tagline: 'Shrink PDFs for email or upload limits. Three levels, from lossless cleanup to aggressive. Processed on your device.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: true,
    dropLabel: 'Drop PDF files here',
    action: 'Compress PDF',
    keywords: ['compress pdf', 'reduce pdf size', 'shrink pdf', 'pdf compressor', 'make pdf smaller'],
    steps: [
      'Drop one or more PDFs.',
      'Pick a level. "Recompress images" is the default and keeps text selectable.',
      'Compare the before and after sizes and download.',
    ],
    faq: [
      {
        q: 'How does each level work?',
        a: '"Lossless cleanup" rewrites the file with compressed object streams and drops unused data; text and images stay identical. "Recompress images" additionally re-encodes embedded photos at a lower JPG quality and caps their resolution, which is where most of the savings come from in scanned or photo-heavy PDFs. "Flatten pages" renders each page to an image at the resolution you choose. It gives the smallest files for scans but text is no longer selectable.',
      },
      {
        q: 'Why did my PDF barely shrink?',
        a: 'PDFs made from text (Word exports, invoices) are already small and consist mostly of fonts and vector data that cannot be compressed further without losing content. Compression helps most on files with large photos or scans.',
      },
      {
        q: 'Is the PDF uploaded to a server?',
        a: 'No. Everything runs in your browser using pdf-lib and pdf.js. That is why there is no size limit and no queue.',
      },
    ],
  },
  {
    slug: 'rotate-pdf',
    name: 'Rotate PDF',
    title: 'Rotate PDF Pages Online, Free and Private | Stayput',
    description:
      'Rotate all pages or selected pages of a PDF by 90, 180 or 270 degrees and save permanently. Works in your browser, nothing uploaded.',
    heading: 'Rotate PDF pages',
    tagline: 'Fix sideways scans for good. Rotate every page or just the ones you pick, then save.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: false,
    dropLabel: 'Drop a PDF here',
    action: 'Rotate and save',
    keywords: ['rotate pdf', 'rotate pdf pages', 'rotate pdf and save', 'fix sideways pdf'],
    steps: [
      'Drop a PDF. Every page appears as a thumbnail.',
      'Rotate all pages at once, or click the arrows on individual pages.',
      'Save the rotated PDF.',
    ],
    faq: [
      {
        q: 'Is the rotation permanent?',
        a: 'Yes. Unlike rotating in a viewer, which only changes the display, this writes the rotation into each page so every PDF reader shows it the right way up.',
      },
      {
        q: 'Does rotating reduce quality?',
        a: 'No. Rotation is a page attribute in PDF. The page content is not re-rendered or re-compressed.',
      },
    ],
  },
  {
    slug: 'unlock-pdf',
    name: 'Unlock PDF',
    title: 'Unlock PDF: Remove a PDF Password, Free and Private | Stayput',
    description:
      'Remove the password and restrictions from a PDF you can open. Runs in your browser, so the file and its password are never uploaded.',
    heading: 'Unlock a PDF',
    tagline: 'Remove the open password and the print, copy and edit restrictions from a PDF whose password you know.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: true,
    dropLabel: 'Drop password-protected PDFs here',
    action: 'Remove password',
    keywords: ['unlock pdf', 'remove password from pdf', 'pdf password remover', 'remove pdf restrictions'],
    steps: [
      'Drop one or more PDFs.',
      'Type the password that opens them. PDFs that only restrict printing or copying need no password.',
      'Save copies that open without a password and have no restrictions.',
    ],
    faq: [
      {
        q: 'Can this open a PDF when I don’t know the password?',
        a: 'No. It removes a password you already have, so you don’t have to type it every time or so other apps can edit the file. It does not guess or crack passwords.',
      },
      {
        q: 'What about PDFs that open fine but won’t let me print or copy?',
        a: 'Those carry an owner password that only sets restrictions. Drop them in without a password and the restrictions are removed; the text, images and pages are left exactly as they were.',
      },
      {
        q: 'Is my PDF or password sent anywhere?',
        a: 'No. The PDF is decrypted inside your browser tab by qpdf compiled to WebAssembly. The password is used in the tab and never leaves it, and the page works with the network off after one visit.',
      },
    ],
  },
  {
    slug: 'protect-pdf',
    name: 'Protect PDF',
    title: 'Password Protect a PDF, Free and Private | Stayput',
    description:
      'Add a password to a PDF with AES-256 encryption. Runs in your browser, so the file is encrypted before it ever leaves your device.',
    heading: 'Password protect a PDF',
    tagline: 'Lock a PDF with a password and AES-256 encryption, without uploading the file you are trying to keep private.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: true,
    dropLabel: 'Drop PDFs to protect',
    action: 'Protect with password',
    keywords: ['password protect pdf', 'encrypt pdf', 'lock pdf', 'add password to pdf'],
    steps: [
      'Drop one or more PDFs.',
      'Type the password twice.',
      'Save the protected copies. Anyone opening them is asked for the password.',
    ],
    faq: [
      {
        q: 'How strong is the protection?',
        a: 'The PDF is encrypted with AES-256, the strongest standard PDF encryption, which Adobe Acrobat, Preview, Chrome, Edge and Firefox all open. The protection is only as strong as the password, so use a long one.',
      },
      {
        q: 'What if I forget the password?',
        a: 'The file cannot be recovered, by us or anyone else: there is no copy of the password anywhere. Keep the unprotected original, or store the password in a password manager.',
      },
      {
        q: 'Why not use an online PDF protector?',
        a: 'Because the reason to add a password is that the file is private, and an online protector has the unprotected file the moment you upload it. Here the encryption happens on your device.',
      },
    ],
  },
  {
    slug: 'image-to-pdf',
    name: 'Image to PDF',
    title: 'Convert Images to PDF (JPG to PDF, PNG to PDF), Private | Stayput',
    description:
      'Combine JPG, PNG, WebP or HEIC images into one PDF in your browser. Choose page size and margins. No upload, no watermark, free.',
    heading: 'Convert images to PDF',
    tagline: 'Turn photos, scans and screenshots into a single PDF. One image per page, in the order you choose.',
    category: 'pdf',
    accept: 'image/*,.heic,.heif',
    multiple: true,
    dropLabel: 'Drop images here',
    action: 'Create PDF',
    keywords: ['jpg to pdf', 'png to pdf', 'image to pdf', 'photo to pdf', 'combine images into pdf'],
    steps: [
      'Drop your images and put them in order with the arrows.',
      'Choose a page size (fit to image, A4 or Letter), orientation and margin.',
      'Download the PDF.',
    ],
    faq: [
      {
        q: 'What image formats work?',
        a: 'JPG and PNG are embedded directly. WebP, GIF, BMP, AVIF and HEIC are converted first, in your browser, and then embedded.',
      },
      {
        q: 'How is the image placed on the page?',
        a: 'With "Fit to image" each page takes the exact size of its image. With A4 or Letter, each image is scaled to fit inside the page with the margin you set, keeping its proportions, and centered.',
      },
      {
        q: 'Is anything uploaded?',
        a: 'No. The PDF is assembled by pdf-lib in your browser.',
      },
    ],
  },
  {
    slug: 'pdf-to-image',
    name: 'PDF to Image',
    title: 'Convert PDF to JPG or PNG Online, Private | Stayput',
    description:
      'Turn PDF pages into high-resolution JPG or PNG images in your browser. Pick the pages and DPI. No upload, no limits, free.',
    heading: 'Convert PDF pages to images',
    tagline: 'Export every page, or just some, as JPG or PNG at the resolution you need. Rendered on your device.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: false,
    dropLabel: 'Drop a PDF here',
    action: 'Convert pages',
    keywords: ['pdf to jpg', 'pdf to png', 'pdf to image', 'convert pdf to jpg', 'pdf page to image'],
    steps: [
      'Drop a PDF.',
      'Choose the pages, the format and the resolution.',
      'Download the images individually or as a zip.',
    ],
    faq: [
      {
        q: 'What resolution should I choose?',
        a: '96 DPI matches a screen and is fine for previews. 150 DPI suits documents and slides. 300 DPI is print quality and produces large files.',
      },
      {
        q: 'Are the pages rendered on a server?',
        a: 'No. Pages are rendered with pdf.js, the same engine Firefox uses to display PDFs, running inside your browser.',
      },
    ],
  },
  {
    slug: 'reorder-pdf',
    name: 'Reorder & Delete Pages',
    title: 'Reorder, Rearrange and Delete PDF Pages Online, Private | Stayput',
    description:
      'Drag PDF pages into a new order, delete the ones you do not need, and save. Runs in your browser: no upload, no limits, free.',
    heading: 'Reorder and delete PDF pages',
    tagline: 'See every page as a thumbnail, drag them into the order you want, remove the extras. Saved on your device.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: false,
    dropLabel: 'Drop a PDF here',
    action: 'Save PDF',
    keywords: ['reorder pdf pages', 'rearrange pdf pages', 'delete pdf pages', 'remove pages from pdf', 'organize pdf', 'move pdf pages'],
    steps: [
      'Drop a PDF. Every page appears as a thumbnail.',
      'Drag pages into a new order, or use the arrows. Click the × on a page to delete it, or type an order like 3, 1, 2.',
      'Save. The new PDF downloads with only the pages you kept, in your order.',
    ],
    faq: [
      {
        q: 'Does reordering change the quality of the pages?',
        a: 'No. Pages are copied into the new document as they are, with their text, images and vector graphics untouched. Only the order and the set of pages change.',
      },
      {
        q: 'Can I duplicate a page?',
        a: 'Yes. Type the order by hand and repeat a page number, for example 1, 1, 2 to get two copies of page 1.',
      },
      {
        q: 'What about bookmarks, links and form fields?',
        a: 'Text and graphics on every page are preserved. Links inside a page keep working. Document-level bookmarks (the outline) are not carried over because page numbers change; most viewers show the page list instead.',
      },
      {
        q: 'Is the PDF uploaded?',
        a: 'No. Thumbnails are rendered with pdf.js and the new file is written with pdf-lib, both running in your browser. Switch off your network after the page loads and it still works.',
      },
    ],
  },
  {
    slug: 'sign-pdf',
    name: 'Sign PDF',
    title: 'Sign a PDF Online Without Uploading It, Free | Stayput',
    description:
      'Draw or type your signature, place it on any page and download the signed PDF. Everything stays in your browser. No account, no upload, no watermark.',
    heading: 'Sign a PDF',
    tagline: 'Draw your signature with a finger or mouse, or type it. Drop it onto the page, resize it, download. Your document never leaves this device.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: false,
    dropLabel: 'Drop a PDF to sign',
    action: 'Download signed PDF',
    keywords: ['sign pdf', 'sign pdf online free', 'add signature to pdf', 'esign pdf', 'sign pdf without uploading', 'draw signature'],
    steps: [
      'Drop the PDF you need to sign.',
      'Draw your signature, or type your name and pick a style. Add a date or initials if you need them.',
      'Click a page to place the signature, drag it into position, resize it, then download the signed PDF.',
    ],
    faq: [
      {
        q: 'Is this a legally binding signature?',
        a: 'It adds an image of your signature to the document, the same as printing, signing and scanning. In most countries that is an accepted electronic signature for everyday documents such as leases, consent forms and contracts between people who trust each other. It is not a cryptographic digital certificate; if a counterparty requires one, they will usually say so.',
      },
      {
        q: 'Is my document or signature stored anywhere?',
        a: 'No. The PDF, your signature drawing and the signed result exist only in this browser tab. Nothing is sent to a server, and nothing is kept once you close or reload the page.',
      },
      {
        q: 'Can I sign several pages?',
        a: 'Yes. Place the signature on every page that needs it. Each placement can be moved and resized on its own. You can also add your initials or the date the same way.',
      },
      {
        q: 'Can I sign on a phone?',
        a: 'Yes. Draw with your finger in the signature box. It works in Safari on iPhone and in Chrome on Android, offline included.',
      },
      {
        q: 'What if the PDF is a form or is password protected?',
        a: 'Forms work: the signature is drawn on top of the page. Password-protected PDFs need to be unlocked first; the tool will tell you if it cannot open the file.',
      },
    ],
  },
  {
    slug: 'pdf-page-numbers',
    name: 'Add Page Numbers',
    title: 'Add Page Numbers to a PDF Online, Free and Private | Stayput',
    description:
      'Stamp page numbers on every page of a PDF. Choose the position, format such as "Page 1 of 10", font and starting number. No upload, works offline.',
    heading: 'Add page numbers to a PDF',
    tagline: 'Number every page in the corner or the centre, in the format you want, without sending the document anywhere.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: false,
    dropLabel: 'Drop a PDF here',
    action: 'Add page numbers',
    keywords: ['add page numbers to pdf', 'pdf page numbers', 'number pdf pages', 'insert page numbers pdf', 'page numbers pdf free'],
    steps: [
      'Drop a PDF.',
      'Pick where the numbers go, the format (1, Page 1, 1 of 12), the font and size, and where numbering starts.',
      'Add page numbers and download. The preview shows the first numbered page.',
    ],
    faq: [
      {
        q: 'Can I skip the cover page?',
        a: 'Yes. Set "First page to number" to 2 and the cover stays clean. You can also choose the number printed on that first numbered page, so page 2 can be numbered 1.',
      },
      {
        q: 'Which formats are available?',
        a: 'A plain number, "Page 1", "1 of 12" and "Page 1 of 12", or write your own using {n} for the number and {total} for the last number. The total counts only numbered pages.',
      },
      {
        q: 'What if the PDF already has page numbers?',
        a: 'The new numbers are drawn on top, so pick a different corner or use the Reorder tool to remove pages before numbering. The tool never edits existing content.',
      },
      {
        q: 'Do rotated or mixed-size pages work?',
        a: 'Yes. The position is computed per page, so landscape and portrait pages in the same file each get their number in the same corner as the reader sees it.',
      },
      {
        q: 'Is the file uploaded?',
        a: 'No. Numbers are drawn with pdf-lib inside your browser using the standard PDF fonts, so the file does not grow and nothing leaves your device.',
      },
    ],
  },
  {
    slug: 'pdf-to-word',
    name: 'PDF to Word',
    title: 'PDF to Word Converter, Free, No Upload | Stayput',
    description:
      'Convert a PDF to an editable Word document (.docx) or plain text in your browser. Paragraphs and headings are rebuilt from the text layer. Nothing is uploaded.',
    heading: 'Convert PDF to Word',
    tagline: 'The text of a PDF as an editable Word document, with paragraphs and headings, extracted on your device.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: false,
    dropLabel: 'Drop a PDF here',
    action: 'Convert',
    keywords: ['pdf to word', 'convert pdf to word', 'pdf to docx', 'pdf to text', 'extract text from pdf', 'pdf to word free without email'],
    steps: [
      'Drop a PDF, or tap to pick one.',
      'Choose a Word document (.docx) or plain text (.txt), and whether each PDF page should start a new page.',
      'Convert. A preview of the text appears and the file downloads.',
    ],
    faq: [
      {
        q: 'Does the Word file look like the PDF?',
        a: 'It keeps the text, the paragraph breaks and the headings, in reading order, as normal editable Word paragraphs. It does not reproduce the page layout: columns, tables, images, fonts and exact positions are not carried over. That is the honest limit of what runs in a browser, and it is what you need when the goal is to edit or reuse the words.',
      },
      {
        q: 'Why is my output empty or garbled?',
        a: 'A scanned PDF has no text layer: each page is a picture of text, so there is nothing to extract without OCR. The tool tells you when that is the case. Garbled text usually means the PDF embeds fonts with a custom encoding; nothing browser-side can fix that without OCR.',
      },
      {
        q: 'How are paragraphs and headings detected?',
        a: 'Lines are grouped by baseline and joined into paragraphs using the spacing between them, the length of the previous line and changes in font size. Lines noticeably larger than the body text become Word headings, so the document outline works.',
      },
      {
        q: 'Which programs open the .docx?',
        a: 'Microsoft Word, Google Docs, LibreOffice, Pages and any other .docx reader. The file uses the standard Office Open XML format with normal paragraph and heading styles.',
      },
      {
        q: 'Is the PDF uploaded?',
        a: 'No. pdf.js reads the text inside your browser and the Word file is assembled in memory in your tab. You can convert with the network switched off.',
      },
    ],
  },
  {
    slug: 'crop-image',
    name: 'Crop image',
    title: 'Crop Image Online, Free, No Upload | Stayput',
    description:
      'Crop a photo to any size, a square, 16:9, a passport photo or a circle in your browser. Drag the box, set exact pixels, download. Nothing is uploaded.',
    heading: 'Crop an image',
    tagline: 'Drag a box over the part you want, pick a ratio or a circle, and download the crop. The photo never leaves this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl,.svg',
    multiple: false,
    dropLabel: 'Drop an image to crop',
    action: 'Crop',
    keywords: ['crop image', 'crop photo', 'crop image online', 'crop picture', 'crop image to circle', 'crop image to square', 'photo cropper'],
    steps: [
      'Drop a photo (JPG, PNG, WebP, HEIC, AVIF or JPEG XL), or tap to pick one.',
      'Drag the crop box into place and resize it from the corners, or pick a ratio such as square, 4:5 or 16:9 and type exact pixel values.',
      'Choose rectangle or circle and the output format, then crop. The file downloads from your browser.',
    ],
    faq: [
      {
        q: 'Does cropping reduce the quality of the photo?',
        a: 'Cropping only removes pixels outside the box; the pixels you keep are copied as they are. The file is then encoded once in the format you choose. Set JPG quality to 90 or higher, or pick PNG, to avoid any visible loss.',
      },
      {
        q: 'How do I crop to exact dimensions like 1080 by 1080?',
        a: 'Pick the aspect ratio you want, then type the width in the Width box; the height follows the ratio and the box stays inside the image. Left and Top set where the crop starts. The tool crops at the photo’s native resolution and never enlarges.',
      },
      {
        q: 'How does the circle crop work?',
        a: 'Choose Circle and the crop box becomes a circle (the ratio is set to square). Everything outside the circle becomes transparent, so the output is a PNG or WebP, ready for a profile picture or an avatar. JPG cannot hold transparency, which is why it is switched off for circles.',
      },
      {
        q: 'Which sizes are built in?',
        a: 'Free, square, 4:5 and 9:16 for Instagram and stories, 16:9 for covers and video thumbnails, 3:2 and 4:3 photo ratios in both orientations, and the 35 by 45 mm passport photo ratio used by most countries. For a US 2 by 2 inch passport photo use square.',
      },
      {
        q: 'Is the photo uploaded?',
        a: 'No. The image is decoded and cropped on a canvas inside your browser tab. You can load the page, switch off Wi-Fi and crop as many photos as you like.',
      },
    ],
  },
  {
    slug: 'blur-image',
    name: 'Blur & pixelate image',
    title: 'Blur Image or Pixelate Faces Online, No Upload | Stayput',
    description:
      'Blur or pixelate faces, number plates and text in a photo, or black them out, in your browser. Mark the areas, download. Nothing is uploaded.',
    heading: 'Blur or pixelate an image',
    tagline: 'Hide faces, plates, addresses and account numbers before you share a photo. The photo never leaves this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: false,
    dropLabel: 'Drop an image to blur',
    action: 'Save image',
    keywords: ['blur image', 'pixelate image', 'blur face', 'blur face in photo', 'censor image', 'blur image online', 'redact image', 'blur license plate'],
    steps: [
      'Drop a photo or screenshot (JPG, PNG, WebP, HEIC, AVIF or JPEG XL), or tap to pick one.',
      'Press Find faces, or drag across each face, plate or line of text to hide, or choose "Whole image". Pick blur, pixelate or black box and set the strength; the preview updates as you go.',
      'Save the image. It is written at full resolution in your browser and downloads straight away.',
    ],
    faq: [
      {
        q: 'Is my photo uploaded?',
        a: 'No. The photo is decoded and edited on a canvas inside your browser tab, and the new file is written there too. That matters most for exactly the photos people blur: children, other people’s faces, ID cards, bank screenshots. You can load the page, turn off Wi-Fi and it still works.',
      },
      {
        q: 'Should I blur, pixelate or use a black box?',
        a: 'Blur and pixelate are fine for faces, bodies and backgrounds. For text such as card numbers, addresses, names or passwords, use Black box. Research tools have recovered text from light pixelation and blur by trying likely words until the blurred result matches, and a solid box leaves nothing to recover.',
      },
      {
        q: 'Can someone unblur the image I save?',
        a: 'Not from the file itself. The saved image contains only the blurred or pixelated pixels; the originals are not hidden underneath in a layer and the editing steps are not stored. Location and camera metadata are dropped too, because the file is written fresh from the canvas.',
      },
      {
        q: 'Can I blur several faces at once?',
        a: 'Yes. Press Find faces to have a face detector running in your browser mark them all, or drag a box over each one; every box gets the same effect. Tap the × on a box to remove it, or use Undo. Check the preview for any face the detector missed.',
      },
      {
        q: 'How do I blur the whole picture?',
        a: 'Choose "Whole image" and set the strength. Strength is relative to the size of the photo, so the same setting looks the same on a small screenshot and a 48 megapixel photo. At high strength pixelate gives the big-block mosaic look.',
      },
    ],
  },
  {
    slug: 'rotate-image',
    name: 'Rotate & flip image',
    title: 'Rotate or Flip Image Online, Free, No Upload | Stayput',
    description:
      'Rotate photos 90 or 180 degrees and flip or mirror them in your browser. One image or a whole batch, with a live preview. Nothing is uploaded.',
    heading: 'Rotate or flip an image',
    tagline: 'Fix a sideways photo, a mirrored selfie or an upside-down scan. One image or a batch, and none of them leave this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop images to rotate or flip',
    action: 'Rotate',
    keywords: ['rotate image', 'flip image', 'rotate photo', 'flip photo', 'mirror image', 'rotate image online', 'flip image horizontally', 'rotate image 90 degrees'],
    steps: [
      'Drop one or more images (JPG, PNG, WebP, HEIC, AVIF or JPEG XL), or tap to pick them.',
      'Choose a quarter turn right or left or 180°, and tick flip horizontally or vertically if you need a mirror. The preview shows the first image as it will come out.',
      'Rotate. One image downloads straight away; a batch downloads one by one or as a zip.',
    ],
    faq: [
      {
        q: 'Why does my photo show sideways on one device and upright on another?',
        a: 'Phones save photos in the sensor’s orientation and add a note in the EXIF data saying which way is up. Most apps read that note; some older software, email clients and upload forms ignore it and show the photo sideways. This tool applies the orientation, turns the pixels themselves and writes the file without the note, so it looks the same everywhere.',
      },
      {
        q: 'How do I un-mirror a selfie?',
        a: 'Tick "Flip horizontally" and set Rotate to None. Front cameras often save selfies as a mirror image, which is why text on a T-shirt reads backwards. Flipping horizontally puts it the right way round.',
      },
      {
        q: 'Does rotating reduce the quality?',
        a: 'PNG stays lossless. A JPG is re-encoded once at the quality you set (92 by default), which is not visible on screen; set 100 for the closest copy. Rotating the same JPG many times over is what slowly softens it, so rotate from the original.',
      },
      {
        q: 'Can I rotate many photos at once?',
        a: 'Yes. Drop as many as you like; the same turn and flip apply to all of them. They are processed one after another in your browser and can be downloaded together as a zip.',
      },
      {
        q: 'Is anything uploaded?',
        a: 'No. Each image is decoded and redrawn on a canvas inside your browser tab, then saved from there. You can load the page, turn off Wi-Fi and it still works.',
      },
    ],
  },
  {
    slug: 'image-to-text',
    name: 'Image to text',
    title: 'Image to Text Converter (OCR), Free, No Upload | Stayput',
    description:
      'Copy the text out of a photo, screenshot or scan. Free OCR that runs in your browser: JPG, PNG, HEIC, WebP. Batch, no upload, no sign-up.',
    heading: 'Image to text (OCR)',
    tagline: 'Get the words out of a photo, screenshot or scanned page, ready to copy. The image is read on this device and never uploaded.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop photos, screenshots or scans to read',
    action: 'Read text',
    keywords: ['image to text', 'extract text from image', 'picture to text', 'ocr', 'screenshot to text', 'jpg to text', 'photo to text', 'copy text from image'],
    steps: [
      'Drop one or more images (JPG, PNG, HEIC, WebP, screenshots or scans), or tap to pick them.',
      'Keep line breaks as they are in the image, or join them into paragraphs for pasting into a document or an email.',
      'Read text. The text appears on the page with a Copy button, and each image can be saved as a .txt file.',
    ],
    faq: [
      {
        q: 'Is my image uploaded?',
        a: 'No. The text is recognised by Tesseract, the open-source OCR engine, compiled to WebAssembly and running inside this page. The engine and its English model (about 6 MB) are downloaded from this site the first time you use it, then the tool works offline. Switch off Wi-Fi after the first run and it still reads images.',
      },
      {
        q: 'How accurate is it?',
        a: 'Very good on printed text that is sharp and straight: screenshots, documents, scans, signs and receipts photographed head-on. It struggles with handwriting, curved or angled text, heavy shadows and decorative fonts. For a phone photo, fill the frame with the text and hold the phone parallel to the page. Always check numbers you plan to rely on.',
      },
      {
        q: 'Which languages does it read?',
        a: 'English, including accented Latin letters in names and places. More languages are on the way; each needs its own model of a few megabytes.',
      },
      {
        q: 'Can it read a scanned PDF?',
        a: 'Not directly yet. Turn the pages into images with PDF to JPG first, then drop them here. If the PDF already has selectable text, PDF to Word gets it out faster and keeps the paragraphs.',
      },
      {
        q: 'Why is the first run slower?',
        a: 'The first time, your browser downloads the OCR engine and model from this site. They are cached, so later runs start straight away, even offline. Reading a full page takes a few seconds on a laptop and a little longer on a phone.',
      },
    ],
  },
  {
    slug: 'video-to-mp3',
    name: 'Video to MP3',
    title: 'Video to MP3 Converter, MP4 to MP3, No Upload | Stayput',
    description:
      'Convert MP4, MOV, M4A, WAV and other video or audio files to MP3 (or WAV) in your browser. Batch, no size limit, no upload, no sign-up.',
    heading: 'Convert video or audio to MP3',
    tagline: 'Pull the sound out of a video, or turn any audio file into an MP3. Your files are converted on this device and never uploaded.',
    category: 'media',
    accept: 'video/*,audio/*,.mp4,.m4v,.mov,.webm,.mkv,.3gp,.m4a,.aac,.mp3,.wav,.ogg,.oga,.opus,.flac,.caf',
    multiple: true,
    dropLabel: 'Drop videos or audio files to convert',
    action: 'Convert',
    keywords: ['video to mp3', 'mp4 to mp3', 'extract audio from video', 'mp3 converter', 'convert video to mp3', 'm4a to mp3', 'mov to mp3', 'wav to mp3'],
    steps: [
      'Drop one or more videos or audio files (MP4, MOV, WebM, M4A, WAV, FLAC and more), or tap to pick them.',
      'Choose MP3 or WAV. For MP3 pick a quality: 192 kbps suits music, 96 kbps is plenty for speech. Choose mono to halve the size of a voice recording.',
      'Convert. Each file is decoded and encoded in your browser; one downloads straight away, several download as a zip.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. Your browser reads the sound track with its own decoders, and an MP3 encoder (LAME, compiled to WebAssembly) runs inside the page to write the file. There is no server in the process, so there is no upload to wait for and no size cap. You can load the page, switch off Wi-Fi and it still works.',
      },
      {
        q: 'Which files can I convert?',
        a: 'Anything with a sound track your browser can play: MP4, M4V and MOV (from phones, cameras and screen recorders), WebM and MKV, and audio files such as M4A voice memos, WAV, FLAC, OGG, Opus and MP3 itself. If a file will not open, try it in another browser: Safari reads a few Apple formats that others do not.',
      },
      {
        q: 'What MP3 quality should I choose?',
        a: '192 kbps is transparent for most music and is the default. Use 320 kbps if the MP3 will be your only copy of a high-quality recording, 128 kbps for podcasts and lectures, and 96 kbps mono for a voice memo you want small. Converting to MP3 can never add quality the source did not have.',
      },
      {
        q: 'Is there a length or size limit?',
        a: 'No fixed limit. The whole file is read into your device’s memory, so a feature-length film works on a laptop but may be too much for an older phone. The MP3 of an hour of audio at 192 kbps is about 85 MB.',
      },
      {
        q: 'Can I get a WAV instead?',
        a: 'Yes. Choose WAV and you get uncompressed 16-bit, 44.1 kHz audio, the format audio editors and some upload forms ask for. It is about ten times the size of an MP3.',
      },
    ],
  },
  {
    slug: 'video-to-gif',
    name: 'Video to GIF',
    title: 'Video to GIF Converter, MP4 to GIF, No Upload | Stayput',
    description:
      'Turn an MP4, MOV or WebM clip into an animated GIF in your browser. Trim it, pick the size and frame rate. No upload, no watermark, no sign-up.',
    heading: 'Convert video to GIF',
    tagline: 'Trim a clip, pick a size and frame rate, and get a looping GIF. The video is decoded by your browser and never leaves this device.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: false,
    dropLabel: 'Drop a video to turn into a GIF',
    action: 'Make GIF',
    keywords: ['video to gif', 'mp4 to gif', 'mov to gif', 'webm to gif', 'convert video to gif', 'gif maker', 'make a gif from a video'],
    steps: [
      'Drop a video (MP4, MOV, WebM or MKV), or tap to pick one. It opens in a player on the page.',
      'Play or scrub to the moment you want and press "Set start" and "Set end", or type the times. Pick a width and a frame rate.',
      'Make the GIF. It is built frame by frame in your browser and downloads when it is done.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. Your browser plays the video from the file on your device, Stayput copies the frames you asked for onto a canvas, and a small GIF encoder in the page writes the file. There is no server in the process; you can load the page, turn off Wi-Fi and it still works.',
      },
      {
        q: 'How long can the GIF be?',
        a: 'Up to 600 frames, which is 60 seconds at 10 frames per second or 30 seconds at 20. GIF is an old format with no real video compression, so a long or large GIF quickly runs to tens of megabytes. For sharing, a clip of 2 to 10 seconds at 480 pixels wide and 10 to 15 frames per second is the sweet spot.',
      },
      {
        q: 'Why will my iPhone video not open?',
        a: 'iPhones record in HEVC (H.265) by default. Safari and most Macs play it; Chrome and Firefox on Windows or Linux often cannot, and this tool can only use the decoders your browser has. Open the page in Safari, or set Camera, Formats to Most Compatible on the iPhone so new videos are saved as H.264.',
      },
      {
        q: 'Why does the GIF look grainier than the video?',
        a: 'A GIF frame can hold at most 256 colours, while a video frame has millions. Stayput picks the best 256 for each frame, which keeps screen recordings and cartoons crisp but can band smooth gradients such as skies. A smaller width and a lower frame rate make a much smaller file with little visible loss.',
      },
      {
        q: 'Is there a watermark or a file size limit?',
        a: 'No watermark and no upload limit. The only limit is your device’s memory: a long 4K video works, because only the frames you pick are decoded, but the GIF itself is capped at 600 frames.',
      },
    ],
  },
  {
    slug: 'favicon-generator',
    name: 'Favicon generator',
    title: 'Favicon Generator: ICO, Apple and Manifest Icons | Stayput',
    description:
      'Make favicon.ico, apple-touch-icon, Android and maskable icons and a site.webmanifest from one PNG, JPG or SVG. Free, in your browser, nothing uploaded.',
    heading: 'Favicon generator',
    tagline: 'Drop in your logo and get every icon a website needs, plus the HTML to paste. Unreleased logos stay on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl,.svg',
    multiple: false,
    dropLabel: 'Drop your logo or icon here',
    action: 'Generate icons',
    keywords: ['favicon generator', 'favicon maker', 'png to favicon', 'apple touch icon', 'web manifest icons', 'favicon.ico generator', 'pwa icon generator'],
    steps: [
      'Drop a square logo, ideally a 512px or larger PNG or an SVG, or tap to pick one.',
      'Optionally name your site, add padding and pick the background used on phone home screens.',
      'Download the icons in one zip, put them in your site’s root folder and paste the HTML into your page’s head.',
    ],
    faq: [
      {
        q: 'Which files do I get?',
        a: 'favicon.ico with 16, 32 and 48 pixel images for browser tabs and old browsers, favicon-16x16.png and favicon-32x32.png, a 180 pixel apple-touch-icon.png for iPhone and iPad home screens, 192 and 512 pixel icons plus a maskable 512 icon for Android and installed web apps, and a site.webmanifest that lists them. If you start from an SVG you also get favicon.svg, which modern browsers prefer because it stays sharp at every size.',
      },
      {
        q: 'What size should my source image be?',
        a: 'Square and at least 512 by 512 pixels, or an SVG. Smaller images still work but are enlarged for the 512 pixel icons and look soft; the result list tells you when that happened. A non-square image is centred on a transparent square rather than stretched.',
      },
      {
        q: 'What is a maskable icon?',
        a: 'Android crops home screen icons into circles, squircles or rounded squares depending on the phone. A maskable icon keeps the logo inside the central safe zone on a solid background, so nothing important is cut off whatever the shape. The manifest marks it with purpose "maskable" so Android uses it for installed apps.',
      },
      {
        q: 'Why does the Apple icon have a background?',
        a: 'iOS fills transparent parts of a home screen icon with black. The apple-touch-icon and the Android icons are drawn on the background colour you choose (white by default) so your logo looks right. The browser tab icons stay transparent unless you tick the fill option.',
      },
      {
        q: 'Is my logo uploaded?',
        a: 'No. The image is decoded and resized on a canvas in your browser tab, and the ICO file is written by a small encoder in the page. Logos for a rebrand or an unannounced product never leave your device. You can load the page, go offline and generate icons as often as you like.',
      },
    ],
  },
];

export const toolBySlug = (slug: string): Tool | undefined => tools.find((t) => t.slug === slug);

export const categories: { id: Category; label: string; blurb: string }[] = [
  { id: 'images', label: 'Image tools', blurb: 'Convert, shrink and clean photos.' },
  { id: 'pdf', label: 'PDF tools', blurb: 'Merge, split, compress, reorder, sign and number documents.' },
  { id: 'media', label: 'Video and audio tools', blurb: 'Pull the sound out of a video, convert audio, make GIFs.' },
];
