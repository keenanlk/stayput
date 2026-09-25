export type Category = 'images' | 'pdf';

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
    title: 'Convert Images to JPG, PNG or WebP Online, Private | Stayput',
    description:
      'Convert PNG, JPG, WebP, GIF, BMP, AVIF, JPEG XL and HEIC images to JPG, PNG or WebP without uploading. Free, fast, works offline.',
    heading: 'Convert images between formats',
    tagline: 'PNG, JPG, WebP, GIF, BMP, AVIF, JPEG XL, SVG and HEIC in. JPG, PNG or WebP out. Converted on your device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl,.svg',
    multiple: true,
    dropLabel: 'Drop images here',
    action: 'Convert',
    keywords: ['png to jpg', 'webp to png', 'webp to jpg', 'jpg to png', 'avif to jpg', 'jxl to png', 'image converter'],
    steps: [
      'Drop any images onto the page.',
      'Pick the output format and, for JPG and WebP, the quality.',
      'Download the results one by one or as a zip.',
    ],
    faq: [
      {
        q: 'Which formats can I convert from?',
        a: 'Anything your browser can display: JPG, PNG, WebP, GIF (first frame), BMP, SVG and AVIF. HEIC and HEIF photos are decoded with a WebAssembly build of libheif, and JPEG XL (and AVIF in older browsers) with the Squoosh decoders compiled to WebAssembly, so they work everywhere.',
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
        a: 'No. Decoding and encoding happen in the browser using the canvas API. This page works with your network switched off.',
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
    accept: 'image/jpeg,image/png,image/webp,image/tiff,.jpg,.jpeg,.png,.webp',
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
];

export const toolBySlug = (slug: string): Tool | undefined => tools.find((t) => t.slug === slug);

export const categories: { id: Category; label: string; blurb: string }[] = [
  { id: 'images', label: 'Image tools', blurb: 'Convert, shrink and clean photos.' },
  { id: 'pdf', label: 'PDF tools', blurb: 'Merge, split, compress, reorder, sign and number documents.' },
];
