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
    title: 'Image Converter: JPG, PNG, WebP, PDF, ICO, No Upload | Stayput',
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
    slug: 'compress-gif',
    name: 'Compress GIF',
    title: 'GIF Compressor: Reduce GIF File Size Online, No Upload | Stayput',
    description:
      'Compress animated GIFs in your browser: keep only what changes between frames, use fewer colours, resize or drop frames. Often 50 to 80% smaller. No upload.',
    heading: 'Compress a GIF',
    tagline: 'Make an animated GIF small enough for Discord, Slack, email or a web page. It is compressed on this device and never uploaded.',
    category: 'images',
    accept: 'image/gif,.gif',
    multiple: true,
    dropLabel: 'Drop GIFs to compress',
    action: 'Compress',
    keywords: ['compress gif', 'gif compressor', 'reduce gif size', 'gif optimizer', 'make gif smaller', 'compress gif online'],
    steps: [
      'Drop one or more GIFs, or tap to pick them.',
      'Keep Medium for most GIFs. For a much smaller file, also reduce the size or drop every second frame.',
      'Compress. Each file stays an animated GIF with the same timing; one downloads straight away, several download as a zip.',
    ],
    faq: [
      {
        q: 'Is my GIF uploaded?',
        a: 'No. The GIF is decoded and written again by code running in this page. There is no server in the process, no daily limit and no file size cap, and the page keeps working offline.',
      },
      {
        q: 'How does it make GIFs smaller?',
        a: 'Most GIFs store every frame whole, even when only a small part of the picture moves. Each frame is rewritten to hold just the area that changed, with the unchanged pixels left see-through so the frame before shows through. Medium and Strong also ignore changes too small to notice and use fewer colours, which is where GIF compressors such as gifsicle and ezgif get most of their savings.',
      },
      {
        q: 'How do I get a GIF under a size limit?',
        a: 'Size makes the biggest difference: 50% leaves a quarter of the pixels. Dropping every second frame roughly halves what is left. Try Medium first, then add those until the result, shown with its size, is under your limit. Discord’s limit is 10 MB for uploads, and custom emoji must be under 256 KB.',
      },
      {
        q: 'Will the animation play at the same speed?',
        a: 'Yes. When frames are dropped, their time is added to the frame before, so the GIF lasts just as long and loops the same way.',
      },
      {
        q: 'What if my GIF is already optimised?',
        a: 'If the result would not be smaller, you get the original back unchanged, and the result says so.',
      },
    ],
  },
  {
    slug: 'compress-png',
    name: 'Compress PNG',
    title: 'Compress PNG Images, Up to 80% Smaller, No Upload | Stayput',
    description:
      'Compress PNG files in your browser and keep transparency: up to 80% smaller with a smart colour palette, or lossless. Batch, no limit, nothing uploaded.',
    heading: 'Compress PNG',
    tagline: 'Shrink PNG screenshots, logos and graphics while keeping them PNGs, transparency and all. Nothing is uploaded.',
    category: 'images',
    accept: 'image/png,.png,.apng',
    multiple: true,
    dropLabel: 'Drop PNG files to compress',
    action: 'Compress',
    keywords: ['compress png', 'png compressor', 'reduce png size', 'png optimizer', 'compress png online', 'tinypng alternative'],
    steps: [
      'Drop one or more PNG files, or tap to pick them.',
      'Keep Best quality (256 colours) for most images, go down to 128 or 64 colours for a smaller file, or choose Lossless to keep every pixel.',
      'Compress. Each file stays a PNG; one downloads straight away, several download as a zip.',
    ],
    faq: [
      {
        q: 'Is my PNG uploaded?',
        a: 'No. The PNG is decoded and written again by code running in this page. There is no server in the process, no daily limit and no file size cap, and the page keeps working offline.',
      },
      {
        q: 'How does it make PNGs so much smaller?',
        a: 'A normal PNG stores every pixel in full colour, up to 16 million colours. Most screenshots, logos and illustrations use far fewer, so the image is rewritten with a palette of the 256 (or fewer) colours that matter most, which takes a quarter of the space before compression. This is the same idea TinyPNG and pngquant use. Lossless mode keeps every pixel and only finds a tighter way to store them.',
      },
      {
        q: 'Is transparency kept?',
        a: 'Yes, including soft edges and shadows. The palette stores a transparency level for each colour, so a logo on a transparent background stays transparent.',
      },
      {
        q: 'What if my PNG is already optimised?',
        a: 'If the compressed file would not be smaller, you get the original back unchanged, and the result says so. Photos saved as PNG shrink the most; for those, converting to JPG or WebP with Compress image saves even more.',
      },
      {
        q: 'Does it work with animated PNGs?',
        a: 'Yes. Every frame and its timing are kept, and the palette is shared across the frames.',
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
      'View the EXIF data in a photo: GPS location, camera, date, serial numbers and every other field. Reads JPG, PNG, WebP, HEIC and TIFF in your browser, no upload.',
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
      {
        q: 'Can I cover faces with an emoji?',
        a: 'Yes. Choose Emoji as the effect, tap one of the common picks or type or paste any emoji, and every area gets it, sized to the box. The area is blurred underneath too, so nothing shows round the edges. The emoji is drawn in your device’s own emoji style, so it looks slightly different on an iPhone, Android or Windows PC.',
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
    slug: 'color-picker',
    name: 'Color picker from image',
    title: 'Color Picker from Image: HEX, RGB, Palette, No Upload | Stayput',
    description:
      'Pick any colour from an image and copy its HEX, RGB or HSL code, with a magnifier for exact pixels. Get the image’s main colours as a palette. Free, no upload.',
    heading: 'Color picker from an image',
    tagline: 'Point at any pixel to get its HEX, RGB and HSL code, and see the main colours of the picture. The image stays on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: false,
    dropLabel: 'Drop an image to pick colours from',
    action: 'Save palette',
    keywords: ['color picker from image', 'image color picker', 'color palette from image', 'hex color from image', 'get color from image', 'eyedropper', 'rgb from image'],
    steps: [
      'Drop an image (a screenshot, photo, logo or design), or tap to pick one.',
      'Move over the image: the magnifier shows the exact pixel and the card shows its HEX, RGB and HSL values. Click or tap to keep a colour; copy any value with one click.',
      'The main colours of the image appear as a strip, widest first. Save palette downloads them, with your picks, as an image and a list of codes.',
    ],
    faq: [
      {
        q: 'Is my image uploaded?',
        a: 'No. The image is drawn on a canvas in this page and every colour is read from it on your device. There is no server in the process, so a screenshot of an unreleased design or a private photo never leaves your computer or phone.',
      },
      {
        q: 'How do I get the exact colour of one pixel?',
        a: 'Move over the image and watch the magnifier: the outlined square in the middle is the pixel you will get. On a keyboard, click the image and use the arrow keys (Shift moves ten pixels), then press Enter. On a phone, hold your finger down and slide; the colour is picked when you lift it.',
      },
      {
        q: 'Why does the colour differ from the one in my design app?',
        a: 'The picker reads the pixels in the file as they are. A photo or a screenshot compressed as JPG has slightly shifted colours, and a screenshot from a display with a wide colour gamut may have been converted. For brand colours, take them from the original file or a PNG export.',
      },
      {
        q: 'How are the main colours chosen?',
        a: 'The image is sampled and similar colours are grouped (k-means clustering). Each group becomes one swatch, sized by how much of the image it covers, so a background colour shows as the widest. Choose how many colours to find in the options; very similar ones are merged.',
      },
      {
        q: 'Which formats can I copy?',
        a: 'HEX (#1E90FF), RGB (rgb(30, 144, 255)) and HSL (hsl(210, 100%, 56%)), the three formats CSS, Figma, Canva and most design tools accept. Save palette also gives you every code as text to copy.',
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
    slug: 'gif-to-mp4',
    name: 'GIF to MP4',
    title: 'GIF to MP4 Converter, Free, No Upload | Stayput',
    description:
      'Convert animated GIFs to MP4 video in your browser. Smaller files that play on Instagram, WhatsApp, X and in slides. Batch, no watermark, no upload.',
    heading: 'Convert GIF to MP4',
    tagline: 'Turn animated GIFs into small MP4 videos that post and play anywhere. Converted on this device, never uploaded.',
    category: 'media',
    accept: 'image/gif,.gif',
    multiple: true,
    dropLabel: 'Drop GIFs to convert to MP4',
    action: 'Convert to MP4',
    keywords: ['gif to mp4', 'animated gif to mp4', 'gif to video', 'convert gif to mp4', 'gif to mp4 converter', 'gif to video converter'],
    steps: [
      'Drop one or more animated GIFs, or tap to pick them.',
      'Choose how long the video should be: short loops are repeated to at least 3 seconds so apps accept them, or pick a number of plays. Choose what transparent areas become.',
      'Convert. Each GIF is encoded to MP4 in your browser; one downloads straight away, several download as a zip.',
    ],
    faq: [
      {
        q: 'Is my GIF uploaded?',
        a: 'No. The GIF is decoded by code in this page and each frame is encoded by your browser’s own video encoder. There is no server in the process, so there is nothing to wait for and no size limit, and the page works with Wi-Fi off.',
      },
      {
        q: 'Why is the MP4 so much smaller than the GIF?',
        a: 'GIF compresses each frame on its own, with at most 256 colours. MP4 video stores only what changes from one frame to the next, so the same animation is often five to twenty times smaller, and it keeps its full colours. That is why sites such as X, Reddit and Giphy quietly turn uploaded GIFs into MP4.',
      },
      {
        q: 'Will the video loop?',
        a: 'A video file plays once; looping is up to the player. Most chat apps and social sites loop short videos automatically. If you need a fixed length, pick how many times the animation plays, or keep the default, which repeats short loops to at least 3 seconds (Instagram rejects shorter videos).',
      },
      {
        q: 'Does it keep the timing of each frame?',
        a: 'Yes. Every frame keeps its own delay from the GIF, so slow-downs and pauses play as they did. Frames with a delay of 0 or 1 hundredths of a second are shown for a tenth of a second, which is what every browser does with them too.',
      },
      {
        q: 'Which video format do I get?',
        a: 'An MP4 with H.264 video, the format every phone, laptop, social site and PowerPoint plays, in Chrome, Edge and Safari. A browser without an H.264 encoder (some Linux builds) writes VP9 in the MP4 instead, which browsers and Android play but older iPhones may not; the result says which one you got. There is no sound track, since GIFs have none.',
      },
    ],
  },
  {
    slug: 'compress-video',
    name: 'Compress video',
    title: 'Video Compressor, Compress MP4 Without Uploading | Stayput',
    description:
      'Compress MP4, MOV and WebM videos in your browser: make a video small enough for Discord, email or WhatsApp. No upload, no size limit, no watermark.',
    heading: 'Compress a video',
    tagline: 'Make a video a fraction of the size, or fit it under a limit like 10 MB for Discord or 25 MB for email. It is compressed on this device and never uploaded.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop videos to compress',
    action: 'Compress',
    keywords: ['video compressor', 'compress video', 'compress mp4', 'reduce video size', 'video compressor for discord', 'compress video for email', 'make video smaller'],
    steps: [
      'Drop one or more videos (MP4, MOV, WebM or MKV), or tap to pick them.',
      'Choose how hard to compress, or Fit a file size and pick a limit such as 10 MB for Discord. Lower the resolution or remove the sound for even smaller files.',
      'Compress. Each video is re-encoded in your browser and saved as MP4; one downloads straight away, several download as a zip.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. The video is read and re-encoded by your browser’s own video encoder inside this page. There is no server in the process, so there is no upload to wait for, no size limit and no copy left on someone else’s computer. You can load the page, switch off Wi-Fi and it still works.',
      },
      {
        q: 'How much smaller will it get?',
        a: 'Phone videos usually shrink to between a quarter and a tenth of their size on Balanced with little visible difference, because phones record at a very high bitrate to save battery. A video that was already compressed for the web will not shrink much, and the result then tells you it grew.',
      },
      {
        q: 'How do I get a video under 10 MB for Discord?',
        a: 'Choose Fit a file size and pick 10 MB. The page works out the bitrate from the length of the video and lowers the resolution if it needs to. About 1 minute fits at 720p; longer videos come out at lower resolutions, and very long ones are refused with how long a clip will fit.',
      },
      {
        q: 'Which formats can I compress?',
        a: 'MP4, M4V and MOV (from phones, cameras and screen recorders), WebM and MKV, as long as your browser can decode the video inside. iPhone videos in HEVC need Safari, or Chrome or Edge on a Mac or recent Windows. The result is always an MP4, with H.264 video where your browser can write it.',
      },
      {
        q: 'Why does it take a while?',
        a: 'Every frame is decoded and encoded again, which is real work: on a recent laptop expect roughly real time or faster for 1080p, slower on a phone. Keep the tab open until it finishes. Lowering the resolution also makes it faster.',
      },
    ],
  },
  {
    slug: 'video-to-mp4',
    name: 'Video to MP4',
    title: 'Convert Video to MP4: MOV, MKV, WebM to MP4, No Upload | Stayput',
    description:
      'Convert MOV, MKV and WebM videos to MP4 in your browser. H.264 files convert in seconds with no quality loss. Batch, no size limit, nothing uploaded.',
    heading: 'Convert video to MP4',
    tagline: 'Turn MOV, MKV and WebM files into MP4s that play everywhere. Converted on this device, never uploaded.',
    category: 'media',
    accept: 'video/*,.mov,.mkv,.webm,.m4v,.mp4,.qt',
    multiple: true,
    dropLabel: 'Drop videos to convert to MP4',
    action: 'Convert to MP4',
    keywords: ['mov to mp4', 'mkv to mp4', 'webm to mp4', 'convert video to mp4', 'mp4 converter', 'convert mov to mp4'],
    steps: [
      'Drop one or more videos (MOV, MKV, WebM or MP4), or tap to pick them.',
      'Tick Remove the sound if you want a silent video. There is nothing else to set.',
      'Convert. H.264 videos are rewrapped in seconds; others are re-encoded in your browser. One downloads straight away, several download as a zip.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. The file is read and written by code in this page, and any re-encoding is done by your browser’s own video encoder. There is no server in the process, so there is no upload, no size limit and no copy left anywhere. The page works with Wi-Fi off.',
      },
      {
        q: 'Why was my file converted so fast?',
        a: 'MOV and MKV files often already contain H.264 video and AAC sound, the same streams an MP4 holds. Those are copied into the MP4 as they are, which only takes as long as reading the file, and the picture is exactly the same as before. The result says "copied, no quality loss" when that happens.',
      },
      {
        q: 'What about iPhone videos in HEVC?',
        a: 'Browsers that can decode HEVC (Safari, and Chrome or Edge on a Mac or recent Windows) re-encode it to H.264, which plays everywhere. Elsewhere the HEVC stream is copied into the MP4 unchanged, which plays on iPhones, Macs, Android and Windows 10 or later with the free HEVC extension.',
      },
      {
        q: 'Which formats can I convert?',
        a: 'MOV (iPhone, Mac screen recordings, cameras), MKV (OBS recordings, downloads), WebM (browser and screen recordings) and MP4 itself. AVI, WMV and FLV are not supported, because browsers cannot read the video inside them.',
      },
    ],
  },
  {
    slug: 'trim-video',
    name: 'Trim video',
    title: 'Trim Video Online: Cut MP4, MOV, WebM, No Upload | Stayput',
    description:
      'Trim a video in your browser: pick the start and end, and get the clip in seconds with no quality loss. MP4, MOV, WebM, MKV. No upload, no watermark.',
    heading: 'Trim a video',
    tagline: 'Cut a clip out of a longer video without uploading it. Most cuts take seconds and keep the original quality.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: false,
    dropLabel: 'Drop a video to trim',
    action: 'Trim',
    keywords: ['trim video', 'cut video', 'trim video online', 'video cutter', 'trim mp4', 'cut mp4'],
    steps: [
      'Drop a video (MP4, MOV, WebM or MKV), or tap to pick one. It opens in a player on the page.',
      'Play or scrub to where the clip should start and press Set start, then to the end and press Set end. Or type the times in seconds.',
      'Trim. The clip is copied out of the video without re-encoding, so it keeps the original quality and downloads in seconds.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. Your browser plays the video from the file on your device, and the clip is cut by code in this page. There is no server, no size limit and no watermark, and the page works offline.',
      },
      {
        q: 'Why does my clip start a moment early?',
        a: 'Videos are stored as key frames with changes in between, and a clip copied without re-encoding has to start on a key frame. When the nearest one is within half a second before your start, the clip begins there. Tick "Cut exactly on the frame" to re-encode the clip and start exactly where you set it.',
      },
      {
        q: 'Does trimming lower the quality?',
        a: 'Not by default: the video and sound between your start and end are copied as they are. An exact cut re-encodes the clip at high quality, which is close but not identical to the original.',
      },
      {
        q: 'What format is the trimmed clip?',
        a: 'The same as the video you dropped: an MP4 stays an MP4, a MOV stays a MOV, and WebM and MKV stay WebM and MKV. To get an MP4 from any of them, use Video to MP4 afterwards.',
      },
    ],
  },
  {
    slug: 'mute-video',
    name: 'Mute video',
    title: 'Remove Audio from Video: Mute MP4, MOV, No Upload | Stayput',
    description:
      'Remove the sound from a video in your browser. The picture is copied untouched, so it takes seconds with no quality loss. MP4, MOV, WebM, MKV. No upload.',
    heading: 'Remove audio from a video',
    tagline: 'Take the sound out of a video, in seconds and without re-encoding. The video never leaves this device.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop videos to mute',
    action: 'Remove sound',
    keywords: ['remove audio from video', 'mute video', 'remove sound from video', 'mute video online', 'silent video', 'remove audio from mp4'],
    steps: [
      'Drop one or more videos (MP4, MOV, WebM or MKV), or tap to pick them.',
      'There is nothing to set.',
      'Remove sound. Each video is rewritten without its sound track, in the same format, and downloads straight away (several download as a zip).',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. The file is read and rewritten by code in this page. There is no server in the process, so there is no upload, no size limit and no copy left anywhere. The page works with Wi-Fi off.',
      },
      {
        q: 'Does removing the sound lower the quality?',
        a: 'No. The video track is copied packet by packet into the new file, exactly as it was. Only the sound track is left out, which is also why a long video is done in seconds.',
      },
      {
        q: 'What format is the result?',
        a: 'The same as the video you dropped: an MP4 stays an MP4, a MOV stays a MOV, and WebM and MKV stay WebM and MKV.',
      },
      {
        q: 'Can I remove only part of the sound, or replace it?',
        a: 'This tool removes the whole sound track. To keep the sound on its own instead, use Video to MP3.',
      },
    ],
  },
  {
    slug: 'resize-video',
    name: 'Resize video',
    title: 'Resize Video to 1080p or 720p Online, No Upload | Stayput',
    description:
      'Resize a video in your browser: 4K to 1080p, 1080p to 720p, half size or any width and height. MP4, MOV, WebM in, MP4 out. No upload, no watermark.',
    heading: 'Resize a video',
    tagline: 'Change a video’s resolution, from 4K down to 240p or to an exact width and height. Resized on this device, never uploaded.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop videos to resize',
    action: 'Resize',
    keywords: ['resize video', 'change video resolution', 'video resizer', 'resize mp4', '4k to 1080p', 'reduce video resolution'],
    steps: [
      'Drop one or more videos (MP4, MOV, WebM or MKV), or tap to pick them.',
      'Choose a new size: 1080p, 720p and so on, a percentage, or a custom width and height.',
      'Resize. Each video is re-encoded at the new size into an MP4 and downloads straight away.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. Your browser decodes and re-encodes the video with its own video encoder, in this tab. There is no server in the process, so there is no upload, no size limit and no watermark.',
      },
      {
        q: 'What does 720p mean for a vertical phone video?',
        a: 'The p number sets the short side. A landscape 1920×1080 video at 720p becomes 1280×720, and a portrait 1080×1920 one becomes 720×1280, so tall videos stay tall.',
      },
      {
        q: 'Will the aspect ratio change?',
        a: 'Not with the preset sizes, which keep the shape of the picture. With a custom size, fill in only the width or only the height to keep the shape; fill in both and the picture is stretched to fit exactly.',
      },
      {
        q: 'Does making a video smaller also make the file smaller?',
        a: 'Usually, because there are fewer pixels to store. To aim for a particular file size, such as 10 MB for Discord, use Compress video instead.',
      },
    ],
  },
  {
    slug: 'rotate-video',
    name: 'Rotate video',
    title: 'Rotate Video 90 or 180 Degrees, Flip Video, No Upload | Stayput',
    description:
      'Rotate a video 90° or 180°, or flip it to mirror it, in your browser. Fix sideways phone videos. MP4, MOV, WebM in, MP4 out. No upload, no watermark.',
    heading: 'Rotate or flip a video',
    tagline: 'Turn a sideways or upside-down video the right way up, or mirror it. Done on this device, never uploaded.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop videos to rotate',
    action: 'Rotate',
    keywords: ['rotate video', 'flip video', 'rotate video 90 degrees', 'mirror video', 'rotate mp4', 'fix sideways video'],
    steps: [
      'Drop one or more videos (MP4, MOV, WebM or MKV), or tap to pick them.',
      'Choose how far to turn them, and tick a flip if you want a mirror image.',
      'Rotate. Each video is re-encoded the right way up into an MP4 and downloads straight away.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. Your browser decodes the video, turns each frame and encodes it again with its own video encoder, all in this tab. There is no upload, no size limit and no watermark.',
      },
      {
        q: 'Will the rotation show everywhere?',
        a: 'Yes. Some tools only set a rotation flag that certain players ignore. Here the turn is built into the picture itself, so the video looks the same in every player, editor and upload form.',
      },
      {
        q: 'Which way is 90° right?',
        a: 'Clockwise. A video filmed with the phone turned left, that plays lying on its side, usually needs 90° right; if it ends up upside down, choose 90° left instead.',
      },
      {
        q: 'Does rotating lower the quality?',
        a: 'Turning the picture means encoding it again. That is done at high quality, so the result is close to the original, and the sound is copied as it is.',
      },
    ],
  },
  {
    slug: 'crop-video',
    name: 'Crop video',
    title: 'Crop Video Online to 9:16, 1:1 or Any Size, No Upload | Stayput',
    description:
      'Crop a video in your browser: draw a box or pick 9:16, 1:1 or 4:5 for TikTok, Reels and Instagram. MP4, MOV, WebM in, MP4 out. No upload, no watermark.',
    heading: 'Crop a video',
    tagline: 'Cut away the edges of a video, or crop it to vertical or square for social media. Cropped on this device, never uploaded.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: false,
    dropLabel: 'Drop a video to crop',
    action: 'Crop',
    keywords: ['crop video', 'crop video online', 'video cropper', 'crop mp4', 'crop video to 9:16', 'crop video for instagram'],
    steps: [
      'Drop a video (MP4, MOV, WebM or MKV), or tap to pick it. A frame from it appears with a crop box.',
      'Drag the box and its edges, or pick an aspect ratio such as 9:16 or 1:1. You can also type the position and size in pixels.',
      'Crop. The whole video is cut to that box and re-encoded into an MP4, sound included.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. Your browser shows a frame from the file on your device, and the crop is done by its own video decoder and encoder in this tab. There is no upload, no size limit and no watermark.',
      },
      {
        q: 'How do I make a landscape video vertical for TikTok or Reels?',
        a: 'Choose Vertical (9:16). The box snaps to the tallest 9:16 area in the middle of the picture; drag it left or right to keep the part that matters.',
      },
      {
        q: 'Does cropping lower the quality?',
        a: 'Cropping keeps every pixel inside the box at its original size, but the video has to be encoded again. That is done at high quality, so the result looks very close to the original.',
      },
      {
        q: 'Can I crop just part of the video’s length?',
        a: 'This crops the picture for the whole video. To keep only part of the time, use Trim video first or afterwards.',
      },
    ],
  },
  {
    slug: 'video-speed',
    name: 'Change video speed',
    title: 'Change Video Speed: Speed Up or Slow Down, No Upload | Stayput',
    description:
      'Speed up a video to 2×, 4× or 8×, or slow it down to 0.5× or 0.25×, in your browser. The sound keeps its pitch. MP4 out. No upload, no watermark.',
    heading: 'Change video speed',
    tagline: 'Make a video faster or slower, with sound that stays at the right pitch. Done on this device, never uploaded.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop videos to speed up or slow down',
    action: 'Change speed',
    keywords: ['speed up video', 'video speed changer', 'slow down video', 'change video speed', 'speed up video online', 'slow motion video'],
    steps: [
      'Drop one or more videos (MP4, MOV, WebM or MKV), or tap to pick them.',
      'Choose a speed: above 1× to speed up, below 1× to slow down.',
      'Change speed. Each video is re-encoded at the new speed into an MP4, with its sound stretched to match.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. Your browser decodes the video, re-times every frame and encodes it again in this tab. There is no upload, no size limit and no watermark.',
      },
      {
        q: 'Does the sound speed up too?',
        a: 'Yes, and it keeps its pitch: the sound is cut into tiny overlapping pieces that are laid down closer together or further apart, so a voice at 2× sounds quick, not squeaky. Tick Remove the sound for a silent result.',
      },
      {
        q: 'Will slow motion look smooth?',
        a: 'Each frame is shown for longer, so 0.5× of a 60 fps phone video plays at a smooth 30 fps. Slowing a 30 fps video a lot will look steppy, because no new frames are invented in between.',
      },
      {
        q: 'Why is my sped-up video not much smaller?',
        a: 'Speeding up keeps up to 60 frames a second and drops the rest, so a 4× video is roughly a quarter as long but has the same picture quality per second. To make it smaller as well, run it through Compress video.',
      },
    ],
  },
  {
    slug: 'merge-videos',
    name: 'Merge videos',
    title: 'Merge Videos Online: Combine Clips into One MP4 | Stayput',
    description:
      'Join two or more videos end to end into one MP4 in your browser. MP4, MOV, WebM and MKV. Reorder the clips, keep the sound. No upload, no watermark.',
    heading: 'Merge videos',
    tagline: 'Combine clips into a single video, in the order you choose. Done on this device, never uploaded.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop the videos to join',
    action: 'Merge videos',
    keywords: ['merge videos', 'combine videos', 'join videos', 'video merger', 'merge videos online', 'combine mp4 files', 'put videos together'],
    steps: [
      'Drop two or more videos (MP4, MOV, WebM or MKV), or tap to pick them.',
      'Put them in order with the arrows. The first video sets the size of the result.',
      'Merge. The clips are joined and encoded into one MP4, with each clip’s sound in place.',
    ],
    faq: [
      {
        q: 'Are my videos uploaded?',
        a: 'No. Your browser decodes each clip, draws its frames one after another and encodes them into one MP4 in this tab. There is no upload, no size limit and no watermark.',
      },
      {
        q: 'Can I join videos of different sizes or shapes?',
        a: 'Yes. The result takes the size of the first video, and any clip with a different shape is fitted inside it with black bars, so nothing is stretched or cut off. Put the clip whose shape you want first, or crop the others to match first with Crop video.',
      },
      {
        q: 'What happens to the sound?',
        a: 'Each clip keeps its own sound, lined up with its picture. A clip with no sound is silent in the result. Tick Remove the sound for a silent video.',
      },
      {
        q: 'Why does merging take a while?',
        a: 'Clips from different cameras rarely share the same format, so every frame is encoded again to make one continuous video. That runs on your device, using its hardware video encoder where the browser has one.',
      },
    ],
  },
  {
    slug: 'add-audio-to-video',
    name: 'Add audio to video',
    title: 'Add Audio or Music to Video Online, No Upload | Stayput',
    description:
      'Put an MP3, WAV or M4A on a video, or swap in the sound of another clip, in your browser. Replace or mix, loop and fade. Picture copied untouched, nothing uploaded.',
    heading: 'Add audio to a video',
    tagline: 'Put music or a voice-over on a video, or replace its sound. The picture is copied as it is, and nothing is uploaded.',
    category: 'media',
    accept: 'video/*,audio/*,.mp4,.m4v,.mov,.webm,.mkv,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac',
    multiple: true,
    dropLabel: 'Drop a video and a sound file',
    action: 'Add audio',
    keywords: ['add audio to video', 'add music to video', 'put music on video', 'replace audio in video', 'add mp3 to video', 'add sound to video'],
    steps: [
      'Drop a video (MP4, MOV, WebM or MKV) and a sound file (MP3, WAV, M4A, or another video).',
      'Choose whether the new sound replaces the video’s own sound or plays quietly underneath it.',
      'Add audio. The picture is copied without re-encoding and the new sound is laid under it, looped or cut to fit.',
    ],
    faq: [
      {
        q: 'Are my files uploaded?',
        a: 'No. Your browser decodes the sound, fits it to the video and writes a new file in this tab. There is no upload, no size limit and no watermark.',
      },
      {
        q: 'Does the video lose quality?',
        a: 'No. The picture is copied packet by packet, exactly as it was, so it takes seconds and nothing changes. Only the sound is encoded again, as AAC in an MP4 (or Opus in a WebM for VP8 videos).',
      },
      {
        q: 'What if the song is longer or shorter than the video?',
        a: 'A longer sound is cut at the end of the video and faded out. A shorter one is repeated until the video ends, or, with Loop unticked, the rest of the video is silent.',
      },
      {
        q: 'Can I keep the original sound and add music under it?',
        a: 'Yes. Choose Keep it, with the new sound quieter underneath: the music plays at half volume under the voices in the video.',
      },
    ],
  },
  {
    slug: 'reverse-video',
    name: 'Reverse video',
    title: 'Reverse Video Online: Play a Clip Backwards, No Upload | Stayput',
    description:
      'Play a video backwards in your browser, with the sound reversed or removed. MP4, MOV, WebM or MKV in, MP4 out. No upload, no watermark, no sign-up.',
    heading: 'Reverse a video',
    tagline: 'Make a clip play backwards, for a rewind effect, a boomerang or a laugh. Done on this device, never uploaded.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop videos to reverse',
    action: 'Reverse',
    keywords: ['reverse video', 'reverse video online', 'play video backwards', 'rewind video', 'backwards video maker', 'video reverser'],
    steps: [
      'Drop one or more videos (MP4, MOV, WebM or MKV), or tap to pick them.',
      'Keep the sound to hear it backwards too, or tick Remove the sound.',
      'Reverse. Each video is decoded from the end to the start and saved as an MP4.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. Your browser decodes the video, puts its frames in the opposite order and encodes it again in this tab. There is no upload, no size limit and no watermark.',
      },
      {
        q: 'Why does reversing take longer than other video tools?',
        a: 'Videos are stored so they can only be decoded forwards. To play one backwards, the page decodes it in short pieces starting from the end, which means some frames are decoded twice. It still runs as fast as your device can decode and encode.',
      },
      {
        q: 'Does it work on long videos?',
        a: 'Yes. Only a second or so of frames is held in memory at a time, so a long video takes longer but does not run out of memory. For a quick boomerang, trim the clip first with Trim video.',
      },
    ],
  },
  {
    slug: 'video-to-jpg',
    name: 'Video to JPG',
    title: 'Video to JPG: Save Video Frames as Images, No Upload | Stayput',
    description:
      'Save frames from an MP4, MOV, WebM or MKV video as JPG or PNG images in your browser: one a second, spread across the clip, or every frame. Nothing uploaded.',
    heading: 'Video to JPG',
    tagline: 'Turn a video into still images: a few good frames or every single one. Done on this device, never uploaded.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: false,
    dropLabel: 'Drop a video to take frames from',
    action: 'Save frames',
    keywords: ['video to jpg', 'extract frames from video', 'video to images', 'video to png', 'mp4 to jpg', 'video frame extractor', 'screenshot from video'],
    steps: [
      'Drop a video (MP4, MOV, WebM or MKV), or tap to pick one.',
      'Choose how many frames to save and whether as JPG or PNG.',
      'Save frames, then download the ones you want or all of them in one zip.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. Your browser decodes only the frames you asked for and saves them as images in this tab. There is no upload, no size limit and no watermark.',
      },
      {
        q: 'Which option gives me the best still from a clip?',
        a: '10 or 30 frames spread across the video gives a quick overview to pick from. To catch an exact moment, like a blink-free group photo, choose five frames a second or every frame.',
      },
      {
        q: 'Are the images full resolution?',
        a: 'Yes. Each image is the full size of the video, upright as the video plays. A 4K video gives 3840×2160 images. PNG keeps every pixel exactly; JPG files are much smaller and look the same to the eye.',
      },
    ],
  },
  {
    slug: 'trim-audio',
    name: 'Trim audio',
    title: 'Trim Audio Online: Cut MP3, WAV or M4A, No Upload | Stayput',
    description:
      'Cut the part you want from an MP3, WAV, M4A, OGG or FLAC file, or from a video’s sound, in your browser. See the waveform, add fades, save as MP3 or WAV. No upload.',
    heading: 'Trim audio',
    tagline: 'Cut a song, a voice memo or a podcast down to the part you want, with fades if you like. Done on this device, never uploaded.',
    category: 'media',
    accept: 'audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.mp4,.mov,.webm,.mkv',
    multiple: false,
    dropLabel: 'Drop a sound file to trim',
    action: 'Trim audio',
    keywords: ['trim audio', 'cut audio', 'audio cutter', 'trim mp3', 'cut mp3', 'audio trimmer online', 'cut a song'],
    steps: [
      'Drop a sound file (MP3, WAV, M4A, OGG, FLAC) or a video, or tap to pick one.',
      'Play it or click the waveform, and set the start and end. Add a fade in or out if you want.',
      'Trim. The part you chose is saved as an MP3 or a WAV.',
    ],
    faq: [
      {
        q: 'Is my recording uploaded?',
        a: 'No. Your browser decodes the sound, cuts it and writes the new file in this tab. Voice memos and interviews stay on your device. There is no size limit and no sign-up.',
      },
      {
        q: 'Which format should I save as?',
        a: 'MP3 at 192 kbps plays on every phone, car and computer and is about a tenth the size of WAV. Choose WAV to keep the sound exactly as decoded, for example to edit it further.',
      },
      {
        q: 'Can I cut the sound out of a video?',
        a: 'Yes. Drop the video and its sound track is loaded; the part you choose is saved as audio only.',
      },
    ],
  },
  {
    slug: 'audio-converter',
    name: 'Audio converter',
    title: 'Audio Converter: MP3, WAV, M4A, OGG, FLAC, No Upload | Stayput',
    description:
      'Convert audio between MP3, WAV, FLAC, M4A and OGG in your browser, or pull the sound out of a video. Batch, no size limit, no upload, no sign-up.',
    heading: 'Audio converter',
    tagline: 'Turn any sound file into MP3, WAV, FLAC, M4A or OGG. Your files are converted on this device and never uploaded.',
    category: 'media',
    accept: 'audio/*,video/*,.mp3,.wav,.wave,.m4a,.aac,.ogg,.oga,.opus,.flac,.caf,.aiff,.aif,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop audio files to convert',
    action: 'Convert',
    keywords: ['audio converter', 'convert audio', 'audio file converter', 'wav to flac', 'mp3 to m4a', 'mp3 to ogg', 'flac converter', 'audio format converter'],
    steps: [
      'Drop one or more sound files (MP3, WAV, FLAC, M4A, OGG, Opus, AIFF) or videos, or tap to pick them.',
      'Choose the format to convert to. For MP3, M4A and OGG pick a quality; WAV and FLAC keep every sample.',
      'Convert. One file downloads straight away; several download as a zip.',
    ],
    faq: [
      {
        q: 'Are my files uploaded?',
        a: 'No. Your browser decodes the sound with its own decoders, and the new file is written inside the page: MP3 by LAME compiled to WebAssembly, WAV and FLAC by small encoders in this site’s code, M4A and OGG by the browser’s built-in AAC and Opus encoders. Nothing is sent anywhere, so there is no size cap and it works offline once the page has loaded.',
      },
      {
        q: 'Which format should I choose?',
        a: 'MP3 plays on everything. M4A (AAC) sounds a little better than MP3 at the same size and is what iPhones and Apple Music use. OGG with Opus is the smallest for a given quality and suits websites, games and voice. WAV is uncompressed, for editing. FLAC keeps exactly the same sound as WAV at about half the size, for archiving music.',
      },
      {
        q: 'Is WAV to FLAC really lossless?',
        a: 'Yes, for 16-bit audio. The FLAC decodes to the same samples, at the same sample rate, as the 16-bit WAV this tool would write. 24-bit recordings are stored as 16-bit, which is still beyond what anyone can hear, but keep the original if you need 24-bit for mastering.',
      },
      {
        q: 'Why can’t my browser make an M4A?',
        a: 'M4A needs an AAC encoder, and browsers only have one where the operating system provides it: Safari, and Chrome or Edge on Windows and Mac have it, while Firefox and Chrome on Linux do not. The page tells you when you pick M4A. MP3 plays in all the same places.',
      },
      {
        q: 'Does converting improve the quality?',
        a: 'No. Converting can keep the quality (to WAV or FLAC) or lower it (to MP3, M4A or OGG), never raise it. An MP3 turned into a FLAC is a bigger file with the same MP3 sound.',
      },
    ],
  },
  {
    slug: 'volume-booster',
    name: 'Volume booster',
    title: 'Volume Booster: Make Audio or Video Louder, No Upload | Stayput',
    description:
      'Make an MP3, voice memo or video louder or quieter, or normalize a batch to the same loudness, in your browser. No clipping, no upload, no sign-up.',
    heading: 'Make audio louder',
    tagline: 'Boost a quiet recording, turn down a loud one, or even out a batch. Done on this device, never uploaded.',
    category: 'media',
    accept: 'audio/*,video/*,.mp3,.wav,.wave,.m4a,.aac,.ogg,.oga,.opus,.flac,.caf,.aiff,.aif,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop audio or video files to change the volume',
    action: 'Change volume',
    keywords: ['volume booster', 'increase audio volume', 'make audio louder', 'mp3 volume booster', 'increase video volume', 'normalize audio', 'amplify audio', 'make mp3 louder'],
    steps: [
      'Drop one or more sound files (MP3, WAV, M4A, FLAC, OGG) or videos (MP4, MOV, WebM), or tap to pick them.',
      'Choose how much louder or quieter, or Normalize to bring every file to the same comfortable loudness. Keep the original format or pick another.',
      'Run it. Peaks that would clip are eased down so nothing distorts. Videos keep their picture untouched and get the new sound.',
    ],
    faq: [
      {
        q: 'Are my files uploaded?',
        a: 'No. Your browser decodes the sound, the volume change runs in the page, and the file is written again in your tab. Videos have their picture copied across without re-encoding. Nothing is sent anywhere, and it works offline once the page has loaded.',
      },
      {
        q: 'Will boosting make it distort?',
        a: 'Not by clipping. A limiter looks a few milliseconds ahead and turns down only the peaks that would go past the top, then eases back, so a +10 dB boost stays clean. The result card says what share of the sound was eased. Very large boosts on already loud music will sound squashed; use Normalize for those.',
      },
      {
        q: 'What does Normalize do?',
        a: 'It measures how loud the talking or music is (ignoring pauses) and turns each file up or down to about −14 LUFS, the level Spotify and YouTube play at. A batch of voice memos or podcast clips ends up at the same volume.',
      },
      {
        q: 'Does it make a video louder too?',
        a: 'Yes. Drop an MP4, MOV or WebM and the new sound is put back with the original picture, which is copied as it is. The sound is re-encoded as AAC in an MP4, or Opus in a WebM.',
      },
      {
        q: 'Does the MP3 lose quality?',
        a: 'Saving an MP3 again re-encodes it, at about the original’s bitrate, which is inaudible for most listening. For editing, save as WAV or FLAC.',
      },
    ],
  },
  {
    slug: 'merge-audio',
    name: 'Merge audio',
    title: 'Merge Audio Files Online: Join MP3 and WAV, No Upload | Stayput',
    description:
      'Join two or more audio files into one MP3 or WAV in your browser, in the order you choose, with silence or a crossfade between them. No upload, no limits.',
    heading: 'Merge audio files',
    tagline: 'Combine songs, voice notes or podcast segments into one file. Done on this device, never uploaded.',
    category: 'media',
    accept: 'audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm,.mp4',
    multiple: true,
    dropLabel: 'Drop the audio files to join',
    action: 'Merge audio',
    keywords: ['merge audio', 'merge mp3', 'combine audio files', 'join mp3', 'audio joiner', 'combine mp3 files', 'mp3 merger'],
    steps: [
      'Drop two or more audio files (MP3, WAV, M4A, OGG, FLAC, or the sound of a video), or tap to pick them. Use the arrows to put them in order.',
      'Choose what goes between them: nothing, a moment of silence, or a crossfade that blends one into the next.',
      'Merge. The files are joined and written as one MP3 or WAV, which downloads straight away.',
    ],
    faq: [
      {
        q: 'Are my files uploaded?',
        a: 'No. Your browser decodes each file and the joined file is written by code in this page. Nothing is sent to a server, there is no size limit, and the page works offline once loaded.',
      },
      {
        q: 'Can I mix different formats?',
        a: 'Yes. An MP3, a WAV from a recorder and an M4A voice memo can be joined together; everything is converted to 44.1 kHz on the way. If any file is stereo, mono files are played in both ears.',
      },
      {
        q: 'Does merging lower the quality?',
        a: 'Saving as WAV keeps every sample. MP3 is re-encoded once at the quality you choose; at 192 kbps or more the difference from the originals is very hard to hear.',
      },
      {
        q: 'Can I cut the files before joining them?',
        a: 'Use Trim audio on each file first to cut the start or end, then merge the trimmed files here.',
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
  {
    slug: 'remove-background',
    name: 'Remove background',
    title: 'Remove Background from Image, Free, No Upload | Stayput',
    description:
      'Remove the background from a photo in your browser. Get a transparent PNG or a white or coloured background, at full resolution. Nothing is uploaded.',
    heading: 'Remove the background from an image',
    tagline: 'Cut out people, pets and products at full resolution. The photo never leaves this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop photos to remove the background',
    action: 'Remove background',
    keywords: ['remove background', 'background remover', 'remove background from image', 'transparent background', 'make background transparent', 'remove bg', 'cut out image', 'white background'],
    steps: [
      'Drop one or more photos (JPG, PNG, WebP, HEIC, AVIF or JPEG XL), or tap to pick them.',
      'Choose a transparent, white or coloured background, or keep the scene and blur it, and the file type. The first photo downloads the cut-out model once; after that it is cached.',
      'Download the cut-out at the photo’s full size, or all of them in one zip.',
    ],
    faq: [
      {
        q: 'Is my photo uploaded?',
        a: 'No. A segmentation model runs inside your browser tab and works out which pixels are the subject; the new image is written there too. The only download is the model itself, fetched from this site the first time. You can load the page, use it once, turn off Wi-Fi and it keeps working.',
      },
      {
        q: 'Why is the first photo slow?',
        a: 'The first time, the page downloads the model (about 46 MB) and the WebAssembly runtime that runs it, and shows the progress. Both are cached by your browser, so later photos, and later visits, start straight away. Each photo then takes a few seconds, depending on your device.',
      },
      {
        q: 'What resolution is the result?',
        a: 'The same as your photo. The model finds the outline at 1024 × 1024, and that outline is scaled back up and applied to your original pixels, so a 12 megapixel photo gives a 12 megapixel cut-out. There is no low-resolution preview tier and no watermark.',
      },
      {
        q: 'What works best?',
        a: 'A clear subject that stands out from its background: a person, a pet, a product on a table, a car, a logo on a plain wall. Fine hair and fur are kept as soft edges. Busy scenes where the subject blends into the background, or several overlapping subjects, may need a second try: set Keep around the edges to More if part of the subject goes missing, or Less if bits of background stay.',
      },
      {
        q: 'How do I get a white background for a product photo?',
        a: 'Choose White (or Colour for any other shade) and save as JPG or PNG. Marketplaces such as Amazon ask for a pure white background, which is exactly what this fills in, at the original resolution.',
      },
      {
        q: 'Can I blur the background instead of removing it?',
        a: 'Yes. Choose Blur and set the strength: the subject stays sharp and the scene behind softens, like the portrait mode on a phone camera. It works on photos taken with any camera, including ones that were never shot in portrait mode.',
      },
      {
        q: 'Which model does this use?',
        a: 'ISNet general-use from the DIS research project, released under the Apache 2.0 licence, converted to 8-bit weights so it downloads faster. It runs with onnxruntime-web, Microsoft’s open-source runtime for machine learning models in the browser.',
      },
    ],
  },
  {
    slug: 'passport-photo',
    name: 'Passport photo maker',
    title: 'Passport Photo Maker, Free, No Upload | Stayput',
    description:
      'Make a 2 × 2 inch US passport photo or a 35 × 45 mm photo from a selfie, plus a 4 × 6 print sheet. Runs in your browser; your photo is never uploaded.',
    heading: 'Make a passport photo',
    tagline: 'Crop a photo to passport size with the head at the right height, and get a sheet to print at any photo counter.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: false,
    dropLabel: 'Drop a photo of yourself',
    action: 'Make passport photo',
    keywords: ['passport photo', 'passport photo maker', 'passport photo online', 'id photo', 'visa photo', '2x2 photo', '35x45 photo', 'passport size photo', 'passport photo app'],
    steps: [
      'Drop a photo taken straight on: face the camera, neutral expression, eyes open, in even light, with some space above your head.',
      'Pick the size, and keep the background or replace it with white or light grey. The first photo downloads the face finder and cut-out model once.',
      'Download the single photo for online applications, and the 4 × 6 sheet to print at a photo counter or at home, then cut along the grey lines.',
    ],
    faq: [
      {
        q: 'Is my photo uploaded?',
        a: 'No. A face detector finds your eyes and mouth, a segmentation model finds the outline of your head, and the photo is cropped and drawn on a canvas, all inside your browser tab. The only downloads are the two models, fetched from this site the first time. A passport photo is an identity document; it has no business on a stranger’s server.',
      },
      {
        q: 'How is the head sized?',
        a: 'The head is measured from the top of the hair to the chin and scaled to the middle of the allowed range: 1 to 1 3/8 inches (25 to 35 mm) on a 2 × 2 inch US photo, 32 to 36 mm on a 35 × 45 mm photo. The chin is estimated from where your eyes and mouth are, so check the result looks right before you print.',
      },
      {
        q: 'What sizes can I make?',
        a: '2 × 2 inches (51 × 51 mm), used for US passports and visas and by a few other countries, and 35 × 45 mm, used for Schengen visas and most European passports, among many others. Sizes and rules differ between countries and change, so check your government’s current photo rules before you apply.',
      },
      {
        q: 'How do I print it?',
        a: 'Download the 4 × 6 inch print sheet and order a standard 4 × 6 (10 × 15 cm) photo print at a pharmacy, supermarket kiosk or online photo lab, or print it at home on photo paper at 100% scale. The sheet holds several copies at the exact size; cut along the thin grey lines. Prints of this size usually cost well under a dollar.',
      },
      {
        q: 'Should I replace the background?',
        a: 'Only if you have to. Most offices want a plain white or off-white background, and some, including the UK passport office, reject photos changed by software, which is why the UK size is not offered here. Standing in front of a light, plain wall and keeping the photo’s own background is the safest choice.',
      },
      {
        q: 'What photo works best?',
        a: 'One taken by someone else from about 1.5 metres (4 to 5 feet) away, at eye level, in even daylight with no shadows on your face or behind you. Take off glasses and hats, keep your hair off your face, and leave plenty of space above your head and around your shoulders so there is room to crop.',
      },
    ],
  },
  {
    slug: 'watermark-image',
    name: 'Watermark image',
    title: 'Add Watermark to Photo, Free, No Upload | Stayput',
    description:
      'Add a text watermark to photos in your browser: your name, a copyright line or a website, in a corner, across the middle or repeated. No upload, no sign-up.',
    heading: 'Add a watermark to images',
    tagline: 'Put your name or a copyright notice on photos before you share them, at full resolution, on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop photos to watermark',
    action: 'Add watermark',
    keywords: ['watermark image', 'add watermark to photo', 'watermark photos', 'copyright watermark', 'add text to image', 'photo watermark free', 'batch watermark'],
    steps: [
      'Drop one or more photos (JPG, PNG, WebP, HEIC, AVIF or JPEG XL), or tap to pick them.',
      'Type the text, choose where it goes, and set the size, opacity and colour while watching the preview.',
      'Download each watermarked photo at full size, or all of them in one zip.',
    ],
    faq: [
      {
        q: 'Are my photos uploaded?',
        a: 'No. Each photo is decoded, drawn with the watermark and saved inside your browser tab. Nothing is sent to a server, so unpublished work, client photos and pictures of your home stay on your device. The page works with Wi-Fi off once it has loaded.',
      },
      {
        q: 'Which placement should I use?',
        a: 'Corner is the usual choice for photographers and shops: a small, readable credit that leaves the picture alone. Across the middle is harder to remove and suits proofs you send before payment. Repeated covers the whole photo in a pattern, so it cannot be cropped or cloned away; use it for images you are worried about being reused, such as ID documents sent to a landlord.',
      },
      {
        q: 'Can I watermark many photos at once?',
        a: 'Yes. Drop as many as you like; the same text, placement and style go on every one, scaled to each photo’s size, so a portrait and a panorama both look right. Download them one by one or as a zip.',
      },
      {
        q: 'Does it reduce the quality?',
        a: 'The photo keeps its full resolution. PNG saves are lossless; JPG and WebP are saved at high quality (92), which is visually the same as the original for almost all photos. Choose Save as PNG if you need it untouched apart from the watermark.',
      },
      {
        q: 'Can I add a copyright symbol or emoji?',
        a: 'Yes. Type or paste any text, including ©, ®, ™, emoji and non-Latin scripts; it is drawn with your device’s own fonts. On a phone the © symbol is usually on the symbols keyboard, or copy it from the default text.',
      },
      {
        q: 'Should I watermark an ID before sending it?',
        a: 'It is a good habit. A repeated watermark such as “For flat rental at 12 High St only, May 2026” across a passport or driving licence scan makes the copy useless for anything else if it leaks. Doing it here means the ID is not uploaded to yet another website in the process.',
      },
    ],
  },
  {
    slug: 'watermark-pdf',
    name: 'Watermark PDF',
    title: 'Add Watermark to PDF, Free, No Upload | Stayput',
    description:
      'Stamp CONFIDENTIAL, DRAFT or any text on every page of a PDF, diagonally, repeated or in a corner. Runs in your browser; the document is never uploaded.',
    heading: 'Add a watermark to a PDF',
    tagline: 'Mark every page as a draft, confidential or a copy for one person, without sending the document anywhere.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: true,
    dropLabel: 'Drop PDFs to watermark',
    action: 'Add watermark',
    keywords: ['watermark pdf', 'add watermark to pdf', 'pdf watermark', 'confidential watermark pdf', 'draft watermark pdf', 'stamp pdf', 'watermark pdf free'],
    steps: [
      'Drop one or more PDFs, or tap to pick them.',
      'Type the text, such as CONFIDENTIAL or DRAFT, and pick the placement, size, opacity and colour, checking the preview of page 1.',
      'Download the watermarked PDF. Every page gets the mark, sized to that page.',
    ],
    faq: [
      {
        q: 'Is my PDF uploaded?',
        a: 'No. The PDF is opened, stamped and saved by code running in your browser tab. The documents people watermark are usually the sensitive ones, such as contracts, bank statements, pay slips and scans of IDs, and here they never reach a server.',
      },
      {
        q: 'Can the watermark be removed?',
        a: 'It is added to each page as an image layered over the content, so it cannot be selected and deleted like text in most PDF readers. Someone with a PDF editor can still find and delete the image. For a copy that cannot be cleaned, choose Repeated and then flatten the PDF with the compress tool’s Flatten option, which turns each page into a single picture.',
      },
      {
        q: 'Does it change the rest of the document?',
        a: 'No. Text stays selectable and searchable, links and form fields keep working, and page sizes are unchanged. Only the watermark layer is added on top of each page.',
      },
      {
        q: 'Which placement should I use?',
        a: 'Across the middle is the classic diagonal CONFIDENTIAL or DRAFT stamp. Repeated tiles the text over the whole page, which is the safest for a copy of an ID or a statement you have to send to someone. Corner adds a small, quiet mark, such as a name and date, that does not get in the way of reading.',
      },
      {
        q: 'Does it work on scanned and password-protected PDFs?',
        a: 'Scanned PDFs work like any other. A PDF that only needs a password to change (not to open) is handled automatically. If it asks for a password to open, remove it first with the unlock PDF tool, using the password you know.',
      },
      {
        q: 'What about landscape or mixed-size pages?',
        a: 'Each page gets its own watermark sized to it, so a landscape page or an A3 drawing in the middle of an A4 document is covered the same way, and rotated pages come out the right way up.',
      },
    ],
  },
  {
    slug: 'remove-pdf-metadata',
    name: 'Remove PDF metadata',
    title: 'Remove Metadata from PDF, Free, No Upload | Stayput',
    description:
      'See and remove the hidden author, software, dates, XMP and file ID in a PDF before you share it. Runs in your browser; the document is never uploaded.',
    heading: 'Remove metadata from a PDF',
    tagline: 'See the name, software and dates hidden in a PDF, and strip them before it goes out.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: true,
    dropLabel: 'Drop PDFs to check and clean',
    action: 'Remove metadata',
    keywords: ['remove metadata from pdf', 'pdf metadata remover', 'remove author from pdf', 'pdf metadata viewer', 'strip pdf metadata', 'clean pdf metadata', 'anonymize pdf'],
    steps: [
      'Drop one or more PDFs, or tap to pick them. The metadata each one carries is listed straight away.',
      'Press Remove metadata.',
      'Download the cleaned PDFs. They keep their names, pages, text and links; only the metadata is gone.',
    ],
    faq: [
      {
        q: 'What metadata does a PDF carry?',
        a: 'Usually the author (often your full name or your computer’s user name, taken from Word or your operating system), the title, the program that created it and the one that made the PDF, with version numbers, and the dates it was created and last changed. Many PDFs also carry an XMP packet repeating all that, sometimes with edit history, and some apps add private data (PieceInfo) and a unique file ID.',
      },
      {
        q: 'Is my PDF uploaded?',
        a: 'No. The file is read and rewritten by code running in your browser tab, so a CV, contract, legal filing or anonymous tip never leaves your device. The page works with Wi-Fi off once it has loaded.',
      },
      {
        q: 'Does it change the document itself?',
        a: 'No. Pages, text, fonts, images, links, bookmarks and form fields are kept as they are. Only the information dictionary, XMP metadata, PieceInfo private data, the file ID and any objects nothing refers to any more are removed.',
      },
      {
        q: 'Why keep the same file name?',
        a: 'A name like report-clean.pdf would itself tell people the file was scrubbed. Rename it yourself if you want to; the name you give a file is not stored inside it.',
      },
      {
        q: 'Does it remove everything that could identify me?',
        a: 'It removes the document metadata. It cannot know about names written in the text itself, in comments, in headers and footers, or in the EXIF data of photos placed on the pages. Check the visible content, and remove photo metadata with the remove EXIF tool before you put photos into a document.',
      },
      {
        q: 'Can I just see the metadata without removing it?',
        a: 'Yes. Drop the PDF and read the list; nothing is changed until you press Remove metadata, and the file on your device is never changed at all, because the cleaned copy is a new download.',
      },
    ],
  },
  {
    slug: 'sticker-maker',
    name: 'Sticker maker',
    title: 'Sticker Maker: Photo to Sticker, Free, No Upload | Stayput',
    description:
      'Turn a photo into a sticker: the background is removed, a white die-cut border is added, and you get a transparent PNG or a 512 px WebP for WhatsApp. Nothing is uploaded.',
    heading: 'Make a sticker from a photo',
    tagline: 'Cut out a person, pet or object, add a white border, and save it as a sticker, on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop photos to turn into stickers',
    action: 'Make sticker',
    keywords: ['sticker maker', 'photo to sticker', 'make sticker from photo', 'whatsapp sticker maker', 'telegram sticker', 'die cut sticker', 'sticker with white border'],
    steps: [
      'Drop one or more photos with a clear subject: a face, a pet, a mug, a plant.',
      'Pick the border (none, thin or thick) and its colour, and the size: fitted to the subject, or 512 × 512 for WhatsApp and Telegram.',
      'Download the stickers as transparent PNG or WebP, one by one or as a zip.',
    ],
    faq: [
      {
        q: 'Is my photo uploaded?',
        a: 'No. The cut-out model runs inside your browser tab, and the border and file are made there too. Photos of your friends, kids and pets stay on your device. The only download is the model, fetched from this site once and then cached.',
      },
      {
        q: 'How do I use it in WhatsApp?',
        a: 'Choose 512 × 512 and WebP. On WhatsApp Web or the desktop app, open the sticker panel, choose Create, and upload the file. On a phone, WhatsApp only takes custom stickers through a sticker app or pack, so the desktop route is the quickest. The file is kept under WhatsApp’s 100 KB limit where possible.',
      },
      {
        q: 'And Telegram?',
        a: 'Telegram stickers are also 512 pixels on the long side, in PNG or WebP. Choose 512 × 512 and send the file to Telegram’s @Stickers bot to add it to a pack.',
      },
      {
        q: 'Can I print the sticker?',
        a: 'Yes. Choose Fit the subject and PNG for the largest size your photo allows (up to 2048 pixels on the long side). The white border is the classic die-cut look that sticker printers cut along; most print services accept a transparent PNG.',
      },
      {
        q: 'Why does the cut-out miss part of my subject?',
        a: 'The model works best with one clear subject standing out from its background. If part is missing or bits of background stay, open the background remover with the same photo, adjust Keep around the edges, save the PNG, and drop that here.',
      },
      {
        q: 'Can I make a sticker of a drawing or logo?',
        a: 'Yes, as long as it stands out from its background. For a logo that is already on transparency, the border is added around its shape directly.',
      },
    ],
  },
  {
    slug: 'profile-picture-maker',
    name: 'Profile picture maker',
    title: 'Profile Picture Maker: Cut Out, Colour, Circle | Stayput',
    description:
      'Turn a photo into a profile picture: background removed, your face centred on a colour, as a circle or square at 1024 px. Made in your browser; nothing is uploaded.',
    heading: 'Make a profile picture',
    tagline: 'A clean headshot on a colour of your choice, framed around your face, made on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop a photo of yourself',
    action: 'Make profile picture',
    keywords: ['profile picture maker', 'pfp maker', 'profile photo maker', 'avatar maker from photo', 'linkedin profile picture', 'headshot background', 'circle profile picture'],
    steps: [
      'Drop a photo where your face is clear and well lit; a selfie works.',
      'Pick a background colour and a circle or square.',
      'Download the 1024 × 1024 picture and upload it to LinkedIn, Slack, Discord, Instagram or anywhere else.',
    ],
    faq: [
      {
        q: 'Is my photo uploaded?',
        a: 'No. A face detector and a cut-out model run inside your browser tab, and the picture is drawn there. Your face does not go to a server, which is more than most avatar and headshot apps can say.',
      },
      {
        q: 'How is the picture framed?',
        a: 'Around your face: the face fills about 40% of the width with the eyes a little above the middle, the usual headshot framing that still looks right when a site crops it to a circle. If no face is found, for a pet or an object, the whole subject is fitted in instead.',
      },
      {
        q: 'Which background colour works best?',
        a: 'A colour that contrasts with your hair and clothes and stays recognisable at thumbnail size. Soft, light colours read as professional on LinkedIn; bright ones stand out in Slack and Discord member lists. Using the same colour everywhere makes you easier to spot.',
      },
      {
        q: 'Why 1024 × 1024?',
        a: 'It is larger than any site displays, so every site can scale it down sharply: LinkedIn shows 400 × 400, Slack and Discord show much smaller. Uploading a bigger square than needed avoids the blur you get when a site enlarges a small one.',
      },
      {
        q: 'Should I choose circle or square?',
        a: 'Most sites crop to a circle themselves, so a square with a colour background works everywhere. Choose Circle when the picture will be shown as-is on a page, in a slide or an email signature, where a square would look boxy; the corners are transparent, so it is saved as PNG.',
      },
      {
        q: 'My hair looks cut off at the edges.',
        a: 'Fine, flyaway hair against a busy background is the hardest case for the cut-out. A photo against a plain wall works best. You can also run the photo through the background remover first, adjusting Keep around the edges, and drop the PNG it gives you here.',
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
