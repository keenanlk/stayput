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
  /** Icon name for the tool card (see Icon.astro). Defaults: presets use their base tool's, pairs 'convert', else 'pdf'. */
  icon?: string;
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
  /** Replaces the "No size caps, no watermark" line under the heading, for tools whose size is bounded by the device. */
  sizeFact?: string;
  /** Hero paragraph with inline markup (links); the plain `tagline` stays for cards, search and social images. */
  taglineMd?: string;
  /** Extra headed blocks shown above "How it works". Bullets and paragraphs accept inline markup. */
  sections?: { heading: string; paragraphs?: string[]; bullets?: string[] }[];
  /** Hand-written lead paragraph (plain text) replacing the one built in src/data/leads.ts. */
  lead?: string;
}

export const toolPath = (t: Pick<Tool, 'slug' | 'path'>): string => t.path ?? `/tools/${t.slug}`;

/** FAQ entry for the pages whose lead says no account and no watermark; backed by the grep recorded in the PR that added it. */
const NOACCOUNT: Faq = {
  q: 'Do I need an account, and is there a watermark?',
  a: 'No account and no sign-up: open the page and drop a file. Nothing is added to your file, so there is no watermark or logo. It is free, and your files are not uploaded.',
};

export const tools: Tool[] = [
  {
    slug: 'heic-to-jpg',
    icon: 'image',
    name: 'HEIC to JPG',
    title: 'Online HEIC to JPG Converter: Free, Batch, No Upload | Stayput',
    description:
      'Online HEIC to JPG converter: turn iPhone HEIC photos into JPG or PNG in your browser. Drop many at once, keep or drop location data. Nothing is uploaded; no watermark.',
    heading: 'Convert HEIC to JPG online',
    tagline:
      'Turn iPhone and iPad photos into JPG or PNG files that open anywhere. Your photos never leave this device.',
    category: 'images',
    accept: '.heic,.heif,image/heic,image/heif',
    multiple: true,
    dropLabel: 'Drop HEIC photos here',
    action: 'Convert',
    sizeFact: 'No sign-up, no watermark',
    lead:
      'Converts iPhone and iPad HEIC or HEIF photos to JPG or PNG, one photo or a whole batch, and can give you a batch as one zip. Location and camera details are left out unless you choose JPG and tick Keep EXIF metadata. It is free, needs no account and adds no watermark, and your photos are not uploaded: a HEIC decoder runs in your browser. The size limit is your device’s memory (phones hold less), and after one visit and a short wait the page works offline.',
    sections: [
      {
        heading: 'How to open or convert HEIC on Windows, Mac and iPhone',
        bullets: [
          'On this page: drop the HEIC file, choose JPG or PNG and download the result. Nothing is uploaded.',
          'On Windows, HEIC needs the HEIF image extension from Microsoft; or convert the file here instead. See [how to open HEIC files on Windows](/guides/open-heic-files-on-windows).',
          'On an iPhone, Settings > Camera > Formats > Most Compatible makes new photos JPG. Photos you already took stay HEIC, so convert those here.',
        ],
      },
      {
        heading: 'What is a HEIC file?',
        paragraphs: [
          'HEIC is the photo format iPhones and iPads have used since iOS 11. It stores the same picture in about half the space of a JPG, but Windows, many websites and older programs cannot open it, which is why people convert HEIC to JPG. Need a lossless copy? Use [HEIC to PNG](/heic-to-png). Photos carry their date and GPS location; to take it off a JPG you already have, use [Remove EXIF data](/tools/strip-exif).',
        ],
      },
      {
        heading: 'A worked example: a day of photos for a Windows PC',
        paragraphs: [
          'Say you copied 30 photos from an iPhone to a Windows PC and the Photos app shows blanks. Select all the .heic files and drop them on this page, leave JPG chosen at quality 92, and press Convert. Each photo comes back with its own name and a .jpg ending, and Download all as zip gives you one file. The location is left out unless you tick Keep EXIF metadata first.',
        ],
      },
    ],
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
        q: 'Can I convert HEIC to JPG without uploading my photos?',
        a: 'Yes. The HEIC decoder (libheif compiled to WebAssembly) runs inside your browser tab. Your photos are read from your disk, converted in memory and saved back to your disk. Give the page a short while after your first visit to save itself and the decoder for offline use; after that you can turn off your network and it still works.',
      },
      {
        q: 'Is there a file size or quantity limit?',
        a: 'There is no file size cap from us, and no quota because the conversion happens on your device, not on a server. Very large batches depend on your device’s memory.',
      },
      {
        q: 'Can I convert many HEIC photos at once?',
        a: 'Yes. Drop them all together and download the results as one zip. Very large batches depend on your device’s memory.',
      },
      {
        q: 'Does converting lose quality?',
        a: 'JPG is a lossy format, so a small amount of detail is lost. At the default quality of 92 the difference is invisible for photos. Pick PNG if you need a lossless copy, at the cost of much larger files.',
      },
      {
        q: 'Does it keep the photo date, location and camera info?',
        a: 'Not by default. Browsers strip EXIF metadata when they re-encode an image, which also removes GPS location. If you want to keep metadata, tick "Keep EXIF metadata" and the original EXIF block is copied into the JPG. To remove location data from a photo that is already a JPG, use the Remove EXIF data tool.',
      },
      {
        q: 'What is the difference between HEIC and HEIF?',
        a: 'HEIF is the container standard and HEIC is the version iPhones use, with images compressed by the HEVC codec. In practice the two extensions mean the same kind of photo, and this page opens both .heic and .heif files.',
      },
      {
        q: 'Can I convert HEIC to JPG without losing the location?',
        a: 'Yes. Tick "Keep EXIF metadata" and the date, camera info and GPS location are copied into the JPG. Leave it unticked to drop them, or use the Remove EXIF data tool on a photo you already have.',
      },
      {
        q: 'How do I open a HEIC file on Windows?',
        a: 'Install Microsoft’s HEIF image extension from the Microsoft Store, or convert the photo to JPG on this page and open that. Nothing is uploaded either way. The Windows guide linked above has the steps.',
      },
      {
        q: 'Is this an online converter, and do my photos get uploaded?',
        a: 'It is online in the sense that it is a web page you open in your browser, but the conversion happens on your device. Your photos are read from your disk, converted in memory and saved back to your disk, so nothing is uploaded. After one visit and a short wait the page also works offline.',
      },
      NOACCOUNT,
    ],
  },
  {
    slug: 'convert-image',
    icon: 'convert',
    name: 'Image Converter',
    title: 'Image Converter: JPG, PNG, WebP, PDF, ICO, No Upload | Stayput',
    description:
      'Drop any image and Stayput detects its real format. Convert to JPG, PNG, WebP, PDF, ICO, GIF, BMP or TIFF without uploading. Free, batches, works offline after one visit and a short wait.',
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
        a: 'Anything your browser can display: JPG, PNG, WebP, GIF (first frame), BMP, SVG and AVIF. HEIC and HEIF photos are decoded with a WebAssembly build of libheif (for a dedicated page, see the [HEIC to JPG converter](/tools/heic-to-jpg)), and JPEG XL (and AVIF in older browsers) with the Squoosh decoders compiled to WebAssembly, so they work everywhere. To cut the background out of a photo, use the [background remover](/tools/remove-background).',
      },
      {
        q: 'Which formats can I convert to?',
        a: 'JPG, PNG, WebP, PDF (one page per image), ICO (a favicon or Windows icon with every size from 16 to 256 pixels), GIF (a still image, 256 colours), BMP and TIFF. Formats that cannot hold transparency fill it with the background colour you pick.',
      },
      {
        q: 'Just need JPG or PNG?',
        a: 'Use [Convert any image to JPG](/image-to-jpg) or [Convert any image to PNG](/image-to-png). They run this same converter with the output already chosen and explain what each format does to quality and transparency.',
      },
      {
        q: 'Is JPEG the same as JPG?',
        a: 'Yes, they are one format with two spellings. Renaming a .jpeg file to .jpg changes nothing inside it; converting here saves a re-encoded copy. [JPEG to JPG](/jpeg-to-jpg) has the details.',
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
        a: 'No. Decoding and encoding happen in this browser tab. After one visit and a short wait this page works with your network switched off.',
      },
    ],
  },
  {
    slug: 'compress-image',
    icon: 'resize',
    name: 'Compress & Resize Images',
    title: 'Compress and Resize Images Online Without Uploading | Stayput',
    description:
      'Shrink JPG, PNG and WebP images for email, forms or the web. Fit a file size like 100 KB, resize to exact pixels or a maximum, batch process. Nothing leaves your browser.',
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
      'Set a maximum width and height, an exact size or a percentage; then pick a quality, or a file size to stay under.',
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
        a: 'With Limit dimensions and Percentage, yes: the image is scaled so neither side exceeds the limits and the proportions never change. Exact size gives precisely the width and height you type; when the shape differs you choose to crop the centre, add bars, or stretch.',
      },
      {
        q: 'Can it make an image smaller than a set file size, like 50 KB?',
        a: 'Yes. Choose Fit a file size and type the limit in KB or MB. Each image gets the highest quality that stays under it; if even the lowest quality is too big, the picture is scaled down until it fits. Sizes count 1 KB as 1000 bytes, so the result is under the limit whichever way a form counts.',
      },
      {
        q: 'Is metadata kept?',
        a: 'No. Re-encoding drops EXIF data, including GPS location, which is usually what you want before sharing. If you only want to remove metadata without changing pixels, use the EXIF remover instead; it copies the image data unchanged, except a sideways JPG when its "Apply orientation" option is ticked.',
      },
    ],
  },
  {
    slug: 'compress-gif',
    icon: 'compress',
    name: 'Compress GIF',
    title: 'GIF Compressor for Discord and Slack | Stayput',
    description:
      'Compress animated GIFs for Discord, Slack or email in your browser: keep only what changes between frames, use fewer colours, resize or drop frames. No upload.',
    heading: 'Compress a GIF for Discord, Slack or email',
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
        a: 'No. The GIF is decoded and written again by code running in this page. There is no server in the process, no daily limit, and the size limit is your device’s memory (phones hold less). The page keeps working offline after one visit and a short wait.',
      },
      {
        q: 'How does it make GIFs smaller?',
        a: 'Most GIFs store every frame whole, even when only a small part of the picture moves. Each frame is rewritten to hold just the area that changed, with the unchanged pixels left see-through so the frame before shows through. Medium and Strong also ignore changes too small to notice and use fewer colours, which is where GIF compressors such as gifsicle and ezgif get most of their savings.',
      },
      {
        q: 'How do I compress a GIF for Discord or get it under a size limit?',
        a: 'Size makes the biggest difference: 50% leaves a quarter of the pixels (to set exact pixel dimensions instead, use [Resize GIF](/tools/resize-gif)). Dropping every second frame roughly halves what is left. Try Medium first, then add those until the result, shown with its size, is under your limit. Discord’s limit is 10 MB for uploads, and custom emoji must be under 256 KB.',
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
    icon: 'compress',
    name: 'Compress PNG',
    title: 'Compress PNG Images, Up to 80% Smaller, No Upload | Stayput',
    description:
      'Compress PNG files in your browser and keep transparency: up to 80% smaller with a smart colour palette, or lossless. Batch, nothing uploaded.',
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
        a: 'No. The PNG is decoded and written again by code running in this page. There is no server in the process, no daily limit, and the size limit is your device’s memory (phones hold less). The page keeps working offline after one visit and a short wait.',
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
    icon: 'eye',
    name: 'Remove EXIF Data',
    title: 'Remove EXIF and GPS Data From Photos, Private | Stayput',
    description:
      'Strip EXIF metadata, GPS location and camera info from JPG, PNG and WebP photos in your browser. Image data is copied unchanged, except sideways JPGs with Apply orientation on.',
    heading: 'Remove EXIF and location data from photos',
    tagline: 'See what a photo reveals, then delete it. The image data is copied unchanged and only the metadata is removed; a sideways JPG is re-encoded only if Apply orientation is on.',
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
        a: 'Not in the normal case. This tool edits the file structure and drops only the metadata segments, and the compressed image data is copied byte for byte, so the picture is identical to the original. The exception is a JPG stored sideways with an EXIF orientation tag while "Apply orientation" is ticked (the default): that photo is decoded, turned upright and saved again as a JPG at quality 95, and its color profile is not carried over. Untick "Apply orientation" and every file is copied unchanged. PNG and WebP files are never re-encoded.',
      },
      {
        q: 'What is kept by default?',
        a: 'The embedded color profile (ICC) is kept because removing it can shift colors. Everything else, including EXIF, XMP, IPTC, comments and thumbnails, is removed. You can choose to drop the color profile too.',
      },
      {
        q: 'What about orientation?',
        a: 'Phones often store photos sideways with an EXIF orientation tag telling viewers to rotate them. If you remove EXIF, that hint disappears. With "Apply orientation" on (the default), a sideways JPG is turned upright and saved again as a JPG at quality 95, which re-encodes it and drops its color profile. Turn it off to keep the image data unchanged; a sideways photo may then show sideways. JPGs with no rotation tag, and PNG and WebP files, are never re-encoded.',
      },
    ],
  },
  {
    slug: 'exif-viewer',
    icon: 'search',
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
        a: 'Yes. The page reads the file with JavaScript in your tab and never sends it anywhere, so you can check a photo you would not want to upload. Most online EXIF viewers upload the photo to their server first, which hands them the very location you are trying to check. Open the network tab while you drop a photo: apart from a small anonymous usage-count ping, no request carries the photo.',
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
        a: 'Use the Remove EXIF Data tool (linked under the report). It deletes EXIF, GPS, XMP and IPTC and copies the image data unchanged; only a sideways JPG is re-encoded, and only if "Apply orientation" is ticked there. Drop the cleaned copy back here to confirm nothing is left.',
      },
    ],
  },
  {
    slug: 'merge-pdf',
    icon: 'merge',
    name: 'Merge PDF',
    title: 'Merge PDF Files Online, Free, No Upload | Stayput',
    description:
      'Combine PDFs into one file in your browser: set the order with the arrows, then download merged.pdf. Nothing is uploaded, no watermark, no account.',
    heading: 'Merge PDF files',
    tagline: 'Combine PDFs into one document and set the order with the arrows. No watermark, nothing uploaded, and the size limit is your device’s memory (phones hold less).',
    lead:
      'Combines two or more PDF files into one PDF, in the top-to-bottom order you set with the arrows, and saves it as merged.pdf. It is free, needs no account and adds no watermark, and your PDFs are not uploaded: the pages are copied together in your browser, so text stays selectable and images are not recompressed. The size limit is your device’s memory (phones hold less), and after one visit and a short wait the page works offline.',
    sections: [
      {
        heading: 'A worked example: a cover letter, a CV and a certificate in one file',
        paragraphs: [
          'Say you are applying for a job and the form takes one PDF. Drop the three files; each shows its first page as a thumbnail. Press the up and down arrows until the cover letter is on top, then press Merge PDFs. You get merged.pdf with the pages of all three files one after another, and a note that says 3 files combined.',
          'A merge needs at least two files. If a file is damaged or is not a PDF, the merge stops with a message that names it, and nothing is saved until you remove it.',
        ],
      },
    ],
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: true,
    dropLabel: 'Drop PDF files here',
    action: 'Merge PDFs',
    keywords: ['merge pdf', 'combine pdf', 'join pdf', 'pdf merger', 'merge pdf no upload'],
    steps: [
      'Drop two or more PDFs onto the page.',
      'Reorder them with the arrows until they are in the right sequence.',
      'Click Merge and download the single combined PDF.',
    ],
    faq: [
      {
        q: 'Can I add text, a highlight or an image to the PDF too?',
        a: 'Yes. [Edit PDF](/tools/edit-pdf) adds text, cover boxes, highlights, drawings and images to a page and rotates, deletes or reorders pages, all in your browser. It cannot change the text already in the file.',
      },
      {
        q: 'Is there a limit on the number or size of files?',
        a: 'No. Other free tools cap you at two or three tasks an hour or a set file size because they pay for servers. This tool does the work on your device, so the limit is your device’s memory (phones hold less). Merging fifty PDFs or a few hundred megabytes is fine on a normal laptop.',
      },
      {
        q: 'Can I merge PDFs without uploading them?',
        a: 'Yes. The merge is done by pdf-lib, a JavaScript library that runs inside your browser tab, so your PDFs are read from your disk and the merged file is written back to it. Open your browser’s network tab while you merge and no request carries a PDF.',
      },
      {
        q: 'Will bookmarks, links and form fields survive?',
        a: 'Page content, images, fonts and internal links within a page are preserved. Bookmarks (outlines) and form fields are not carried across when copying pages between documents. A PDF that only restricts printing or copying is unlocked in your tab and merges normally. One that needs a password to open asks for it once. The unlocking program is downloaded from this site the first time such a file is dropped, so offline you can only merge protected PDFs once that program has been downloaded.',
      },
      {
        q: 'Can I merge only some pages of a file?',
        a: 'Use the Split PDF tool first to extract the pages you need, then merge the results.',
      },
      {
        q: 'How do I change the order of the PDFs before merging?',
        a: 'After you drop the files, use the up and down arrows beside each one. Files are combined from top to bottom. To change the order of pages inside a single file afterwards, use [Reorder PDF](/tools/reorder-pdf).',
      },
      NOACCOUNT,
    ],
  },
  {
    slug: 'split-pdf',
    icon: 'split',
    name: 'Split PDF',
    title: 'Split PDF or Extract Pages Online, Private | Stayput',
    description:
      'Split a PDF into separate pages, extract a page range, or break it into chunks. Runs in your browser, no upload.',
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
        a: 'No. Splitting happens in your browser with pdf-lib. Your files are not uploaded.',
      },
    ],
  },
  {
    slug: 'compress-pdf',
    icon: 'compress',
    name: 'Compress PDF',
    title: 'Compress PDF Online: Free, No Upload, Set a Size | Stayput',
    description:
      'Compress a PDF in your browser, or fit it under a limit like 1 MB or 200 KB. Four modes, from lossless cleanup to a target size. No upload, no watermark.',
    heading: 'Compress a PDF',
    tagline: 'Shrink a PDF for email or an upload limit. Pick a level, or type the size you need, like 1 MB, and the page tries the gentlest setting that fits. Processed on your device.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: true,
    dropLabel: 'Drop PDF files here',
    action: 'Compress PDF',
    lead:
      'Makes a PDF smaller in four ways: a lossless cleanup, image recompression that keeps text selectable, flattening pages to pictures, or fitting it under a size you type, such as 1 MB or 200 KB. It is free, needs no account and adds no watermark, and your PDFs are not uploaded: everything runs in your browser on your device. The size limit is your device’s memory (phones hold less), and after one visit and a short wait the page works offline; a password-protected PDF needs its unlock engine downloaded once first.',
    sections: [
      {
        heading: 'Compress to a set size: 100 KB, 200 KB, 500 KB, 1 MB, 2 MB',
        paragraphs: [
          'Upload forms often name a maximum size. These pages open this tool already set to that size:',
        ],
        bullets: [
          '[Compress a PDF to 100 KB](/compress-pdf-to-100kb)',
          '[Compress a PDF to 200 KB](/compress-pdf-to-200kb)',
          '[Compress a PDF to 500 KB](/compress-pdf-to-500kb)',
          '[Compress a PDF to 1 MB](/compress-pdf-to-1mb)',
          '[Compress a PDF to 2 MB](/compress-pdf-to-2mb)',
        ],
      },
      {
        heading: 'Still too big, or worried about quality?',
        paragraphs: [
          'If one file stays over the limit, [split the PDF](/tools/split-pdf) and send it in parts. To see what each level does to the pages, read [how to compress a PDF without losing quality](/guides/compress-pdf-without-losing-quality).',
        ],
      },
      {
        heading: 'A worked example: a scan that must be under 2 MB',
        paragraphs: [
          'Say a portal rejects your 14 MB scanned application and accepts files up to 2 MB. Drop the PDF, choose Fit a file size, type 2 and leave the unit on MB, then press Compress PDF. The page tries a lossless rewrite first, then image compression at falling quality, and flattens the pages to pictures only if nothing gentler fits. The result line says which step worked, for example under 2 MB: images at quality 75. If none fits, it says how small it got and suggests splitting the file.',
        ],
      },
    ],
    keywords: ['compress pdf', 'reduce pdf size', 'shrink pdf', 'pdf compressor', 'make pdf smaller'],
    steps: [
      'Drop one or more PDFs.',
      'Pick a level, or choose "Fit a file size" and type the limit. "Recompress images" is the default and keeps text selectable.',
      'Compare the before and after sizes and download.',
    ],
    faq: [
      {
        q: 'How does each level work?',
        a: '"Lossless cleanup" rewrites the file with compressed object streams; text and images stay identical, so a file that is already compact barely changes. "Recompress images" additionally re-encodes embedded photos at a lower JPG quality and caps their resolution, which is where most of the savings come from in scanned or photo-heavy PDFs. "Flatten pages" renders each page to an image at the resolution you choose. It gives the smallest files for scans but text is no longer selectable.',
      },
      {
        q: 'Can it get a PDF under a set size, like 1 MB, without uploading it?',
        a: 'Yes, and the PDF is not uploaded: it runs in your browser. Choose "Fit a file size" and type the limit in KB or MB. The page tries the gentlest settings first (a lossless rewrite, then lighter image compression that keeps text selectable) and flattens pages to pictures only when nothing else fits. The result says which step it took. 1 MB counts as 1,000,000 bytes, so the file passes however a form counts.',
      },
      {
        q: 'Why did my PDF barely shrink?',
        a: 'PDFs made from text (Word exports, invoices) are already small and consist mostly of fonts and vector data that cannot be compressed further without losing content. Compression helps most on files with large photos or scans. At the lossless and image levels you never get back a larger file than you dropped: the original is kept instead, and the result says so.',
      },
      {
        q: 'How do I compress a scanned PDF?',
        a: 'Use "Recompress images" first: a scan is one large picture per page, so lowering the picture quality is where the savings are, and the file stays a normal PDF. The result says how many images were recompressed; if it says none, use "Flatten pages". If it is still too big, choose "Flatten pages" and lower the resolution, or choose "Fit a file size" and let the page step down for you. Flattening gives the smallest scans, but text is no longer selectable.',
      },
      {
        q: 'Can I compress a PDF on my phone?',
        a: 'Try it. Open this page in your phone\'s browser and drop the PDF in. The work happens in the page, so a long or image-heavy file can be slow on a phone; if it stalls, try a smaller file or split it first.',
      },
      {
        q: 'Will compressing change my text, links or forms?',
        a: '"Lossless cleanup" and "Recompress images" keep the text selectable, and in our test a link and a filled-in form field survived both; only the embedded photos change at the image level. "Flatten pages" turns each page into a picture, so text is no longer selectable and links and form fields are gone. "Fit a file size" flattens only when nothing gentler fits, and the result says which step it took.',
      },
      {
        q: 'Is the PDF uploaded to a server?',
        a: 'No. Everything runs in your browser using pdf-lib and pdf.js. That is why there is no upload and no queue.',
      },
      NOACCOUNT,
    ],
  },
  {
    slug: 'rotate-pdf',
    icon: 'rotate',
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
        q: 'Can I add text, a highlight or an image to the PDF too?',
        a: 'Yes. [Edit PDF](/tools/edit-pdf) adds text, cover boxes, highlights, drawings and images to a page and rotates, deletes or reorders pages, all in your browser. It cannot change the text already in the file.',
      },
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
    lead:
      'Removes the open password and the print, copy and edit restrictions from a PDF and saves a copy that opens freely; if the PDF asks for a password to open, you need to know it, because this cannot crack passwords. It is free, and your PDF and its password are not uploaded: the PDF is unlocked in your browser. The size limit is your device’s memory (phones hold less), and after your first run on a protected PDF the page works offline.',
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
        a: 'No. The PDF is decrypted inside your browser tab by qpdf compiled to WebAssembly. The password is used in the tab and never leaves it. The unlocking program is downloaded from this site the first time you unlock a protected PDF; after that first run the page works with the network off.',
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
    icon: 'pdf',
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
      {
        q: 'My photos are of paper documents. Can they look scanned?',
        a: 'Use Document scanner instead: it cuts each page out of the photo, straightens it and turns the paper white before making the PDF.',
      },
      {
        q: 'Can I make a video of the pictures instead?',
        a: 'Yes. The [Photo slideshow maker](/tools/photo-slideshow-maker) puts them in an MP4, one after another, with an optional song.',
      },
    ],
  },
  {
    slug: 'pdf-to-image',
    icon: 'image',
    name: 'PDF to Image',
    title: 'Convert PDF to JPG or PNG Online, Private | Stayput',
    description:
      'Turn PDF pages into high-resolution JPG or PNG images in your browser. Pick the pages and DPI. No upload, free.',
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
    icon: 'grid',
    name: 'Reorder & Delete Pages',
    title: 'Reorder, Rearrange and Delete PDF Pages Online, Private | Stayput',
    description:
      'Drag PDF pages into a new order, delete the ones you do not need, and save. Runs in your browser: no upload, free.',
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
        q: 'Can I add text, a highlight or an image to the PDF too?',
        a: 'Yes. [Edit PDF](/tools/edit-pdf) adds text, cover boxes, highlights, drawings and images to a page and rotates, deletes or reorders pages, all in your browser. It cannot change the text already in the file.',
      },
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
        a: 'No. Thumbnails are rendered with pdf.js and the new file is written with pdf-lib, both running in your browser. After one visit and a short wait, switch off your network and it still works.',
      },
    ],
  },
  {
    slug: 'edit-pdf',
    icon: 'text',
    name: 'Edit PDF',
    title: 'Edit PDF Online Free: Add Text, Cover, Draw | Stayput',
    description:
      "Add text, white-out, highlight, draw or add an image on a PDF, then rotate, delete or reorder pages. Free, no upload, no watermark. Existing text can't be changed.",
    heading: 'Edit a PDF',
    tagline: 'Mark up and rearrange a PDF in your browser. Add text, cover a spot, highlight, draw or drop in an image; rotate, delete or reorder pages. Your file never leaves this device.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: false,
    dropLabel: 'Drop a PDF to edit',
    action: 'Download edited PDF',
    keywords: ['edit pdf', 'edit pdf online free', 'pdf editor free', 'edit pdf no upload', 'add text to pdf', 'edit pdf without acrobat', 'how to edit a pdf'],
    steps: [
      'Drop the PDF.',
      'Pick Text, Cover, Highlight, Draw or Image and click the page.',
      'Rotate, delete or reorder pages if you need to, then download the edited PDF.',
    ],
    sections: [
      {
        heading: 'What this can and can’t do',
        paragraphs: [
          'This is an annotate-and-arrange editor: it puts new things on top of a page and changes which pages are in the file. It does not open up the text that is already there.',
        ],
        bullets: [
          '**Can:** add new text in Helvetica, Times or Courier, cover a spot with a box, highlight, draw by hand, add an image, and rotate, delete or reorder pages.',
          '**Can’t:** change, replace or reflow text that is already in the PDF, or edit the words on a scanned page. To make scanned text selectable first, use [OCR PDF](/tools/ocr-pdf); to start from an editable copy, [PDF to Word](/tools/pdf-to-word) gives a starting point.',
          '**Can’t:** remove what a cover box hides. The text underneath is still in the file; [Redact PDF](/tools/redact-pdf) removes it for good.',
        ],
      },
      {
        heading: 'Which tool for which job',
        bullets: [
          '[Sign PDF](/tools/sign-pdf): draw, type or place a signature, initials or a date.',
          '[Fill PDF form](/tools/fill-pdf-form): type into a form’s own fields.',
          '[Redact PDF](/tools/redact-pdf): remove sensitive text for good.',
          '[Watermark PDF](/tools/watermark-pdf): the same mark on every page.',
          '[PDF page numbers](/tools/pdf-page-numbers): number every page.',
          '[Reorder PDF](/tools/reorder-pdf), [Rotate PDF](/tools/rotate-pdf) and [Delete PDF pages](/delete-pdf-pages): page changes only.',
          '[Merge PDF](/tools/merge-pdf), [Split PDF](/tools/split-pdf), [Crop PDF](/tools/crop-pdf) and [Compress PDF](/tools/compress-pdf): the file as a whole.',
          '[Protect PDF](/tools/protect-pdf) and [Unlock PDF](/tools/unlock-pdf): passwords.',
        ],
      },
    ],
    faq: [
      {
        q: 'Can I edit the existing text in a PDF here?',
        a: 'No. You can add new text, cover old text and draw, but the words already in the file stay as they are. Covering is not removal: use [Redact PDF](/tools/redact-pdf) to take text out. To change the wording of a document, start from the source file; for a Word source, [PDF to Word](/tools/pdf-to-word) gives a starting point.',
      },
      {
        q: 'Is it really free? Is there a watermark or sign-up?',
        a: 'There is no account, no watermark and no page limit. The only limit is your device’s memory, and phones hold less than computers.',
      },
      {
        q: 'Is my PDF uploaded?',
        a: 'No. pdf.js shows the pages and pdf-lib writes your changes, both inside this tab. Open your browser’s Network tab while you edit and you will see no file leave the page.',
      },
      {
        q: 'Can I edit a scanned PDF?',
        a: 'You can add text and cover boxes on top of a scan. To make the scanned text selectable, run [OCR PDF](/tools/ocr-pdf) first.',
      },
      {
        q: 'Does covering text hide it?',
        a: 'Visually, yes. The text is still in the file and can be copied out. Use [Redact PDF](/tools/redact-pdf) when it has to be gone.',
      },
      {
        q: 'How do I fill in a form or sign?',
        a: 'Use [Fill PDF form](/tools/fill-pdf-form) for a form’s own fields and [Sign PDF](/tools/sign-pdf) for a signature.',
      },
      {
        q: 'Can I edit a PDF on an iPhone, a Mac or in Chrome?',
        a: 'Yes, in the browser: there is no app to install, and drawing works with a finger. Safari on iPhone and Mac, Chrome and Firefox are all fine.',
      },
      {
        q: 'Which page edits are supported?',
        a: 'Rotate a page a quarter turn at a time, delete pages and drag them into a new order. To join files or cut one apart, use [Merge PDF](/tools/merge-pdf) or [Split PDF](/tools/split-pdf).',
      },
    ],
  },
  {
    slug: 'sign-pdf',
    icon: 'pen',
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
        q: 'Can I add text, a highlight or an image to the PDF too?',
        a: 'Yes. [Edit PDF](/tools/edit-pdf) adds text, cover boxes, highlights, drawings and images to a page and rotates, deletes or reorders pages, all in your browser. It cannot change the text already in the file.',
      },
      {
        q: 'Is this a legally binding signature?',
        a: 'It adds an image of your signature to the document, the same as printing, signing and scanning. Whether a signature like this is accepted depends on who asked you to sign and the rules where you are, so check with them. It is not a cryptographic digital certificate; if a counterparty requires one, they will usually say so.',
      },
      {
        q: 'Is my document or signature stored anywhere?',
        a: 'No. The PDF, your signature drawing and the signed result exist only in this browser tab. Your files are not uploaded, and nothing is kept once you close or reload the page.',
      },
      {
        q: 'Can I use a signature image I already have?',
        a: 'Yes. Choose Image next to Draw and Type, then pick a PNG, JPG or WebP file of your signature, or make one first in the [signature maker](/tools/signature-maker) and press Use in Sign PDF. A picture with a plain paper background has the paper taken out before it is placed.',
      },
      {
        q: 'Can I sign several pages?',
        a: 'Yes. Place the signature on every page that needs it. Each placement can be moved and resized on its own. You can also add your initials or the date the same way.',
      },
      {
        q: 'Can I sign on a phone?',
        a: 'Yes. Draw with your finger in the signature box. It works in Safari on iPhone and in Chrome on Android, and works offline after one visit and a short wait.',
      },
      {
        q: 'What if the PDF is a form or is password protected?',
        a: 'Forms work: the signature is drawn on top of the page. A PDF that needs a password to open asks for it once, in your browser; the tool will tell you if it cannot open the file.',
      },
    ],
  },
  {
    slug: 'pdf-page-numbers',
    icon: 'hash',
    name: 'Add Page Numbers',
    title: 'Add Page Numbers to a PDF Online, Free and Private | Stayput',
    description:
      'Stamp page numbers on every page of a PDF. Choose the position, format such as "Page 1 of 10", font and starting number. No upload, works offline after one visit and a short wait.',
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
        q: 'Can I add text, a highlight or an image to the PDF too?',
        a: 'Yes. [Edit PDF](/tools/edit-pdf) adds text, cover boxes, highlights, drawings and images to a page and rotates, deletes or reorders pages, all in your browser. It cannot change the text already in the file.',
      },
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
    icon: 'convert',
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
        q: 'Can I convert an image or a scan to Word?',
        a: 'Yes, with [Image to Word](/tools/image-to-word): it reads the text in JPG, PNG or WebP images with OCR and saves one .docx. For a scanned PDF, run it through OCR PDF first.',
      },
      {
        q: 'Does the Word file look like the PDF?',
        a: 'It keeps the text, the paragraph breaks and the headings, in reading order, as normal editable Word paragraphs. It does not reproduce the page layout: columns, tables, images, fonts and exact positions are not carried over. That is the honest limit of what runs in a browser, and it is what you need when the goal is to edit or reuse the words.',
      },
      {
        q: 'Why is my output empty or garbled?',
        a: 'A scanned PDF has no text layer: each page is a picture of text, so there is nothing to extract without OCR. The tool tells you when that is the case; run the file through OCR PDF first, then convert the searchable copy. Garbled text usually means the PDF embeds fonts with a custom encoding; nothing browser-side can fix that without OCR.',
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
        a: 'No. pdf.js reads the text inside your browser and the Word file is assembled in memory in your tab. After one visit and a short wait you can convert with the network switched off.',
      },
    ],
  },
  {
    slug: 'crop-image',
    icon: 'crop',
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
        q: 'Can I crop an animated GIF?',
        a: 'This page crops one picture. For an animated GIF, use [Crop GIF](/tools/crop-gif), which crops every frame to the same box and keeps the timing.',
      },
      {
        q: 'Is the photo uploaded?',
        a: 'No. The image is decoded and cropped on a canvas inside your browser tab. After one visit and a short wait you can switch off Wi-Fi and crop as many photos as you like.',
      },
    ],
  },
  {
    slug: 'blur-image',
    icon: 'blur',
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
        a: 'No. The photo is decoded and edited on a canvas inside your browser tab, and the new file is written there too. That matters most for exactly the photos people blur: children, other people’s faces, ID cards, bank screenshots. After your first run you can turn off Wi-Fi and it still works.',
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
    icon: 'rotate',
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
        a: 'No. Each image is decoded and redrawn on a canvas inside your browser tab, then saved from there. After your first visit and a short wait you can turn off Wi-Fi and it still works.',
      },
    ],
  },
  {
    slug: 'color-picker',
    icon: 'color',
    name: 'Color picker from image',
    title: 'Color Picker from Image: HEX, RGB, Palette, No Upload | Stayput',
    description:
      'Pick any colour from an image and copy its HEX, RGB or HSL code, with a magnifier for exact pixels. Get the image’s main colours as a palette. Free, no upload.',
    heading: 'Free color picker from an image',
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
    icon: 'text',
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
        q: 'Can I get a Word document?',
        a: 'Yes. [Image to Word](/tools/image-to-word) reads the images the same way and saves the text as one .docx, one page per image. Only the text comes across, not the layout.',
      },
      {
        q: 'Is my image uploaded?',
        a: 'No. The text is recognised by Tesseract, the open-source OCR engine, compiled to WebAssembly and running inside this page. The engine and its English model (about 6 MB) are downloaded from this site the first time you use it, and after that first use the tool works offline. Switch off Wi-Fi after the first run and it still reads images.',
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
        a: 'Use OCR PDF for that: it reads every page of the scan, gives you the text, and makes the PDF itself searchable. If the PDF already has selectable text, PDF to Word gets it out faster and keeps the paragraphs.',
      },
      {
        q: 'Why is the first run slower?',
        a: 'The first time, your browser downloads the OCR engine and model from this site. They are cached, so after the first run it starts straight away, even offline. Reading a full page takes a few seconds on a laptop and a little longer on a phone.',
      },
    ],
  },
  {
    slug: 'image-to-word',
    icon: 'convert',
    name: 'Image to Word',
    title: 'Image to Word Converter (JPG, PNG to DOCX) | Stayput',
    description:
      'Turn JPG, PNG or WebP images into an editable Word document (.docx) in your browser. OCR reads the text, one page per image. Nothing is uploaded.',
    heading: 'Convert image to Word',
    tagline: 'Read the text in photos, screenshots or scans and save it as one Word document, one page per image. Only the text comes across, not the layout. Nothing is uploaded.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop images to turn into a Word document',
    action: 'Convert to Word',
    keywords: ['image to word', 'jpg to word', 'png to word', 'picture to word', 'photo to word', 'image to docx', 'convert image to word document', 'scan to word'],
    steps: [
      'Drop one or more images (JPG, PNG, WebP, HEIC, screenshots or scans), or tap to pick them. They are used in the order shown.',
      'Keep line breaks as they are in the image, or join them into paragraphs.',
      'Convert to Word. The recognised text of each image is previewed and one .docx downloads, with each image starting on a new page.',
    ],
    faq: [
      {
        q: 'Does the Word file look like my image?',
        a: 'No. Only the text comes across. Layout, columns, tables, fonts, colours and pictures are not kept: the document holds the recognised words as plain editable paragraphs, one page per image. That is what you want when the goal is to edit or reuse the words. If you need the picture itself in a document, Image to PDF keeps the page exactly as it looks.',
      },
      {
        q: 'Is my image uploaded?',
        a: 'No. The text is recognised by Tesseract, the open-source OCR engine, compiled to WebAssembly and running inside this page, and the .docx is built in the same tab. The engine and its English model (about 6 MB) are downloaded from this site on your first run, and after your first run the tool works offline.',
      },
      {
        q: 'Which languages does it read?',
        a: 'English, including accented Latin letters in names and places. It is the same reader as Image to text, so it gains languages when that does.',
      },
      {
        q: 'How accurate is it?',
        a: 'Very good on printed text that is sharp and straight: screenshots, documents and scans. It struggles with handwriting, curved or angled text and heavy shadows. Read the preview before you rely on numbers or names, and correct them in Word.',
      },
      {
        q: 'Can I convert several images into one document?',
        a: 'Yes. Drop them all and you get one .docx with the text of each image in the order they are listed, each starting on a new page. If you only want plain text, use Image to text; for a PDF with selectable text, use OCR PDF.',
      },
    ],
  },
  {
    slug: 'video-to-mp3',
    icon: 'audio',
    name: 'Video to MP3',
    title: 'MP3 Converter: Any Video or Audio to MP3, No Upload | Stayput',
    description:
      'Free MP3 converter in your browser: turn MP4, MOV, WebM, M4A, WAV, FLAC or other audio and video into MP3. Pick 96 to 320 kbps. Nothing is uploaded; no sign-up.',
    heading: 'MP3 converter: turn any video or audio file into MP3',
    tagline: 'Pull the sound out of a video, or turn any audio file into an MP3. Your files are converted on this device and never uploaded.',
    taglineMd: 'Pull the sound out of a video, or turn any audio file into an MP3. Your files are converted on this device and never uploaded. Have an MP4? Use [MP4 to MP3](/mp4-to-mp3). To keep the sound of any video as MP3 or WAV, see [Extract audio from video](/extract-audio-from-video).',
    sizeFact: 'No sign-up, no watermark. The limit is your device’s memory (phones hold less).',
    lead:
      'Converts video or audio files (MP4, MOV, MKV, WebM, M4A, WAV, FLAC, OGG, AAC and more) to MP3 at 96 to 320 kbps, one file or a batch. The conversion runs in this tab with LAME compiled to WebAssembly, so your files are not uploaded. It is free, needs no account and adds no watermark. The limit is your device’s memory, and phones hold less.',
    sections: [
      {
        heading: 'Convert any file into MP3',
        bullets: [
          'Drop one or more video or audio files on the page, or tap to pick them.',
          'Keep MP3 and choose a quality, or leave it at 192 kbps. Choose mono for a voice recording.',
          'Press Convert. One file downloads straight away; several download as a zip.',
        ],
      },
      {
        heading: 'Which MP3 quality?',
        bullets: [
          '96 kbps: speech, lectures and voice memos, smallest files.',
          '128 kbps: podcasts and a small file that still sounds fine.',
          '192 kbps: the default, good for most music.',
          '320 kbps: the best MP3 quality, for a recording you will keep only as an MP3.',
          'Mono halves the size of a voice recording.',
        ],
      },
      {
        heading: 'Convert by file type',
        paragraphs: [
          'For one kind of file, a dedicated page opens with the settings already chosen: [MP4 to MP3](/mp4-to-mp3), [MOV to MP3](/mov-to-mp3), [WAV to MP3](/wav-to-mp3), [M4A to MP3](/m4a-to-mp3), [FLAC to MP3](/flac-to-mp3), [AAC to MP3](/aac-to-mp3), [OGG to MP3](/ogg-to-mp3), [WebM to MP3](/webm-to-mp3), [MKV to MP3](/mkv-to-mp3), [Opus to MP3](/opus-to-mp3) and [AIFF to MP3](/aiff-to-mp3). To keep the sound of a video as MP3 or WAV, see [Extract audio from video](/extract-audio-from-video). For other formats such as FLAC or M4A, use the [audio converter](/tools/audio-converter).',
        ],
      },
    ],
    category: 'media',
    accept: 'video/*,audio/*,.mp4,.m4v,.mov,.webm,.mkv,.3gp,.m4a,.aac,.mp3,.wav,.ogg,.oga,.opus,.flac,.caf',
    multiple: true,
    dropLabel: 'Drop videos or audio files to convert',
    action: 'Convert',
    keywords: ['video to mp3', 'mp3 converter', 'convert video to mp3', 'm4a to mp3', 'mov to mp3', 'wav to mp3'],
    steps: [
      'Drop one or more videos or audio files (MP4, MOV, WebM, M4A, WAV, FLAC and more), or tap to pick them.',
      'Choose MP3 or WAV. For MP3 pick a quality: 192 kbps suits music, 96 kbps is plenty for speech. Choose mono to halve the size of a voice recording.',
      'Convert. Each file is decoded and encoded in your browser; one downloads straight away, several download as a zip.',
    ],
    faq: [
      {
        q: 'Is this MP3 converter free?',
        a: 'Yes. Whether you look for an MP3 converter or an mp 3 converter, this one is free, needs no account and adds no watermark. There is no daily limit or paywall, because the conversion runs on your device; the only limit is its memory.',
      },
      {
        q: 'Is my video uploaded?',
        a: 'No. Your browser reads the sound track with its own decoders, and an MP3 encoder (LAME, compiled to WebAssembly) runs inside the page to write the file. There is no server in the process, so there is no upload to wait for. After your first run you can switch off Wi-Fi and it still works.',
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
        q: 'Can I convert several files at once?',
        a: 'Yes. Drop them together and they are converted one after another; one file downloads straight away, several download as one zip.',
      },
      {
        q: 'What can I convert to MP3?',
        a: 'Video such as MP4, MOV, MKV and WebM, and audio such as M4A, WAV, FLAC, OGG, AAC and Opus. The page uses your browser’s own decoders, so a file has to be one your browser can play.',
      },
      {
        q: 'Is there a length or size limit?',
        a: 'There is no file size cap from us; very large files depend on your device’s memory. The whole file is read into your device’s memory, so a feature-length film works on a laptop but may be too much for an older phone. The MP3 of an hour of audio at 192 kbps is about 85 MB.',
      },
      {
        q: 'Can I get a WAV instead?',
        a: 'Yes. Choose WAV and you get uncompressed 16-bit, 44.1 kHz audio, the format audio editors and some upload forms ask for. It is about seven times the size of an MP3 at the default 192 kbps.',
      },
      {
        q: 'Do I need the audio if I only want the words?',
        a: 'No. To get the speech as text, drop the video straight on [Video to text](/video-to-text): it reads the soundtrack itself, so you do not have to extract the audio first.',
      },
    ],
  },
  {
    slug: 'video-to-gif',
    icon: 'video',
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
    sizeFact: 'No watermark. Up to 600 frames; the limit is your device’s memory (phones hold less).',
    keywords: ['video to gif', 'mp4 to gif', 'mov to gif', 'webm to gif', 'convert video to gif', 'gif maker', 'make a gif from a video'],
    steps: [
      'Drop a video (MP4, MOV, WebM or MKV), or tap to pick one. It opens in a player on the page.',
      'Play or scrub to the moment you want and press "Set start" and "Set end", or type the times. Pick a width and a frame rate.',
      'Make the GIF. It is built frame by frame in your browser and downloads when it is done.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. Your browser plays the video from the file on your device, Stayput copies the frames you asked for onto a canvas, and a small GIF encoder in the page writes the file. There is no server in the process; after your first visit and a short wait you can turn off Wi-Fi and it still works.',
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
        a: 'No watermark and no upload limit. The video itself is limited by your device’s memory (phones hold less): a long 4K video works, because only the frames you pick are decoded, but the GIF itself is capped at 600 frames.',
      },
      {
        q: 'Can I make a video from photos instead?',
        a: 'The [Photo slideshow maker](/tools/photo-slideshow-maker) turns still photos into an MP4, with a song if you like. The [GIF maker](/tools/gif-maker) makes a GIF from photos.',
      },
    ],
  },
  {
    slug: 'gif-to-mp4',
    icon: 'film',
    lead:
      'Converts animated GIFs to MP4 video (H.264 in Chrome, Edge and Safari, with no sound track since GIFs have none), often five to twenty times smaller, with each frame keeping its timing. It is free, and your GIFs are not uploaded: each frame is encoded by your browser’s own video encoder. The size limit is your device’s memory (phones hold less), and after one visit and a short wait the page works offline.',
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
        a: 'No. The GIF is decoded by code in this page and each frame is encoded by your browser’s own video encoder. There is no server in the process, so there is nothing to wait for, and after one visit and a short wait the page works with Wi-Fi off.',
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
    icon: 'shrink',
    name: 'Compress video',
    title: 'Video Compressor, Compress MP4 Without Uploading | Stayput',
    description:
      'Compress MP4, MOV and WebM videos in your browser: fit under 10 MB for Discord, 16 MB for WhatsApp or 25 MB for email. No upload, no watermark, no sign-up.',
    heading: 'Compress a video',
    tagline: 'Make a video a fraction of the size, or fit it under a limit like 10 MB for Discord or 25 MB for email. It is compressed on this device and never uploaded.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop videos to compress',
    action: 'Compress',
    lead:
      'Makes MP4, MOV, WebM and MKV videos smaller and saves an MP4, either at a quality level or fitted under a size you pick: 8, 10, 16, 25, 50 or 100 MB. It is free, needs no account and adds no watermark, and your videos are not uploaded: your browser’s own video encoder re-encodes them on your device. The size limit is your device’s memory (phones hold less), and after one visit and a short wait the page works offline.',
    sections: [
      {
        heading: 'A worked example: a clip for Discord',
        paragraphs: [
          'Say a phone clip is 38 MB and Discord’s free limit is 10 MB. Drop it, set Compression to Fit a file size, pick 10 MB (Discord free) and press Compress. The page works out the bitrate from the video’s length and lowers the resolution if it has to. You get clip-compressed.mp4, and the result line lists its resolution, length and video codec. If it still comes out a little over, the line says so and suggests the next size down.',
        ],
      },
    ],
    keywords: ['video compressor', 'compress video', 'compress mp4', 'reduce video size', 'video compressor for discord', 'compress video for email', 'make video smaller'],
    steps: [
      'Drop one or more videos (MP4, MOV, WebM or MKV), or tap to pick them.',
      'Choose how hard to compress, or Fit a file size and pick a limit such as 10 MB for Discord. Lower the resolution or remove the sound for even smaller files.',
      'Compress. Each video is re-encoded in your browser and saved as MP4; one downloads straight away, several download as a zip.',
    ],
    faq: [
      {
        q: 'Can I compress a video without uploading it?',
        a: 'Yes. The video is read and re-encoded by your browser’s own video encoder inside this page. There is no server in the process, so there is no upload to wait for and no copy left on someone else’s computer. After one visit and a short wait you can switch off Wi-Fi and it still works.',
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
        q: 'Which file sizes can I fit a video under?',
        a: '8, 10, 16, 25, 50 or 100 MB. 10 MB is Discord’s free limit, 16 MB is WhatsApp’s and 25 MB is the attachment limit for Gmail and Outlook. Choose Fit a file size and the resolution is lowered automatically when a long video needs it. Add a name or logo first with [Add watermark to video](/tools/add-watermark-to-video), then compress.',
      },
      {
        q: 'Which formats can I compress?',
        a: 'MP4, M4V and MOV (from phones, cameras and screen recorders), WebM and MKV, as long as your browser can decode the video inside. iPhone videos in HEVC need Safari, or Chrome or Edge on a Mac or recent Windows. The result is always an MP4, with H.264 video where your browser can write it.',
      },
      {
        q: 'Why does it take a while?',
        a: 'Every frame is decoded and encoded again, which is real work: on a recent laptop expect roughly real time or faster for 1080p, slower on a phone. Keep the tab open until it finishes. Lowering the resolution also makes it faster.',
      },
      NOACCOUNT,
    ],
  },
  {
    slug: 'video-to-mp4',
    icon: 'video',
    name: 'Video to MP4',
    title: 'Convert Video to MP4: MOV, MKV, WebM to MP4, No Upload | Stayput',
    description:
      'Convert MOV, MKV and WebM videos to MP4 in your browser. H.264 files convert in seconds with no quality loss. Batch, nothing uploaded.',
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
        a: 'No. The file is read and written by code in this page, and any re-encoding is done by your browser’s own video encoder. There is no server in the process, so there is no upload and no copy left anywhere. After one visit and a short wait the page works with Wi-Fi off.',
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
        q: 'Is there a file size limit when I convert WebM to MP4?',
        a: 'We set no limit and nothing is uploaded; the limit is your device\'s memory, so a phone handles smaller files than a computer.',
      },
      {
        q: 'Which formats can I convert?',
        a: 'MOV (iPhone, Mac screen recordings, cameras), MKV (OBS recordings, downloads), WebM (browser and screen recordings) and MP4 itself. AVI, WMV and FLV are not supported, because browsers cannot read the video inside them.',
      },
    ],
  },
  {
    slug: 'video-to-mov',
    icon: 'video',
    name: 'Video to MOV',
    title: 'Convert Video to MOV: MP4 to MOV, No Upload | Stayput',
    description:
      'Convert MP4, WebM and MKV videos to MOV in your browser. H.264 files are copied in seconds with no quality loss. Batch, free, not uploaded.',
    heading: 'Convert video to MOV',
    tagline: 'Turn MP4, WebM and MKV files into QuickTime MOV files. Converted on this device, not uploaded.',
    category: 'media',
    accept: 'video/mp4,video/webm,video/x-matroska,.mp4,.m4v,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop videos to convert to MOV',
    action: 'Convert to MOV',
    keywords: ['video to mov', 'convert video to mov', 'mkv to mov', 'webm to mov', 'mov converter'],
    steps: [
      'Drop one or more videos (MP4, WebM or MKV), or tap to pick them.',
      'Tick Remove the sound if you want a silent video. There is nothing else to set.',
      'Convert. H.264 videos are rewrapped in seconds; others are re-encoded in your browser. One downloads straight away, several download as a zip.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. The file is read and written by code in this page, and any re-encoding is done by your browser’s own video encoder. There is no server in the process. After one visit and a short wait the page works offline.',
      },
      {
        q: 'Why was my file converted so fast?',
        a: 'An MP4, WebM or MKV often holds H.264 video and AAC sound, which a MOV can hold too. Those are copied as they are, which takes about as long as reading the file, and the picture is the same. The result says "copied, no quality loss" when that happens.',
      },
      {
        q: 'Which formats can I convert?',
        a: 'MP4, WebM and MKV. Video your browser cannot decode is refused with a message instead of producing a broken file. A MOV only ever holds H.264 video (or HEVC copied as it is) and AAC sound, so a browser that cannot write those says so instead of writing a file QuickTime may not play.',
      },
    ],
  },
  {
    slug: 'video-to-avi',
    icon: 'video',
    name: 'Video to AVI',
    title: 'Convert Video to AVI: MP4 to AVI, No Upload | Stayput',
    description:
      'Convert MP4, MOV, WebM and MKV videos to AVI in your browser, as Motion JPEG or smaller H.264. Batch, free, not uploaded.',
    heading: 'Convert video to AVI',
    tagline: 'Turn MP4, MOV, WebM and MKV files into AVI files. Converted on this device, not uploaded.',
    category: 'media',
    accept: 'video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop videos to convert to AVI',
    action: 'Convert to AVI',
    keywords: ['video to avi', 'convert video to avi', 'mov to avi', 'webm to avi', 'mkv to avi', 'avi converter'],
    steps: [
      'Drop one or more videos (MP4, MOV, WebM or MKV), or tap to pick them.',
      'Leave Maximum compatibility ticked (Motion JPEG, larger file) for the widest player support, or untick it for smaller H.264. Tick Remove the sound for a silent video.',
      'Convert. The picture is re-encoded in your browser. One AVI downloads straight away, several download as a zip.',
    ],
    faq: [
      { q: 'Is my video uploaded?', a: 'No. The file is read, re-encoded and written by code in this page, with your browser’s own video encoder. There is no server in the process. After one visit and a short wait the page works offline.' },
      { q: 'Which formats can I convert?', a: 'MP4, MOV, WebM and MKV. Video your browser cannot decode is refused with a message instead of producing a broken file. For the other direction, use [AVI to MP4](/avi-to-mp4): the two are separate jobs.' },
    ],
  },
  {
    slug: 'video-to-webm',
    icon: 'video',
    name: 'Video to WebM',
    title: 'Convert Video to WebM: MP4 to WebM, No Upload | Stayput',
    description:
      'Convert MP4, MOV and MKV videos to WebM in your browser, with VP9 or VP8 video and Opus sound. Batch, free, not uploaded, no watermark.',
    heading: 'Convert video to WebM',
    tagline: 'Turn MP4, MOV and MKV files into WebM with VP9 video and Opus sound. Converted on this device, not uploaded.',
    category: 'media',
    accept: 'video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop videos to convert to WebM',
    action: 'Convert to WebM',
    keywords: ['video to webm', 'convert video to webm', 'mp4 to webm', 'mov to webm', 'mkv to webm', 'webm converter'],
    steps: [
      'Drop one or more videos (MP4, MOV, WebM or MKV), or tap to pick them.',
      'Tick Remove the sound if you want a silent video. There is nothing else to set.',
      'Convert. Your browser re-encodes the picture to VP9 (or VP8) and the sound to Opus. One downloads straight away, several download as a zip.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. The file is read and written by code in this page, and the encoding is done by your browser’s own video encoder. There is no server in the process. After one visit and a short wait the page works offline.',
      },
      {
        q: 'Should I expect VP9 or VP8?',
        a: 'VP9 where your browser can write it, because it makes smaller files at the same quality. VP8 is the fallback for browsers that can only write that one. The line under the result says which one you got. Both play in Chrome, Edge and Firefox, and in current Safari.',
      },
      {
        q: 'Why can some browsers not write WebM?',
        a: 'WebM needs the browser to have a VP8 or VP9 video encoder and an Opus sound encoder, and each browser ships a different set. Safari only added them recently: Safari’s engine (WebKit 26.6 on a Mac) writes VP9 video and Opus sound here, but older versions, and some Linux builds of Chrome, may not. When yours is missing one, the page says so and writes no file, rather than producing something broken. Chrome or Edge on a computer write WebM.',
      },
      {
        q: 'Why did it take longer than converting to MP4?',
        a: 'An MP4 holding H.264 can often be copied into a MOV or another MP4 as it is, but H.264 cannot go into a WebM, so every frame is decoded and encoded again. Files that are already WebM (VP8, VP9 or AV1 with Opus) are copied as they are.',
      },
    ],
  },
  {
    slug: 'trim-video',
    icon: 'scissors',
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
        a: 'No. Your browser plays the video from the file on your device, and the clip is cut by code in this page. There is no server and no watermark, and the page works offline after one visit and a short wait.',
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
    slug: 'video-splitter',
    icon: 'scissors',
    name: 'Video splitter',
    title: 'Video Splitter: Cut a Video into Parts, No Upload | Stayput',
    description: 'Split a video into parts at times you type, every few seconds or into equal parts, and get them in one zip. MP4, MOV, WebM, MKV. Free, no upload.',
    heading: 'Split a video into parts',
    tagline: 'Cut one video into parts at the times you choose, every so often or into equal pieces, and save them in one zip. Done on this device, and the video is not uploaded.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: false,
    dropLabel: 'Drop a video to split',
    action: 'Split video',
    sizeFact: 'No watermark. The limit is your device’s memory (phones hold less): a long or large video may need a computer.',
    keywords: ['video splitter', 'split video', 'split video into parts', 'video splitter online', 'split mp4', 'cut video into parts', 'split video into equal parts', 'split video every 30 seconds'],
    lead: 'Lets you cut one video into parts, either at the times you type, every so many seconds or minutes, or into equal pieces, and saves the parts in one zip. It is free, needs no account and adds no watermark, and your video is not uploaded: your browser reads the MP4, MOV, WebM or MKV and cuts it inside this tab. By default the cuts copy the video without re-encoding, so they take seconds; an option makes every cut exact on the frame. The size limit is your device’s memory, and phones hold less; after one visit and a short wait the page works offline.',
    steps: [
      'Drop a video (MP4, MOV, WebM or MKV), or tap to pick one.',
      'Choose how to split: type the times where each new part should start, give a length such as every 30 seconds, or pick a number of equal parts. The page lists the parts and the total size before it starts.',
      'Press Split video. The parts are saved as name-part-01.mp4 and so on, and Download all gives you them in one zip.',
    ],
    sections: [
      {
        heading: 'A worked example',
        paragraphs: [
          'You have lecture.mp4, a 90-minute recording, and want it in three sittings. Choose Into equal parts and type 3: you get lecture-part-01 to lecture-part-03, each 30 minutes. Or choose At times I type and type 25:00, 52:30 to cut where the topics change.',
          'Every part starts where the one before it ended, so together they cover the whole video. The default cut copies the video as it is, which is why a long file splits in seconds and looks exactly like the original.',
        ],
      },
      {
        heading: 'What this page does and does not do',
        bullets: [
          'It cuts one video into parts, end to end. To keep just one stretch, [Trim video](/tools/trim-video) (also at [Cut video](/cut-video) and [Trim MP4](/trim-mp4)) is the simpler page, and [Combine videos](/combine-videos) joins parts back into one.',
          'It splits where you say. It does not find scene changes or chapters on its own.',
          'Want two videos on one screen? Use [Side by side video](/tools/side-by-side-video).',
          'It makes up to 50 parts in one run, and each part keeps the video’s own format: an MP4 gives MP4 parts, a MOV gives MOV parts, and WebM and MKV stay WebM and MKV.',
        ],
      },
    ],
    faq: [
      { q: 'How do I split a video into parts?', a: 'Drop the video, choose a way to split (times you type, every so many seconds or minutes, or a number of equal parts) and press Split video. The parts are separate files, and Download all gives you them as one zip.' },
      { q: 'Why does a part start a little early?', a: 'A video is stored as key frames with changes in between, and a cut that copies the video without re-encoding can only start on a key frame. So each part begins at the key frame just before the time you asked for, often within a second or two. The end of the part before it moves with it, so nothing is lost or repeated. Tick Exact cuts if a part must start on the frame.' },
      { q: 'Why are exact cuts slower?', a: 'To start between two key frames, the page has to decode the video and encode it again with your browser’s own video encoder, which takes about as long as playing the video through, and the result is close to the original but not identical. The default copies the packets instead, which takes seconds.' },
      { q: 'How many parts can it make?', a: 'Up to 50 in one run. If your times or length would make more, the page says so; use fewer times or a longer length, or split a part again.' },
      { q: 'How big a video can I split?', a: 'The size limit is your device’s memory, and phones hold less than computers: the parts are kept in memory until you save them, so about as much memory as the video is needed. A large video on a phone may fail; a computer will usually manage, or cut the video down first with [Trim video](/tools/trim-video).' },
      { q: 'What format are the parts?', a: 'The same as the video you dropped: an MP4 gives MP4 parts, a MOV gives MOV parts, and WebM and MKV stay WebM and MKV. They are named like holiday-part-01.mp4.' },
      { q: 'Can I split a video without uploading it?', a: 'Yes. The video is not uploaded: your browser reads the file from your device, cuts it with code running in this tab and zips the parts there. Open the network tab, run a split, and your video is not among the requests.' },
    ],
  },
  {
    slug: 'mute-video',
    icon: 'mute',
    lead:
      'Removes the sound track from a video (MP4, MOV, WebM or MKV) and saves it in the same format, copying the picture untouched so it takes seconds with no quality loss. It is free, and your video is not uploaded: it is rewritten in your browser. The size limit is your device’s memory (phones hold less), and after one visit and a short wait the page works offline.',
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
        a: 'No. The file is read and rewritten by code in this page. There is no server in the process, so there is no upload and no copy left anywhere. After one visit and a short wait the page works with Wi-Fi off.',
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
    icon: 'resize',
    name: 'Resize video',
    title: 'Resize Video to 1080p or 720p Online, No Upload | Stayput',
    description:
      'Resize a video in your browser: 4K to 1080p, 1080p to 720p, half size or any width and height. MP4, MOV, WebM in, MP4 out. No upload, no watermark.',
    heading: 'Resize a video',
    tagline: 'Change a video’s resolution, from 4K down to 240p or to a width and height you choose. Resized on this device, never uploaded.',
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
        a: 'No. Your browser decodes and re-encodes the video with its own video encoder, in this tab. There is no server in the process, so there is no upload and no watermark.',
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
    icon: 'rotate',
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
        a: 'No. Your browser decodes the video, turns each frame and encodes it again with its own video encoder, all in this tab. There is no upload and no watermark.',
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
    icon: 'crop',
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
        a: 'No. Your browser shows a frame from the file on your device, and the crop is done by its own video decoder and encoder in this tab. There is no upload and no watermark.',
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
        a: 'This crops the picture for the whole video. To keep only part of the time, use Trim video first or afterwards. To put your name or logo on the cropped result, use [Add watermark to video](/tools/add-watermark-to-video).',
      },
    ],
  },
  {
    slug: 'add-watermark-to-video',
    icon: 'stamp',
    name: 'Add watermark to video',
    title: 'Add Watermark to Video Online, Text or Logo, No Upload | Stayput',
    description:
      'Add a text or logo watermark to a video in your browser: pick the corner or centre, size and opacity. MP4, MOV, WebM in, MP4 out. No upload, no sign-up.',
    heading: 'Add a watermark to a video',
    tagline: 'Put your name, a copyright line or your logo on every frame of a video, with the sound kept. Done on this device, never uploaded.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop videos to watermark',
    action: 'Add watermark',
    keywords: ['add watermark to video', 'video watermark', 'watermark video online', 'add logo to video', 'add text to video', 'put a logo on a video', 'watermark mp4'],
    steps: [
      'Drop one or more videos (MP4, MOV, WebM or MKV), or tap to pick them. A frame from the first one shows the watermark as you set it up.',
      'Choose Text and type it, or choose Image or logo and pick a PNG. Set the position, size and opacity.',
      'Add watermark. Every frame is drawn with the mark and the video is written again as an MP4, with its sound kept.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. Your browser decodes the video, this page draws the watermark on each frame, and the browser’s own video encoder writes the MP4, all in this tab. There is no upload, so unreleased footage and client work stay on your device, and nothing is added to the result except your mark.',
      },
      {
        q: 'Can I use my logo?',
        a: 'Yes. Choose Image or logo and pick a PNG, JPG or WebP. A PNG with a transparent background looks best because only the logo itself is drawn over the picture. The logo is read on your device and is not uploaded either.',
      },
      {
        q: 'Where can the watermark go?',
        a: 'In any of the four corners or in the centre, at a size from a small credit to a large mark, and at 5 to 100 per cent opacity. The mark is static: it sits in the same place for the whole video. Animated or timed watermarks are not supported.',
      },
      {
        q: 'Does the sound stay?',
        a: 'Yes. The sound is carried over as it is, unless you tick Remove the sound. The output is always an MP4, with H.264 video where your browser can write it.',
      },
      {
        q: 'Does it lower the quality?',
        a: 'The picture has to be encoded again to carry the watermark, which is done at high quality, so the result looks very close to the original. A very short or already heavily compressed clip can come out a little larger than it went in; run it through Compress video afterwards if you need it smaller.',
      },
      {
        q: 'Can the watermark be removed?',
        a: 'It is burned into the pixels of every frame, so it cannot be switched off like a subtitle track. A determined person with editing software can still cover or paint it out, as with any watermark, so use a larger or central position for footage you are worried about.',
      },
    ],
  },
  {
    slug: 'video-speed',
    icon: 'speed',
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
        a: 'No. Your browser decodes the video, re-times every frame and encodes it again in this tab. There is no upload and no watermark.',
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
    icon: 'merge',
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
        a: 'No. Your browser decodes each clip, draws its frames one after another and encodes them into one MP4 in this tab. There is no upload and no watermark.',
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
      {
        q: 'Can I make a video from photos instead of clips?',
        a: 'Yes. The [Photo slideshow maker](/tools/photo-slideshow-maker) turns photos into an MP4 with a song; then join it with other clips here.',
      },
    ],
  },
  {
    slug: 'side-by-side-video',
    icon: 'merge',
    name: 'Side by side video',
    title: 'Put Two Videos Side by Side, Free, No Upload | Stayput',
    description: 'Put two videos side by side, or one above the other, in one MP4 in your browser. Choose the sound and the length. Free, no watermark, no upload.',
    heading: 'Put two videos side by side',
    tagline: 'Show two clips together in one frame, left and right or top and bottom. Done on this device, and nothing is uploaded.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop two videos to put side by side',
    action: 'Put side by side',
    sizeFact: 'No watermark. The limit is your device’s memory (phones hold less): two long HD clips may need a computer.',
    keywords: ['side by side video', 'put two videos side by side', 'split screen video', 'side by side video online', 'combine two videos side by side', 'two videos in one frame', 'video side by side maker', 'before and after video'],
    lead: 'Lets you put two videos next to each other in one frame, left and right or one above the other, and saves the result as one MP4. It is free, needs no account and adds no watermark, and your videos are not uploaded: your browser decodes both clips and draws them together inside this tab. You choose whose sound is kept (or both, or none) and whether the result ends with the shorter clip or holds its last frame. After one visit and a short wait the page works offline.',
    steps: [
      'Drop two videos (MP4, MOV, WebM or MKV), or pick one for slot A and one for slot B.',
      'Choose Left | Right or Top | Bottom, how the clips fit, whose sound to keep and how long the result runs. The page shows the size, the length and the memory it needs.',
      'Press Put side by side. The result is one MP4, saved as the name of video A with -side-by-side.',
    ],
    sections: [
      {
        heading: 'A worked example',
        paragraphs: [
          'You filmed the same dance twice, once yesterday (A) and once today (B), both 1280×720 and 10 seconds long. Left | Right gives a 2560×720 video, 10 seconds long, with A on the left and B on the right and A’s sound. Top | Bottom gives 1280×1440 instead, which suits a phone screen held upright.',
          'If B is only 6 seconds long, the result ends at 6 seconds by default. Choose to run to the longer clip and B holds its last frame until A has finished.',
        ],
      },
      {
        heading: 'What this page does and does not do',
        bullets: [
          'It puts two videos together in one frame. It does not do three or more videos, or picture-in-picture with one clip small on top of another.',
          'Want to cut one video into parts? Use [Video splitter](/tools/video-splitter).',
          'To join clips one after the other instead, use [Merge videos](/tools/merge-videos).',
          'The result is an MP4 at most 3,840 pixels wide, and every cell is an even number of pixels. Clips with different frame rates are brought to the faster one, up to 60 frames a second.',
        ],
      },
    ],
    faq: [
      { q: 'How do I put two videos side by side?', a: 'Drop both videos (the first is A, the second is B), choose Left | Right, and press Put side by side. You get one MP4 with the two clips next to each other, nothing uploaded. Swap A and B if they are the wrong way round.' },
      { q: 'What if the two videos have different frame rates?', a: 'They are retimed to the output rate, which is the faster of the two (up to 60 frames a second). For every frame of the result, the page takes the picture each clip shows at that moment, so a 24 fps clip and a 30 fps clip stay in step: the same second of each sits in the same frame.' },
      { q: 'What happens to the sound?', a: 'You choose: the sound of video A (the default), the sound of video B, both mixed, or none. A mix is lowered only if it would otherwise clip. A clip with no sound gives a silent result for that choice.' },
      { q: 'What if the two videos are different lengths?', a: 'By default the result ends with the shorter video. Choose to run to the longer one and the shorter video holds its last frame until the end. Sound longer than the result is cut.' },
      { q: 'Can I put three videos together, or one inside another?', a: 'No. This page puts exactly two videos in one frame, side by side or one above the other. It does not do three or more videos, picture-in-picture or other layouts.' },
      { q: 'Will it work on my phone?', a: 'It can, but a phone has less memory than a computer and two HD streams are decoded at once. The page shows the memory estimate before you start. On a phone, more than about 200 MB of video in total is likely to fail, so trim the clips shorter first or use a computer. Jobs too big for the device are refused before any encoding starts.' },
      { q: 'Are my videos uploaded?', a: 'No. Your browser reads both files from your device, decodes them with WebCodecs and encodes the result in this tab. Open the network tab, run it, and your videos are not among the requests.' },
    ],
  },
  {
    slug: 'repeat-video',
    icon: 'rotate',
    name: 'Repeat video',
    title: 'Repeat a Video N Times: Make a Clip Longer, Free | Stayput',
    description:
      'Repeat a video clip 2 to 50 times, or until it reaches a length you set, and save one longer file. MP4, MOV, WebM, MKV. Sound repeats too. No upload.',
    heading: 'Repeat a video',
    tagline: 'Save a clip repeated end to end as one longer file, by count or by length. Done on this device, never uploaded.',
    category: 'media',
    accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: false,
    dropLabel: 'Drop the video to repeat',
    action: 'Repeat video',
    keywords: ['repeat video', 'loop video', 'repeat a video', 'make a video longer', 'repeat clip', 'loop a clip', 'video repeater'],
    steps: [
      'Drop a video (MP4, MOV, WebM or MKV), or tap to pick one.',
      'Choose how many times to repeat it, or how long the result should be. The size of the file is shown before you run.',
      'Press Repeat video and save the longer file. The clip is copied as it is when it can be, so it is quick.',
    ],
    faq: [
      {
        q: 'Does this make a looping player, or a longer file?',
        a: 'A longer file. The clip is written into a new video N times, one after another, so it keeps repeating in any player, on a TV or when posted. To watch a clip on repeat without saving anything, use the loop button of your video player.',
      },
      {
        q: 'How long will a repeated clip be?',
        a: 'The clip’s length times the number of repeats: a 10-second clip repeated 60 times is 10 minutes. With a target length, the clip is repeated until it is at least that long, and the last repeat is whole.',
      },
      {
        q: 'Why is there a size limit?',
        a: 'The new file is built in your browser’s memory, and it grows with every repeat. The page estimates it from the clip’s size before it starts and refuses anything over 2 GB, or over about 200 MB on a phone, instead of crashing halfway.',
      },
      {
        q: 'Is the video re-encoded?',
        a: 'Not when it can be avoided. H.264 or HEVC video with AAC sound in an MP4 or MOV (and VP9 or AV1 in WebM or MKV) is copied packet by packet, so there is no quality loss and the time taken is about the size of the output. Other clips are decoded and encoded once into an MP4, which takes longer.',
      },
      {
        q: 'Why can I hear or see a jump where the clip repeats?',
        a: 'The end of the clip is joined to its own start. If the picture or sound does not match there (a person mid-gesture, a note cut off), the seam shows. Trim the clip so it ends where it begins first with [Trim video](/tools/trim-video).',
      },
      {
        q: 'Are my videos uploaded?',
        a: 'No. The clip is read and written in this tab. There is no upload and no watermark.',
      },
    ],
  },
  {
    slug: 'add-audio-to-video',
    icon: 'audio',
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
        a: 'No. Your browser decodes the sound, fits it to the video and writes a new file in this tab. There is no upload and no watermark.',
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
      {
        q: 'Can I put a song under photos instead of a video?',
        a: 'Yes. The [Photo slideshow maker](/tools/photo-slideshow-maker) makes a video from your photos and adds the song in one go.',
      },
    ],
  },
  {
    slug: 'reverse-video',
    icon: 'back',
    sizeFact: 'No watermark. On a phone, up to about 2 minutes of 1080p video (30 seconds of 4K)',
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
        a: 'No. Your browser decodes the video, puts its frames in the opposite order and encodes it again in this tab. There is no upload and no watermark.',
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
    icon: 'image',
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
        a: 'No. Your browser decodes only the frames you asked for and saves them as images in this tab. There is no upload and no watermark.',
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
    icon: 'scissors',
    name: 'Trim audio',
    title: 'Trim Audio Online: Cut MP3, WAV or M4A, No Upload | Stayput',
    description:
      'Cut the part you want from an MP3, WAV, M4A, OGG or FLAC file, or from a video’s sound, in your browser. See the waveform, add fades, save as MP3, WAV or M4R. No upload.',
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
      'Trim. The part you chose is saved as an MP3, a WAV or an M4R.',
    ],
    faq: [
      {
        q: 'Is my recording uploaded?',
        a: 'No. Your browser decodes the sound, cuts it and writes the new file in this tab. Voice memos and interviews stay on your device. There is no sign-up.',
      },
      {
        q: 'Which format should I save as?',
        a: 'MP3 at 192 kbps plays on every phone, car and computer and is about a tenth the size of WAV. Choose WAV to keep the sound exactly as decoded, for example to edit it further. Choose M4R for an iPhone ringtone.',
      },
      {
        q: 'Can I cut the sound out of a video?',
        a: 'Yes. Drop the video and its sound track is loaded; the part you choose is saved as audio only.',
      },
    ],
  },
  {
    slug: 'audio-converter',
    icon: 'audio',
    name: 'Audio converter',
    title: 'Audio Converter: MP3, WAV, M4A, OGG, FLAC, No Upload | Stayput',
    description:
      'Convert audio between MP3, WAV, FLAC, M4A and OGG in your browser, or pull the sound out of a video. Batch, no upload, no sign-up.',
    heading: 'Audio converter',
    tagline: 'Turn any sound file into MP3, WAV, FLAC, M4A or OGG. Your files are converted on this device and never uploaded.',
    taglineMd: 'Turn any sound file into MP3, WAV, FLAC, M4A or OGG. Your files are converted on this device and never uploaded. To MP3 only? Use the [MP3 converter](/tools/video-to-mp3).',
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
        a: 'No. Your browser decodes the sound with its own decoders, and the new file is written inside the page: MP3 by LAME compiled to WebAssembly, WAV and FLAC by small encoders in this site’s code, M4A and OGG by the browser’s built-in AAC and Opus encoders. Your files are not uploaded, so the size limit is your device’s memory (phones hold less), and the page works offline after one visit and a short wait (MP3 output needs one MP3 run first).',
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
        a: 'No. Converting can keep the quality (to WAV or FLAC) or lower it (to MP3, M4A or OGG), never raise it. An MP3 turned into a FLAC is a bigger file with the same MP3 sound. If a recording sounds thin or quiet at the source, check the microphone with the [mic test](/tools/mic-test) before you record it again.',
      },
    ],
  },
  {
    slug: 'qr-code-generator',
    icon: 'qr',
    name: 'QR code generator',
    title: 'Free QR Code Generator: Never Expires, No Sign-up | Stayput',
    description:
      'Make a QR code for a link, Wi-Fi, a contact card, an email or a phone number. Static codes that never expire, PNG or SVG, no sign-up, no tracking.',
    heading: 'Make a QR code',
    tagline: 'For a link, your Wi-Fi, a contact card, an email or a phone number. The code is made on this page and works forever.',
    category: 'images',
    accept: '.txt',
    multiple: false,
    dropLabel: 'Make a QR code',
    action: 'Download',
    keywords: ['qr code generator', 'free qr code generator', 'qr code generator free no sign up', 'wifi qr code', 'qr code for link', 'vcard qr code', 'qr code that never expires', 'static qr code'],
    steps: [
      'Choose what the code holds: a link or any text, Wi-Fi details, a contact card, an email or a phone number, and fill it in. The preview updates as you type.',
      'Optionally change the colours, the size and the error correction under "Colours, size and error correction". Keep the code dark on a light background.',
      'Download a PNG for documents and screens, or an SVG for print, which stays sharp at any size. Scan the preview with your phone to check it first.',
    ],
    faq: [
      {
        q: 'Will my QR code stop working?',
        a: 'No. The code holds your link or text itself (a "static" code), so there is nothing to expire and no account to keep paying for. Many QR generators make "dynamic" codes that point at their own short link, which stop working or show an ad page when a free trial ends.',
      },
      {
        q: 'Is my Wi-Fi password sent anywhere?',
        a: 'No. The code is built by code in this page from what you type, and what you type is never uploaded. After your first visit and a short wait you can turn off your internet connection and it still works.',
      },
      {
        q: 'Do you track who scans my code?',
        a: 'No, and we cannot: a static code sends the phone straight to your link, with nothing of ours in between. If you need scan counts, add a campaign tag such as ?utm_source=qr to your link and read it in your own analytics.',
      },
      {
        q: 'PNG or SVG?',
        a: 'PNG for documents, slides, websites and social posts. SVG for print, signage and design tools such as Figma, Illustrator, Canva or InDesign: it is made of shapes, so it stays crisp at any size.',
      },
      {
        q: 'What is error correction?',
        a: 'Extra data that lets a camera read the code when part of it is scratched, dirty or covered by a logo. Medium suits most uses; choose Quartile or High for outdoor prints, or if you will place a logo over the middle. More correction makes the code denser.',
      },
    ],
  },
  {
    slug: 'barcode-generator',
    icon: 'barcode',
    name: 'Barcode generator',
    title: 'Free Barcode Generator: PNG, SVG, PDF, No Sign-up | Stayput',
    description:
      'Make a Code 128, Code 39, UPC-A, EAN-13 or ITF-14 barcode and save it as PNG, SVG or PDF. No sign-up, no watermark. What you type is not uploaded.',
    heading: 'Make a barcode',
    tagline: 'Type a number or text, pick the barcode type, and save the barcode as an image or a PDF. It is drawn on this page.',
    category: 'images',
    accept: '.txt',
    multiple: false,
    dropLabel: 'Make a barcode',
    action: 'Download',
    sizeFact: 'No watermark, no sign-up',
    keywords: ['barcode generator', 'free barcode generator', 'barcode generator online', 'barcode maker', 'make a barcode', 'create barcode', 'barcode generator no sign up', 'barcode generator png'],
    steps: [
      'Choose the barcode type. Code 128 takes any text; UPC-A, EAN-13, EAN-8 and ITF-14 take digits only, and the page adds the last (check) digit if you leave it out.',
      'Type the number or text. The barcode redraws as you type, and a message tells you at once if a character or the length is not allowed for that type.',
      'Set the bar width, height and colours if you need to, then save a PNG, an SVG or a PDF. Test-scan a printed copy with a barcode scanner before you print a run.',
    ],
    sections: [
      {
        heading: 'Which barcode type to choose',
        bullets: [
          '[UPC-A](/upc-barcode-generator): 12 digits, for products sold in North America.',
          '[EAN-13](/ean-13-barcode-generator): 13 digits, for products sold in most other countries. A book’s [ISBN barcode](/isbn-barcode-generator) is an EAN-13.',
          'EAN-8: 8 digits, for very small packages. UPC-E: a short 8-digit form of some UPC-A numbers.',
          '[ITF-14](/itf-14-barcode-generator): 14 digits, for cartons and cases. ITF: any even number of digits, for your own labels and cartons.',
          '[Code 128](/code-128-barcode-generator): letters, digits and punctuation, up to 80 characters here. The flexible choice for labels, inventory and shipping.',
          '[Code 39](/code-39-barcode-generator): capital letters, digits and a few symbols, with an optional check character. Older systems and asset tags.',
        ],
      },
      {
        heading: 'What this page does not do',
        bullets: [
          'It does not issue product numbers. A shop or marketplace number (a GTIN) comes from GS1, and this page draws the barcode for a number you already have.',
          'It does not make QR codes or other two-dimensional codes. Use the [QR code generator](/tools/qr-code-generator) for those.',
          'It does not draw the small price add-on printed beside some book and magazine barcodes.',
        ],
      },
    ],
    faq: [
      {
        q: 'Which barcode type should I choose?',
        a: 'It depends on who will scan it. Products sold in shops use UPC-A (North America) or EAN-13 (most other countries), and cartons use ITF-14. For your own labels, shelves, inventory and shipping, Code 128 is a common choice because it holds any text and stays compact; Code 39 is the older option some systems still ask for. If a customer, shop or marketplace named a type, use that one.',
      },
      {
        q: 'Can I make a barcode for a product I want to sell in shops?',
        a: 'This page draws the barcode, but it cannot give you the number. Shops and marketplaces generally expect product numbers (GTINs) issued to your company by GS1, and a number you invent may already belong to someone else’s product. Get your number first, type it in here, and the page adds the check digit and draws the barcode.',
      },
      {
        q: 'What is the check digit, and does the page add it?',
        a: 'The last digit of UPC-A, EAN-13, EAN-8 and ITF-14 is a check digit, worked out from the other digits so a scanner can tell when it misread. If you type the number without it (11, 12, 7 or 13 digits), the page adds it and shows you which digit it added. If you type the full number and the last digit is wrong, the page tells you what it should be instead of drawing a barcode a shop’s system would reject.',
      },
      {
        q: 'PNG, SVG or PDF?',
        a: 'PNG for documents, slides and web pages. SVG for print and design tools: the bars are exact rectangles, so they stay sharp at any size. PDF when you want a single file to send to a printer or open in any PDF reader; it holds the PNG image on a page the size of the image.',
      },
      {
        q: 'How big should I print it?',
        a: 'Bar width and height here are in pixels on screen. In print, what matters is the width of the narrowest bar, so save the SVG, scale it in your layout program, and keep the blank space (the quiet zone) left and right of the bars. Shops, carriers and warehouses often publish the size range they accept; follow theirs, then scan a printed copy before you print a whole sheet.',
      },
      {
        q: 'Why does the page say my text is not allowed?',
        a: 'Each type has its own alphabet. UPC, EAN and ITF are digits only. Code 39 takes capital letters, digits, space and - . $ / + %, and the page turns lowercase letters into capitals. Code 128 here takes the characters on a standard keyboard, which covers letters, digits and punctuation but not accented letters or emoji.',
      },
      {
        q: 'Does it make QR codes too?',
        a: 'No. A QR code is a different, two-dimensional type. Use the [QR code generator](/tools/qr-code-generator) for a link, Wi-Fi network or contact card.',
      },
      {
        q: 'Is what I type uploaded anywhere?',
        a: 'No. The barcode is drawn by code running in this page, so the number or text you type stays on your device. After your first visit and a short wait you can turn off your internet connection and it still works.',
      },
    ],
  },
  {
    slug: 'signature-maker',
    icon: 'pen',
    name: 'Signature maker',
    title: 'Free Signature Maker & Generator, Transparent PNG | Stayput',
    description: 'Draw, type or photograph your signature and save it as a transparent PNG, or an SVG when drawn. Free, no sign-up; nothing you make is uploaded.',
    heading: 'Make a signature',
    tagline: 'Draw it with a finger or mouse, type your name in a script font, or take it from a photo. Save a transparent PNG for documents, or place it on a PDF.',
    category: 'pdf',
    accept: '.txt',
    multiple: false,
    dropLabel: 'Make a signature',
    action: 'Download',
    sizeFact: 'No watermark, no sign-up',
    keywords: ['signature maker', 'signature generator', 'free signature maker', 'online signature maker', 'create a signature', 'signature maker transparent png', 'draw signature online', 'signature maker no sign up'],
    steps: [
      'Choose Draw, Type or Photo. Draw with a finger, pen or mouse; type your name and pick a script; or add a photo of your signature on white paper.',
      'Check the preview on the checkerboard, which shows what is transparent. Change the ink, pen width or ink strength until it looks right, and use Undo or Clear to start again.',
      'Download the PNG (or the SVG for a drawn signature), copy it to paste into a document, or press Use in Sign PDF to place it on a PDF.',
    ],
    sections: [
      {
        heading: 'Which mode to use',
        bullets: [
          'Draw: the closest to your real signature. Works best with a finger on a phone or a pen on a tablet; a mouse works but is harder to control.',
          'Type: the quickest. Three script styles, and what you get is a typeface, not your own handwriting.',
          'Photo: sign a plain white page with a dark pen, photograph it in daylight, and the page takes the paper out and keeps the ink. See the [transparent signature PNG](/transparent-signature-png) page for photo tips.',
        ],
      },
      {
        heading: 'What you get',
        bullets: [
          'PNG: transparent background, trimmed to the signature, 600, 1200 or 2400 pixels wide.',
          'SVG: drawn signatures only; it holds your strokes as paths, so it stays sharp at any size.',
          'Copy image: puts the PNG on the clipboard to paste into a document or slide.',
        ],
      },
      {
        heading: 'What this page does not do',
        bullets: [
          'It makes a picture of a signature. It does not make a certificate-based digital signature, and it does not decide whether a form or office accepts an image.',
          'It does not save your signature. Download it, or close the page and it is gone.',
          'It does not make fancy-letter text to paste into a bio or message.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I make a signature with a transparent background?',
        a: 'Draw it, type it or add a photo here, then press Download PNG. The background of the file is transparent, so the signature sits on a document or slide without a white box around it. The preview is shown on a checkerboard so you can see which parts are transparent.',
      },
      {
        q: 'Should I draw, type or use a photo?',
        a: 'Draw if you want it to look like your own signature. Type if you need something quick and neat; it is a script typeface, not your handwriting. Use a photo if you already have a signature you like on paper, because it keeps the real shape of your pen strokes.',
      },
      {
        q: 'Will a form, employer or office accept this?',
        a: 'It is a picture of a signature, the same as signing paper and scanning it. Many forms, employers and offices accept that; some want a signature made in their own system, or a certificate-based digital signature, and this page does not make one. Check what the person asking for it accepts.',
      },
      {
        q: 'How do I put the signature on a PDF?',
        a: 'Press Use in Sign PDF. The signature is carried to the [Sign PDF](/tools/sign-pdf) page in this tab, where you drop your PDF, drag the signature into place and download the signed file. Or download the PNG and insert it in any document editor.',
      },
      {
        q: 'Is my signature uploaded or saved?',
        a: 'No. It is made by code running in this page, so what you draw, type or photograph stays on your device. Nothing is kept when you close or reload the page, so download it if you want it. If you press Use in Sign PDF, one temporary copy is kept in this browser’s storage on your device until Sign PDF picks it up. After one visit and a short wait you can turn off your internet connection and the page still works.',
      },
      {
        q: 'How should I photograph my signature?',
        a: 'Sign in dark ink on plain white paper, lay it flat in daylight or under a lamp so no shadow crosses the signature, and shoot straight down. Crop away printed lines and text first with [Crop image](/tools/crop-image), because the page keeps anything dark. If the paper still shows, lower Ink strength; if pale ink is missing, raise it.',
      },
      {
        q: 'Can I get an SVG?',
        a: 'For a drawn signature, yes: the SVG holds your strokes as paths and stays sharp at any size. A typed signature or a photo is saved as PNG only. To trace a photo of a signature into shapes, use [Image to SVG](/tools/image-to-svg).',
      },
      {
        q: 'Can I copy it as text to paste into a bio or message?',
        a: 'No. This makes an image, so use Copy image to paste it into a document, slide or chat that accepts pictures. Fancy-letter text that looks like handwriting is a different kind of tool.',
      },
      {
        q: 'Can someone else reuse my signature image?',
        a: 'Anyone who gets the file can place it on another document, the same as a copy of your signature on paper. Share it only with people you trust and do not post it publicly.',
      },
    ],
  },
  {
    slug: 'qr-code-scanner',
    icon: 'qr',
    name: 'QR code scanner',
    title: 'Free QR Code Scanner Online: Image or Camera | Stayput',
    description: 'Scan a QR code or barcode from an image, screenshot or your camera. Free, no sign-up, and nothing is uploaded or opened for you.',
    heading: 'Scan a QR code',
    tagline: 'Drop, paste or choose an image, or use your camera. The code is read on this page, and a link is shown to you, never opened for you.',
    category: 'images',
    accept: 'image/*',
    multiple: true,
    dropLabel: 'Drop an image with a QR code or barcode',
    action: 'Read the code',
    sizeFact: 'No watermark, no sign-up',
    keywords: ['qr code scanner', 'qr code scanner online', 'qr code reader', 'qr code scanner from image', 'scan qr code from image', 'qr code scanner for pc', 'scan qr code from screenshot', 'free qr code scanner', 'barcode scanner online'],
    steps: [
      'Drop an image of a QR code or barcode on the box, paste a screenshot (Ctrl+V on Windows and Linux, Cmd+V on a Mac), or choose a file. Or press Scan with camera and point it at the code.',
      'The code is read on this page and shown as a card: the address of a link, the details of a Wi-Fi network, a contact, or plain text.',
      'Check what it says, then copy it. For a link, read the domain carefully and press Open link only if it is the site you expect. The page never opens anything for you.',
    ],
    sections: [
      {
        heading: 'What it reads',
        bullets: [
          'QR codes, including ones with a logo in the middle, upside down, mirrored or at an angle.',
          'Barcodes on products and parcels: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, Code 93, ITF and Codabar.',
          'Other two-dimensional codes: Data Matrix, Aztec and PDF417.',
          'Several codes in one picture: each is listed.',
        ],
      },
      {
        heading: 'What it does not do',
        bullets: [
          'It does not tell you whether a link is safe. It shows the full address and warns about the common tricks, but a link with no warnings can still be bad.',
          'It does not look a product barcode up. A barcode holds a number; this page shows the number.',
          'It does not read round or dotted codes that belong to one app. Those can only be read inside that app.',
        ],
      },
      {
        heading: 'Other tools',
        paragraphs: ['Make your own with the [QR code generator](/tools/qr-code-generator) or the [barcode generator](/tools/barcode-generator).'],
      },
    ],
    faq: [
      {
        q: 'Is the picture or the camera feed uploaded?',
        a: 'No. The code is read by a program running in this page, on your device. Your picture and your camera feed are not sent anywhere. The first scan loads a reader of about 1 MB from this site and keeps it in your browser, so after your first run the page works offline.',
      },
      {
        q: 'Does it open the link in the code?',
        a: 'No. It shows you the full address, with the domain written out on its own line, and warns about common tricks such as look-alike letters or a hidden destination. A link opens only when you press the Open link button. Nothing is opened for you.',
      },
      {
        q: 'How can I tell if a link in a QR code is safe?',
        a: 'You cannot be sure from a code. Read the domain letter by letter, because look-alike sites change one letter, and be careful with links that ask you to sign in, pay or install something. If a code is on a sticker stuck over another code, or in a message you did not expect, do not open it.',
      },
      {
        q: 'Do I need to install an app?',
        a: 'No. It works in Safari on an iPhone, in Chrome on Android and in any recent desktop browser. To use the camera, press the button and allow it when your browser asks.',
      },
      {
        q: 'Why can’t it use my camera?',
        a: 'The camera is blocked for this page, in use by another app, or not found. The page tells you which, and how to turn it back on in Settings. You can always drop, paste or choose an image instead.',
      },
      {
        q: 'It says no code was found. What can I try?',
        a: 'Crop the picture so the code fills most of it, with a blank border around it, and use a sharp, bright image. If the code is on a screen, take a screenshot instead of a photo of the screen. Codes that are very small, very blurry or partly covered cannot be read.',
      },
      {
        q: 'What happens to the Wi-Fi password in a Wi-Fi code?',
        a: 'It is shown on this page, hidden behind a Show button, so you can copy it. It is not stored and not uploaded. A web page cannot join the network for you; copy it into your Wi-Fi settings, or scan with your phone’s camera app.',
      },
      {
        q: 'Which codes can it read?',
        a: 'QR codes (including Micro QR), Data Matrix, Aztec, PDF417, and the common barcodes on products and parcels: EAN, UPC, Code 128, Code 39, Code 93, ITF and Codabar.',
      },
    ],
  },
  {
    slug: 'screen-recorder',
    icon: 'record',
    name: 'Screen recorder',
    title: 'Free Online Screen Recorder, No Upload or Watermark | Stayput',
    description:
      'Record your screen, a window or a browser tab with sound and your microphone, right in the browser. No install, no sign-up, no watermark, no time limit.',
    heading: 'Record your screen',
    tagline: 'Capture your screen, one window or a tab, with its sound and your voice. The video is made in this tab and never uploaded.',
    category: 'media',
    accept: 'video/*,.mp4,.webm',
    multiple: false,
    dropLabel: 'Record your screen',
    action: 'Save recording',
    keywords: ['screen recorder', 'online screen recorder', 'record screen', 'screen recorder with audio', 'free screen recorder', 'screen recorder no watermark', 'record my screen'],
    steps: [
      'Choose whether to record the sound from the screen, your microphone or both, then press Start recording.',
      'Your browser asks what to share: the entire screen, one window or one tab. Pick it and press Share. To include the sound of a tab or the whole screen, tick "Share audio" in that picker.',
      'Pause and resume as needed, then press Stop and save (or the browser\'s own Stop sharing). Watch the recording on the page and download it as MP4 or WebM.',
    ],
    faq: [
      {
        q: 'Is my recording uploaded?',
        a: 'No. Your browser records the screen and writes the video in this tab, and the file goes straight to your downloads. There is no account, no server, no watermark and no time limit, and nobody else ever sees what you recorded.',
      },
      {
        q: 'Why is there no sound in my recording?',
        a: 'The sound is only captured when you share it. In Chrome and Edge, tick "Share audio" (or "Also share tab audio") in the browser\'s picker; a single window cannot share its sound, so share the tab or the entire screen instead. Firefox and Safari do not share screen sound at all, so tick "My microphone" to narrate instead. Not sure the microphone works? Check it first with the [mic test](/tools/mic-test).',
      },
      {
        q: 'Is the video MP4 or WebM?',
        a: 'It depends on the browser. Recent Chrome and Edge and Safari record MP4, which plays everywhere; Firefox records WebM. To turn a WebM into MP4, use Video to MP4 afterwards, and to make the file smaller, use Compress video.',
      },
      {
        q: 'Can I record on my phone?',
        a: 'Not in a web page: phone and tablet browsers do not let websites capture the screen. Use the recorder built into the phone instead (Screen Recording in the iPhone Control Centre, or Screen record in Android\'s quick settings), then trim or compress the video here.',
      },
      {
        q: 'Is there a time limit?',
        a: 'No. The recording is held in your computer\'s memory until you save it, so very long recordings at 60 frames per second need a fair amount of free memory. An hour at 30 frames per second is usually a few hundred megabytes to a couple of gigabytes, depending on how much moves on screen.',
      },
    ],
  },
  {
    slug: 'voice-recorder',
    icon: 'mic',
    name: 'Voice recorder',
    title: 'Online Voice Recorder: Record to MP3, No Upload | Stayput',
    description:
      'Record your voice with your microphone and save it as MP3, WAV or M4A, right in the browser. No app, no sign-up, no time limit, and nothing is uploaded.',
    heading: 'Record your voice',
    tagline: 'A voice memo, a voice-over or a quick demo, recorded in this tab and saved as MP3. The sound never leaves your device.',
    category: 'media',
    accept: 'audio/*,.webm,.ogg,.m4a',
    multiple: false,
    dropLabel: 'Record your voice',
    action: 'Save recording',
    keywords: ['voice recorder', 'online voice recorder', 'record audio', 'record voice', 'mp3 recorder', 'audio recorder online', 'record my voice'],
    steps: [
      'Press Start recording and allow the microphone when your browser asks. Choose another microphone from the list if you have more than one.',
      'Speak. The meter shows the level; pause and resume as often as you like.',
      'Press Stop and save. Listen back on the page and download the recording as MP3, WAV or M4A.',
    ],
    faq: [
      {
        q: 'Is my recording uploaded?',
        a: 'No. The microphone is recorded by your browser in this tab, and the MP3 is written by code in this page. There is no account and no server, so nobody else can hear it, and the page works offline after your first run.',
      },
      {
        q: 'Does it work on my phone?',
        a: 'Yes, in Safari on iPhone and iPad and in Chrome on Android. Keep the screen on while recording: phones pause web pages when the screen locks.',
      },
      {
        q: 'Why does my voice sound muffled or quiet?',
        a: 'Noise and echo reduction is on by default, which suits calls and memos. For music or a clean voice-over with a good microphone, untick "Reduce background noise and echo" to record the raw sound, then use the volume booster if it is too quiet.',
      },
      {
        q: 'Is there a time limit?',
        a: 'No. The recording is held in memory until you save it; an hour of speech is only a few tens of megabytes. Saving a very long recording as MP3 takes a little while, and WAV is fastest.',
      },
      {
        q: 'Can I turn the recording into text?',
        a: 'Yes. Save it, then drop the file on [Audio to text](/audio-to-text): a speech model running in your browser writes it out, and the recording is not uploaded.',
      },
    ],
  },
  {
    slug: 'volume-booster',
    icon: 'volume',
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
        a: 'No. Your browser decodes the sound, the volume change runs in the page, and the file is written again in your tab. Videos have their picture copied across without re-encoding. Your files are not uploaded, and it works offline after your first run.',
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
    slug: 'audio-reverser',
    name: 'Audio reverser',
    title: 'Audio Reverser: Play a Sound File Backwards, No Upload | Stayput',
    description:
      'Reverse an MP3, WAV, M4A, FLAC or OGG file so it plays backwards, in your browser. Save as WAV or another format. Batch, not uploaded, no sign-up.',
    heading: 'Reverse an audio file',
    tagline: 'Turn a sound file around so it plays from the end to the start. Done on this device; your files are not uploaded.',
    category: 'media',
    accept: 'audio/*,.mp3,.wav,.wave,.m4a,.aac,.ogg,.oga,.opus,.flac,.caf,.aiff,.aif',
    multiple: true,
    dropLabel: 'Drop audio files to reverse',
    action: 'Reverse',
    keywords: ['audio reverser', 'reverse audio', 'reverse sound', 'play audio backwards', 'reverse mp3', 'backwards audio', 'reverse wav'],
    steps: [
      'Drop one or more sound files (MP3, WAV, M4A, FLAC, OGG), or tap to pick them.',
      'Keep the original format, or choose WAV or FLAC to keep every sample, or MP3, M4A or OGG for a smaller file.',
      'Press Reverse. Each file downloads when it is ready, with -reversed added to its name; several come as a zip.',
    ],
    faq: [
      {
        q: 'Are my files uploaded?',
        a: 'No. Your browser decodes the sound with its own decoders, the samples are put in the opposite order in the page, and the new file is written in your tab. Your files are not uploaded, so the limit is your device’s memory (phones hold less), and the page works offline after your first run.',
      },
      {
        q: 'Is the reversed WAV exact?',
        a: 'Yes. WAV and FLAC output keep the sample rate of the original and every sample, only in the opposite order. MP3, M4A and OGG have to be encoded again, which discards a little detail, so choose WAV or FLAC if you plan to edit the result further.',
      },
      {
        q: 'Does it work on stereo files?',
        a: 'Yes. Left and right are reversed together, so the stereo picture stays in step. Files with more than two channels are mixed down to stereo first.',
      },
      {
        q: 'Can I reverse the sound of a video?',
        a: 'Drop the video on [Reverse video](/tools/reverse-video), which flips the picture and, if you want, the sound together.',
      },
    ],
  },
  {
    slug: 'remove-noise',
    icon: 'mic',
    name: 'Remove background noise',
    title: 'Remove Background Noise from Audio or Video, No Upload | Stayput',
    description:
      'Clean hiss, hum, fans, traffic and room noise out of a voice recording or video in your browser. Batch, keeps the format, nothing uploaded, no sign-up.',
    heading: 'Remove background noise',
    tagline: 'Keep the voice, lose the hiss, hum and fan noise. Cleaned on this device, never uploaded.',
    category: 'media',
    accept: 'audio/*,video/*,.mp3,.wav,.wave,.m4a,.aac,.ogg,.oga,.opus,.flac,.caf,.aiff,.aif,.mp4,.m4v,.mov,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop recordings or videos to clean',
    action: 'Remove noise',
    keywords: ['remove background noise', 'noise reduction', 'remove noise from audio', 'audio noise remover', 'remove background noise from video', 'noise remover', 'reduce background noise', 'clean up audio'],
    steps: [
      'Drop one or more recordings (MP3, WAV, M4A, FLAC, OGG, voice memos) or videos (MP4, MOV, WebM), or tap to pick them.',
      'Keep Strong to leave only the voice, or pick Medium or Light to keep a little of the room. Keep the original format or pick another.',
      'Run it. Each file is cleaned in your tab; videos keep their picture untouched and get the cleaned sound.',
    ],
    faq: [
      {
        q: 'Are my recordings uploaded?',
        a: 'No. The noise remover is a small neural network that runs as WebAssembly inside this page. Your browser decodes the sound, the network cleans it, and the file is written again in your tab. Your files are not uploaded, and it works offline after your first run.',
      },
      {
        q: 'What kind of noise does it remove?',
        a: 'Steady and repeating background sound around a voice: hiss, electrical hum, computer and air-conditioning fans, traffic, rain, keyboard typing and crowd murmur. It is trained on speech, so it keeps voices and treats most other sound as noise.',
      },
      {
        q: 'Can I use it on music?',
        a: 'Not really. It keeps speech and drops what is not speech, so instruments get thinned or cut. For a voice over quiet music, try Light, which mixes some of the original back in.',
      },
      {
        q: 'Does it work on a video?',
        a: 'Yes. Drop an MP4, MOV or WebM and the cleaned sound is put back with the original picture, which is copied as it is. The sound is re-encoded as AAC in an MP4, or Opus in a WebM, and stays in sync.',
      },
      {
        q: 'Why does the voice sound a little thin or robotic?',
        a: 'When the noise is as loud as the voice, removing it takes some of the voice too. Pick Medium or Light, which blend a share of the original back in, or boost a quiet recording with the volume booster afterwards.',
      },
    ],
  },
  {
    slug: 'merge-audio',
    icon: 'merge',
    name: 'Merge audio',
    title: 'Merge Audio Files Online: Join MP3 and WAV, No Upload | Stayput',
    description:
      'Join two or more audio files into one MP3 or WAV in your browser, in the order you choose, with silence or a crossfade between them. No upload.',
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
        a: 'No. Your browser decodes each file and the joined file is written by code in this page. Your files are not uploaded, the page works offline after your first run.',
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
    slug: 'mic-test',
    icon: 'mic',
    name: 'Mic test',
    title: 'Mic Test: Check Your Microphone Online, No Upload | Stayput',
    description:
      'Test your microphone online: live level meter, a plain verdict, and a 5-second record and play back. Runs in your browser; nothing is uploaded.',
    heading: 'Test your microphone',
    tagline: 'Check that your microphone works before a Zoom, Teams or Discord call: speak and watch the level, then play back five seconds to hear how you sound. Nothing is uploaded.',
    category: 'media',
    accept: '.txt',
    multiple: false,
    dropLabel: 'Test your microphone',
    action: 'Test',
    sections: [
      {
        heading: 'Test a headset or external microphone',
        paragraphs: [
          'Plug in or pair the headset or USB microphone first, then press Test my microphone and choose it from the Microphone list. The bar and the play-back then show that microphone, not the laptop\'s own. If it is not in the list, check that it is connected and not muted, then press Stop using the microphone and start again.',
        ],
      },
      {
        heading: 'Tips for a clean recording',
        bullets: [
          'Keep your mouth about a hand\'s width from the microphone.',
          'Keep the peak marker clear of the right end of the bar: a peak at the end means clipping, so turn the input volume down.',
          'Close other apps that use the microphone, and turn off fans and music that the microphone can hear.',
          'Happy with the level? Record it with the [voice recorder](/tools/voice-recorder). Still hissy or noisy? Clean the recording with [Remove background noise](/tools/remove-noise).',
        ],
      },
      {
        heading: 'Microphone not working? Check these first',
        bullets: [
          'Check the microphone is not muted: many headsets and laptops have a mute key or switch.',
          'Check that the right microphone is chosen in the list.',
          'Check that no other app, such as Zoom or Teams, is holding the microphone.',
          'Check the browser is allowed to use it: on a Mac under System Settings, Privacy and Security, Microphone; on Windows under Settings, Privacy, Microphone.',
        ],
      },
    ],
    keywords: ['mic test', 'microphone test', 'test my mic', 'online mic test', 'is my mic working', 'check microphone', 'mic checker'],
    steps: [
      'Press Test my microphone and allow it when your browser asks. Choose another microphone from the list if you have several.',
      'Speak. The bar moves with your voice, and the verdict says whether the level is right, too quiet, clipping or silent.',
      'Press Record 5 seconds and play back to hear exactly how you sound, then press Stop using the microphone.',
    ],
    faq: [
      {
        q: 'Is my voice recorded or uploaded?',
        a: 'No. The level is measured by code in this page from the live input, and nothing is recorded unless you press the play-back button. That recording stays in this tab’s memory, is never sent anywhere, and disappears when you close the page.',
      },
      {
        q: 'The bar does not move. What is wrong?',
        a: 'Check the microphone is not muted (many headsets and laptops have a mute key or switch), that the right microphone is chosen in the list, and that no other app such as Zoom or Teams is holding it. On a Mac, allow the browser under System Settings, Privacy and Security, Microphone; on Windows, under Settings, Privacy, Microphone.',
      },
      {
        q: 'What level should I aim for?',
        a: 'When you speak normally, the average should sit around the middle of the bar (about −30 to −15 dB) and the peak marker should stay clear of the right end. A peak at the end means the sound is clipping, which sounds harsh; turn the input volume down.',
      },
      {
        q: 'Why does it sound different in calls?',
        a: 'This test turns off the browser’s noise suppression, echo cancellation and automatic gain, so you hear what the microphone really picks up. Call apps apply their own clean-up, which usually makes voices quieter in the background and more even.',
      },
      {
        q: 'How do I test my microphone on Windows or Mac?',
        a: 'Open this page, press Test my microphone and allow it when your browser asks, then speak: the bar moves and the verdict tells you if the level is right. If the browser has no access, allow it on a Mac under System Settings, Privacy and Security, Microphone, or on Windows under Settings, Privacy, Microphone. The sound is handled inside the page in your tab and is never sent to a server.',
      },
      {
        q: 'How do I test an external or USB microphone?',
        a: 'Connect it first, press Test my microphone, then pick it from the Microphone list and speak into it. If you plug it in after the test has started, press Stop using the microphone and start again. For a headset, also check the headset is the one chosen, not the laptop microphone.',
      },
      {
        q: 'Does the mic test work on a phone?',
        a: 'Try it. Open this page in your phone’s browser, press Test my microphone and allow the microphone when asked. If the bar moves, it works there; if it does not, check the browser’s microphone permission in your phone’s settings.',
      },
    ],
  },
  {
    slug: 'webcam-test',
    icon: 'video',
    name: 'Webcam test',
    title: 'Webcam Test: Check Camera Resolution and FPS | Stayput',
    description:
      'Test your webcam online: live preview, real resolution and frame rate, mirror view and a snapshot. The picture stays in this tab; nothing is uploaded.',
    heading: 'Test your webcam',
    tagline: 'Check that your webcam works before a Zoom, Teams or interview call: see the live picture, the real resolution and the measured frame rate. Nothing is uploaded.',
    category: 'media',
    accept: '.txt',
    multiple: false,
    dropLabel: 'Test your webcam',
    action: 'Test',
    sections: [
      {
        heading: 'What this test shows',
        bullets: [
          'The live picture from your camera, so you can check framing and light.',
          'The resolution the camera really delivers, which can be lower than the box says.',
          'The frame rate, measured in this page.',
          'The aspect ratio of the picture.',
          'A mirror view, to see yourself as in a mirror.',
          'A snapshot you can save as a JPG.',
        ],
      },
      {
        heading: 'Webcam not working?',
        bullets: [
          'Check the lens cover or privacy switch. Some laptops also have a camera key on the keyboard.',
          'Check that no other app, such as Zoom or Teams, is using the camera.',
          'Check the browser is allowed to use the camera: on a Mac under System Settings, Privacy and Security, Camera; on Windows under Settings, Privacy, Camera.',
        ],
      },
    ],
    keywords: ['webcam test', 'camera test', 'test my webcam', 'online webcam test', 'is my webcam working', 'check camera', 'webcam resolution test'],
    steps: [
      'Press Test my webcam and allow the camera when your browser asks. Choose another camera from the list if you have several.',
      'Check the picture, then read what the camera really delivers: its resolution, aspect ratio and the frame rate measured in this page.',
      'Take a photo to save a snapshot as JPG, then press Turn off the camera.',
    ],
    faq: [
      {
        q: 'Is my picture recorded or uploaded?',
        a: 'No. The camera shows in this page from a local stream, and nothing is recorded or sent anywhere. A snapshot is only made when you press Take a photo, and it goes straight to your downloads.',
      },
      {
        q: 'My camera is not found or shows black. What is wrong?',
        a: 'Check the lens cover or privacy switch, that no other app such as Zoom or Teams is using the camera, and that the browser is allowed to use it: on a Mac under System Settings, Privacy and Security, Camera; on Windows under Settings, Privacy, Camera. Some laptops also have a camera key on the keyboard.',
      },
      {
        q: 'Why is the resolution lower than my camera’s box says?',
        a: 'Browsers ask for 1080p here, and a camera gives the closest mode it has. Many “1080p” webcams only deliver 720p over USB, or drop resolution in apps that request less. Choose 4K under Ask for to see the most your camera offers.',
      },
      {
        q: 'Why is the measured frame rate low?',
        a: 'Webcams slow down in dim light to let in more light per frame, often from 30 to 15 frames per second. Turn on a lamp facing you and test again.',
      },
      {
        q: 'How do I test my webcam on Windows or Mac?',
        a: 'Open this page, press Test my webcam and allow the camera when your browser asks. If the picture stays black, allow the browser on a Mac under System Settings, Privacy and Security, Camera, or on Windows under Settings, Privacy, Camera. The picture, its resolution and the frame rate then show on the page, and the picture stays in this tab.',
      },
      {
        q: 'Can I test my webcam before a Zoom or Teams call?',
        a: 'Yes. Close the call app first, because another app may be using the camera, then press Test my webcam here to check the picture, the light and the frame rate. Turn the camera off on this page before you rejoin the call.',
      },
    ],
  },
  {
    slug: 'speaker-test',
    icon: 'volume',
    name: 'Speaker test',
    title: 'Speaker Test: Left and Right Channel Check Online | Stayput',
    description:
      'Test your speakers or headphones online: a tone in the left, the right or both channels, a frequency sweep and pink noise. It starts quiet, and nothing is uploaded.',
    heading: 'Test your speakers',
    tagline: 'Check that both sides of your speakers or headphones play: send a tone to the left, the right or both, sweep up through the pitches, or play pink noise. It starts quiet, and nothing is uploaded.',
    category: 'media',
    accept: '.txt',
    multiple: false,
    dropLabel: 'Test your speakers',
    action: 'Test',
    lead:
      'Plays a test tone through the left speaker, the right speaker or both, sweeps up through the pitches, or plays pink noise, so you can hear whether each side of your speakers or headphones is working. It is free, and your choices are not uploaded: the sounds are made by code in your browser, and the page uses no file and no microphone. After one visit and a short wait the page works offline.',
    sections: [
      {
        heading: 'What this test does',
        bullets: [
          'Plays one sound at a time through the left channel, the right channel or both, so you can hear which side it comes from.',
          'Lets you pick the pitch of the tone, from a low note to a high one.',
          'Sweeps a tone smoothly from low to high, with the pitch shown as it rises.',
          'Plays pink noise, a steady hiss that is easier than a single tone to place in the room and to hear rattles in.',
          'Starts at a low volume and asks you to confirm before it goes louder.',
        ],
      },
      {
        heading: 'What this test cannot tell you',
        bullets: [
          'The page plays sound and you listen. It cannot hear your speakers, so it does not measure their quality, loudness or frequency response.',
          'It cannot say that a speaker is broken. A missing tone is a reason to check the cable, the settings and the volume below, not a diagnosis.',
          'Small speakers play very low and very high tones weakly or not at all. What you hear depends on your speakers and your hearing.',
        ],
      },
      {
        heading: 'Sound missing on one side? Check these first',
        bullets: [
          'Check the balance setting in your system’s sound settings; it can be set all the way to one side.',
          'Check that the right output is chosen: speakers, headphones and Bluetooth devices each show up as a separate output.',
          'Check for a mono-audio setting in your system’s accessibility options, which sends both sides to every speaker.',
          'Check the cable or the Bluetooth connection, and try another pair of headphones or another device.',
        ],
      },
    ],
    keywords: ['speaker test', 'online speaker test', 'left right speaker test', 'test my speakers', 'headphone test', 'stereo test', 'speaker tester', 'sound test'],
    steps: [
      'Turn your device volume down, choose Left, Right or Both, and press Play tone.',
      'Listen for the tone. It should come from the side you chose; if it comes from the other side or from both, check the settings listed below the test.',
      'Press Sweep to hear the pitch rise from low to high, or Pink noise for a steady hiss, and press Stop when you are done.',
    ],
    faq: [
      {
        q: 'Is anything recorded or uploaded?',
        a: 'No. The sounds are made by code in this page and played through your speakers. The page does not use your microphone and does not ask for any permission, and nothing about what you play is sent anywhere.',
      },
      {
        q: 'How do I test the left and right speakers?',
        a: 'Press Left and listen: the tone should come only from the left speaker, or the left side of your headphones. Press Right to check the other side, then Both to hear them together. If a side is silent, check the balance setting and the connection first.',
      },
      {
        q: 'Why does the tone come from both speakers, or from one only?',
        a: 'If the sound comes from both sides when you chose one, check for a mono-audio setting in your system’s accessibility options. If your device has a single speaker, as many phones do, left and right play from that one speaker.',
      },
      {
        q: 'Does this measure how good my speakers are?',
        a: 'No. The page plays sounds and you listen to them. It cannot hear what comes out, so it cannot measure quality, volume or frequency response. Use it to check that each side plays and to hear whether a speaker rattles or goes quiet at some pitch.',
      },
      {
        q: 'Why does it start at a low volume?',
        a: 'A steady tone is harsher than music at the same setting, and a speaker you have not tested before may be turned up from last time. The test starts quiet, and asks you to confirm before it goes louder. Raise the volume a little at a time, on the page or on your device, and stop if it hurts.',
      },
      {
        q: 'Can I test headphones with it?',
        a: 'Yes. Left and Right then play in the matching ear. Keep the volume low before you put them on, because the tone sits close to your ear.',
      },
      {
        q: 'What is pink noise for?',
        a: 'Pink noise is a steady hiss with equal energy in each octave, so it sounds fuller and less shrill than white noise. Play it through one side or both to hear whether the sound fills the room evenly, or to listen for a rattle or a buzz that a single tone can miss. It is for listening only: this page does not measure what comes out.',
      },
      {
        q: 'Why can I not hear the lowest or the highest part of the sweep?',
        a: 'Small speakers, such as those in a phone or laptop, play very low notes weakly or not at all, and people differ in how high a sound they hear. Missing the ends of the sweep is common and does not by itself mean a fault.',
      },
      {
        q: 'Does the speaker test work on a phone?',
        a: 'Try it. Open this page in your phone’s browser and press Play tone. If you hear nothing, check the volume and any silent or mute switch on the phone.',
      },
    ],
  },
  {
    slug: 'keyboard-tester',
    icon: 'keyboard',
    name: 'Keyboard test',
    title: 'Keyboard Test: Check Every Key Online | Stayput',
    description:
      'Test your keyboard online: press each key and watch it light up on an on-screen ANSI or ISO layout, with a log of every key and code. Free, and nothing you type is sent.',
    heading: 'Keyboard Test',
    tagline: 'A free key tester: press any key and it lights up on an on-screen keyboard, in an ANSI or ISO layout, and stays marked so you can see which keys you have not tried yet. What you type stays in this tab.',
    category: 'media',
    accept: '.txt',
    multiple: false,
    dropLabel: 'Test your keyboard',
    action: 'Test',
    lead:
      'A keyboard test and key tester in one page: press a key and it lights up on an on-screen keyboard, and stays marked as tested, so you can find a key that has stopped working, a stuck key or a chattering one. It shows each key’s name and its code in a log, handles F-keys, the numpad and the arrows, and switches between ANSI and ISO layouts. It is free, and what you type is not uploaded: the keys are read by code in your browser and drawn on the page, and the page uses no file. After one visit and a short wait the page works offline.',
    sections: [
      {
        heading: 'What this test does',
        bullets: [
          'Lights each key on the on-screen keyboard when you press it, and keeps it marked as tested after you let go.',
          'Logs every key press with the key it produced and its code, so you can see which physical key was pressed even when the typing language changes the letter.',
          'Covers the letters, numbers, modifier keys, F1 to F12, the arrows, the navigation block and the numpad.',
          'Shows an ANSI layout (US) or an ISO layout (UK and European), and counts how many keys you have tested.',
          'Has a Reset button that clears the marks and the log, so you can test again.',
        ],
      },
      {
        heading: 'What this test cannot tell you',
        bullets: [
          'The page only sees keys the browser passes on. Fn, most media, volume and brightness keys, and shortcuts the system keeps for itself, such as Cmd+Tab or the Windows key, never reach a web page.',
          'A key that does not light up here may be broken, or it may be one the browser never sees. Try it in a text editor to tell the two apart.',
          'It cannot measure typing speed or how a key feels, and it cannot say whether a keyboard is worn out.',
        ],
      },
      {
        heading: 'A key that does not light up? Check these first',
        bullets: [
          'Press it firmly and a few times, and check that the page is the active window.',
          'Check whether it is a function or media key that needs Fn held, and try it with and without Fn.',
          'Clean under the key with compressed air, and try the keyboard on another computer.',
          'Check the keyboard layout and language in your system settings if letters show differently than the key tops.',
        ],
      },
    ],
    keywords: ['keyboard test', 'keyboard tester', 'online keyboard test', 'key tester', 'test my keyboard', 'keyboard key test', 'check keyboard keys', 'keyboard ghosting test'],
    steps: [
      'Choose the ANSI or ISO layout that matches your keyboard.',
      'Press each key. It lights up on the on-screen keyboard and stays marked, and the log shows its key and code.',
      'Press Reset to start again, and try any key that stayed unmarked in a text editor to see whether it is broken or just not visible to the browser.',
    ],
    faq: [
      {
        q: 'Is anything I type recorded or uploaded?',
        a: 'No. The page reads each key press in your tab and shows it on the page, and the log lives only in the tab’s memory. Nothing about the keys you press is sent anywhere, and it is gone when you close the tab or press Reset.',
      },
      {
        q: 'How do I test my keyboard online?',
        a: 'Open this page and press each key in turn. The matching key on the on-screen keyboard lights up and stays marked as tested. Any key left unmarked after you have pressed it a few times is one the keyboard is not sending, or one the browser does not see.',
      },
      {
        q: 'Why does a key not light up?',
        a: 'Either the key does not work, or the browser never receives it. Fn, most media and brightness keys and some system shortcuts, such as Cmd+Tab on a Mac or the Windows key, are handled by the system or the keyboard itself before a web page can see them.',
      },
      {
        q: 'Can I use this key tester for ghosting or rollover?',
        a: 'Partly. Hold several keys at once and watch which ones light up as pressed. Keys that go missing while others are held point to ghosting or a low rollover limit, but the result depends on the keyboard, the connection and the operating system, so treat it as a hint.',
      },
      {
        q: 'What is the difference between the key and the code in the log?',
        a: 'The key is what the press produces, such as a lowercase a, a capital A or a symbol, and it changes with Shift and with your language. The code names the physical key, such as KeyA, and stays the same whatever the layout.',
      },
      {
        q: 'What is the difference between ANSI and ISO?',
        a: 'ANSI is the US layout, with a wide, flat Enter key and a long left Shift. ISO is common in the UK and Europe, with a tall Enter key and an extra key next to the left Shift. Pick the one that looks like your keyboard.',
      },
      {
        q: 'Does it work on a laptop or a Mac?',
        a: 'Yes. A laptop’s built-in keyboard is tested the same way. On a Mac the Command keys show as Win/Cmd, and Fn and the media row do not reach the browser.',
      },
      {
        q: 'Does the tester work with a phone or tablet keyboard?',
        a: 'It works with a hardware keyboard connected to the phone or tablet. The on-screen keyboard of a phone does not send physical key codes, so it will not light the keys here.',
      },
    ],
  },
  {
    slug: 'tone-generator',
    icon: 'volume',
    name: 'Tone generator',
    title: 'Online Tone Generator and Frequency Generator | Stayput',
    description:
      'Play a test tone online: sine, square, triangle or sawtooth from 20 Hz to 20 kHz, with presets for 440 Hz, 1 kHz and bass. It starts quiet, and nothing is uploaded.',
    heading: 'Online tone generator',
    tagline: 'Play a steady tone at any pitch from 20 Hz to 20 kHz, as a sine, square, triangle or sawtooth wave. It starts quiet, and nothing is uploaded.',
    category: 'media',
    accept: '.txt',
    multiple: false,
    dropLabel: 'Play a tone',
    action: 'Play',
    lead:
      'Plays a steady test tone at the pitch you choose, from 20 Hz to 20 kHz, as a sine, square, triangle or sawtooth wave, so you can check speakers, headphones and subwoofers, or find a reference note. It is free, and your choices are not uploaded: the tone is made by code in your browser, and the page uses no file and no microphone. After one visit and a short wait the page works offline.',
    sections: [
      {
        heading: 'What this tool does',
        bullets: [
          'Plays one steady tone with a sine, square, triangle or sawtooth wave.',
          'Sets the pitch with a slider on a log scale from 20 Hz to 20 kHz, or with a number you type; the two stay in step.',
          'Has presets for 440 Hz (the A above middle C), 1 kHz and a 50 Hz test bass.',
          'Starts at a low level and fades in and out, so starting and stopping do not click.',
        ],
      },
      {
        heading: 'Take care with your hearing',
        bullets: [
          'Turn your device volume down first and raise it slowly. A steady tone is harsher than music at the same setting.',
          'Take extra care with headphones, which sit close to your ear.',
          'Very low and very high tones can be hard to hear and still be loud, so do not judge the volume by how it sounds. Stop if it hurts.',
        ],
      },
      {
        heading: 'What this tool cannot tell you',
        bullets: [
          'The page plays sound and you listen. It cannot hear your speakers, so it does not measure their quality, loudness or frequency response.',
          'Small speakers play very low and very high tones weakly or not at all, and people differ in how high a sound they hear.',
        ],
      },
    ],
    keywords: ['tone generator', 'online tone generator', 'frequency generator', 'sine wave generator', 'test tone', 'hz tone generator', 'square wave generator', 'sound generator'],
    steps: [
      'Turn your device volume down, choose a wave, and set the pitch with the slider, by typing Hz or with a preset.',
      'Press Play and raise the level slowly if you need to. Change the wave or the pitch while it plays.',
      'Press Stop when you are done. The tone also stops when you leave the tab.',
    ],
    faq: [
      {
        q: 'Is anything recorded or uploaded?',
        a: 'No. The tone is made by an oscillator in this page and played through your speakers. The page does not use your microphone and does not ask for any permission, and nothing about what you play is sent anywhere.',
      },
      {
        q: 'Is this an online tone generator or a frequency generator?',
        a: 'Both. It is an online tone generator that works as a frequency generator too: type any pitch from 20 Hz to 20 kHz, or drag the slider, and it plays that frequency as a steady tone you can use to test speakers or find a reference note.',
      },
      {
        q: 'Which wave should I use?',
        a: 'A sine is a single pure pitch, the cleanest for checking speakers. A square and a sawtooth are buzzier because they carry many harmonics, and a triangle sits between a sine and a square. Use them to hear how a speaker handles a richer sound.',
      },
      {
        q: 'Is it safe for my ears and my speakers?',
        a: 'It starts at a low level and the level slider tops out well below full scale, but your device volume is separate, so lower it first. Very low and very high tones can be hard to hear and still be loud, so raise the volume a little at a time and stop if it hurts. Avoid long, loud tones through small speakers.',
      },
      {
        q: 'Why can I not hear the lowest or the highest tones?',
        a: 'Small speakers, such as those in a phone or laptop, play very low notes weakly or not at all, and hearing for high pitches varies between people and fades with age. Many adults hear little above 15 kHz.',
      },
      {
        q: 'What is 440 Hz?',
        a: 'It is concert A, the A above middle C, which most modern music is tuned to. The 440 Hz preset gives you a reference note to tune against. For tuning by ear, the tuner on this site can also listen to your instrument.',
      },
      {
        q: 'Can I check my speakers left and right?',
        a: 'This page plays both sides together. To send a tone to the left or the right side only, use the speaker test.',
      },
    ],
  },
  {
    slug: 'dead-pixel-test',
    icon: 'grid',
    name: 'Dead pixel test',
    title: 'Dead Pixel Test: Full-Screen Screen Test Online | Stayput',
    description:
      'Free dead pixel checker: fill your whole screen with black, white, red, green and blue to find dead or stuck pixels. Step by click or arrow keys. Nothing is uploaded.',
    heading: 'Test your screen for dead pixels',
    tagline: 'A dead pixel checker and screen test: fill the whole screen with one solid colour at a time, so a dead or stuck pixel stands out. It runs in your browser, and nothing is uploaded.',
    category: 'media',
    accept: '.txt',
    multiple: false,
    dropLabel: 'Test your screen',
    action: 'Test',
    lead:
      'Fills your whole screen with solid black, white, red, green and blue, one at a time, so a dead or stuck pixel stands out. It is a dead pixel checker and screen test: click or use the arrow keys to change colour, or let it cycle by itself. It is free, and your choices are not uploaded: the colours are drawn by code in your browser, and the page uses no file. After one visit and a short wait the page works offline.',
    sections: [
      {
        heading: 'How to tell a dead pixel from a stuck one',
        bullets: [
          'A dead pixel stays black on every colour, including white. Look for a tiny dark dot on the white screen.',
          'A stuck pixel stays one colour (red, green, blue or white) whatever the screen shows. Look for a bright dot on the black screen.',
          'A hot pixel is a stuck pixel that is always white, so it is easiest to see on black.',
          'Dust or a speck on the glass can look the same, so wipe the screen with a soft dry cloth first and look again.',
        ],
      },
      {
        heading: 'How to run the test',
        bullets: [
          'Clean the screen, set the brightness fairly high, and dim the room.',
          'Press Start the test, then click or press the arrow keys to move through black, white, red, green and blue.',
          'Look at each colour for a moment, close to the screen, and note where any odd dot sits.',
          'Press Esc to leave, or turn on the automatic cycle to step through the colours hands-free.',
        ],
      },
      {
        heading: 'What this test cannot do',
        bullets: [
          'It cannot fix pixels. The page only shows plain colours; whether a pixel is dead or stuck is down to the panel itself.',
          'It cannot measure your screen’s quality, colour accuracy or brightness, and it does not read what your screen shows.',
          'Some stuck pixels come back to normal by themselves or with gentle pressure; a dead pixel almost never does. Check your maker’s dead pixel policy before you try anything.',
        ],
      },
    ],
    keywords: ['dead pixel test', 'dead pixel checker', 'screen test', 'stuck pixel test', 'monitor test', 'lcd screen test', 'check for dead pixels', 'pixel test online', 'screen colour test'],
    steps: [
      'Clean your screen, then press Start the test. The page goes full screen, or fills the window if your browser cannot.',
      'Click, tap or press the arrow keys to step through black, white, red, green and blue, and look for dots that do not match.',
      'Press Esc to leave the test. A dot that stays black on every colour is dead; one that stays one colour is stuck.',
    ],
    faq: [
      {
        q: 'Is anything uploaded or recorded?',
        a: 'No. The colours are drawn by code in this page and nothing about your screen, your device or what you looked at is sent anywhere. The page asks for no permission.',
      },
      {
        q: 'What is a dead pixel?',
        a: 'A dead pixel is a tiny dot that never lights up, so it stays black on every colour. It shows best on the white screen. Pixels that stay lit are stuck pixels.',
      },
      {
        q: 'What is the difference between a dead pixel and a stuck pixel?',
        a: 'A dead pixel is always black. A stuck pixel is always one colour, such as red, green, blue or white, and shows best on the black screen. Stepping through all five colours tells you which one you have.',
      },
      {
        q: 'Can this dead pixel checker fix a dead pixel?',
        a: 'No. A software screen test can only show you the pixels; it cannot repair them. A stuck pixel sometimes clears by itself, and a dead pixel almost never does. If your screen is under warranty, ask the maker about its dead pixel policy.',
      },
      {
        q: 'Why does the page need full screen?',
        a: 'So that the colour covers every pixel, with no browser bars or taskbar in the way. Where your browser cannot go full screen, as on iPhone Safari, the test fills the browser window instead and the page tells you so; a little of the edge may still show browser controls.',
      },
      {
        q: 'How do I leave the screen test?',
        a: 'Press Esc. On a phone, where there is no Esc key, tap the × in the corner. The cursor is hidden while the test runs so it does not cover a pixel.',
      },
      {
        q: 'Can I run this screen test on a phone or tablet?',
        a: 'Yes. Open this page in your phone’s browser, press Start the test and tap to change colour. If your browser fills the window rather than the whole screen, the bars at the edge cannot be tested this way.',
      },
      {
        q: 'Why is a dot visible on only one colour?',
        a: 'A pixel is made of red, green and blue parts. If only one part is stuck on, the dot shows on the black screen as that colour, and may disappear on a screen that already has that colour. That is a stuck sub-pixel.',
      },
      {
        q: 'Does the test work on a TV or a second monitor?',
        a: 'Yes, if you open this page in a browser on that screen. Drag the window to the screen you want to check before you press Start the test, since full screen uses the display the window is on.',
      },
    ],
  },
  {
    slug: 'audio-to-video',
    icon: 'film',
    name: 'Audio to video',
    title: 'Audio to Video: Turn MP3 into MP4 with a Picture | Stayput',
    description:
      'Make a video from a song, podcast or voice note and a cover picture, for YouTube, Instagram or TikTok. 16:9, square or 9:16. In your browser, no upload.',
    heading: 'Turn audio into a video',
    tagline: 'Put a song, a podcast episode or a voice note on a still picture, ready for YouTube or social apps. Made on this device.',
    category: 'media',
    accept: 'audio/*,image/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.jpg,.jpeg,.png,.webp,.heic',
    multiple: true,
    dropLabel: 'Drop a sound file and a picture',
    action: 'Make video',
    keywords: ['audio to video', 'mp3 to mp4', 'convert mp3 to video', 'add picture to mp3', 'mp3 to video with image', 'audio to mp4', 'podcast to video'],
    steps: [
      'Drop a sound file (MP3, WAV, M4A, FLAC or OGG) and a picture such as the album cover, or tap to pick them. Without a picture, the video shows the title on a plain background.',
      'Choose the shape: 16:9 for YouTube, square for feeds, or 9:16 for Shorts, Reels and TikTok. The picture is shown whole, over a blurred copy of itself or plain black or white.',
      'Make the video. It is written as an MP4 in your browser and downloads when it is ready.',
    ],
    faq: [
      {
        q: 'Are my files uploaded?',
        a: 'No. Your browser decodes the sound and writes the video with its own encoders, in this tab. There is no size or length limit and no watermark, and your files are not uploaded.',
      },
      {
        q: 'Why is the video file so small?',
        a: 'The picture does not change, so the video part is a single still frame repeated once a second, which costs almost nothing. Nearly all of the file is the sound, encoded with a target of up to 192 kbps.',
      },
      {
        q: 'Can I make videos for a whole album at once?',
        a: 'Yes. Drop all the tracks and one cover picture: each track becomes its own video with the same picture.',
      },
      {
        q: 'Will YouTube accept it?',
        a: 'Yes. It is a standard MP4 at 1920×1080 (or 1080×1080, or 1080×1920 for Shorts). In Chrome, Edge and Safari the picture is H.264 and the sound AAC, which play everywhere.',
      },
      {
        q: 'What if I have many pictures, not one?',
        a: 'Use the [Photo slideshow maker](/tools/photo-slideshow-maker): it puts up to 100 photos in order, with your song under them, in one MP4.',
      },
    ],
  },
  {
    slug: 'photo-slideshow-maker',
    icon: 'film',
    name: 'Photo slideshow maker',
    title: 'Photo Slideshow Maker: Pictures to MP4, No Upload | Stayput',
    description:
      'Turn photos into an MP4 slideshow: set the order, seconds per photo, fade between them and add a song. Free, no watermark, nothing uploaded.',
    heading: 'Make a photo slideshow video',
    tagline: 'Drop your photos, put them in order, pick how long each one stays, add a song and download an MP4. It all happens on this device; nothing is uploaded.',
    category: 'media',
    accept: 'image/*,audio/*,.heic,.heif,.avif,.jxl,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac',
    multiple: true,
    dropLabel: 'Drop your photos, and a song if you like',
    action: 'Make video',
    sizeFact: 'No watermark. From 2 to 100 photos; the limit is your device’s memory (phones hold less).',
    keywords: ['photo slideshow maker', 'slideshow maker', 'photo to video', 'photos to video', 'picture to video', 'slideshow video maker', 'photo video maker', 'photo slideshow with music'],
    steps: [
      'Drop your photos, and a song if you like. Pictures from an iPhone (HEIC) work too.',
      'Put the photos in order with the arrows or by dragging, and set the seconds per photo.',
      'Press Make video and download the MP4.',
    ],
    sections: [
      {
        heading: 'What it doesn’t do',
        paragraphs: [
          'There is no text on slides, no pan and zoom, no templates and no stock music, and every photo stays on screen for the same time. For words on a video, use [Add subtitles to video](/tools/add-subtitles-to-video). To join video clips, use [Merge videos](/tools/merge-videos).',
        ],
      },
      {
        heading: 'Where the video plays',
        paragraphs: [
          'The result is a standard MP4 that WhatsApp, Instagram, TikTok, YouTube, PowerPoint and TVs open. Pick tall 9:16 for Reels and TikTok, square for feeds, or wide 16:9 for YouTube and slides. Trim the result with [Trim video](/tools/trim-video), or make it smaller with [Compress video](/tools/compress-video).',
        ],
      },
    ],
    faq: [
      {
        q: 'Is there a watermark or a limit?',
        a: 'There is no watermark and no sign-up. You can use 2 to 100 photos, and the limit is your device’s memory (phones hold less), so a long slideshow of large photos may need a computer.',
      },
      {
        q: 'Can I add music?',
        a: 'Yes. Drop one song with the photos: it is cut at the end with a one-second fade, or repeats if it is shorter. To add sound to a slideshow you already made, use [Add audio to video](/tools/add-audio-to-video).',
      },
      {
        q: 'How long will the video be?',
        a: 'The number of photos times the seconds per photo. Twenty photos at 3 seconds each make a one-minute video. The Match the song button sets the seconds so the photos fill the song.',
      },
      {
        q: 'What shape should I pick for Instagram, TikTok or YouTube?',
        a: 'Tall 9:16 for Reels, Shorts and TikTok, square for feed posts, wide 16:9 for YouTube and slides. For an existing video, see [Crop video for TikTok](/crop-video-for-tiktok).',
      },
      {
        q: 'Can I use HEIC photos from my iPhone?',
        a: 'Yes. HEIC, JPG, PNG, WebP and AVIF photos are read in your browser, so there is no need to convert them first.',
      },
      {
        q: 'Are my photos uploaded?',
        a: 'No. They are decoded and the video is written in this tab, with no photo or file name sent anywhere. Open the network tab, run it, and your photos are not among the requests.',
      },
      {
        q: 'Can I make a GIF instead?',
        a: 'Yes: the [GIF maker](/tools/gif-maker) makes a looping GIF from the same kind of photos. For one picture under a song, see [Audio to video](/tools/audio-to-video).',
      },
    ],
  },
  {
    slug: 'compress-audio',
    icon: 'compress',
    name: 'Compress audio',
    title: 'Compress Audio: Reduce MP3 and WAV File Size, No Upload | Stayput',
    description:
      'Make MP3, WAV, M4A and other audio files smaller in your browser, or fit them under 8, 16 or 25 MB for Discord, WhatsApp or email. No upload, no sign-up.',
    heading: 'Compress audio',
    tagline: 'Shrink recordings, podcasts and songs to send or store. Done on this device, never uploaded.',
    category: 'media',
    accept: 'audio/*,.mp3,.wav,.wave,.m4a,.aac,.ogg,.oga,.opus,.flac,.caf,.aiff,.aif',
    multiple: true,
    dropLabel: 'Drop audio files to compress',
    action: 'Compress',
    keywords: ['compress audio', 'compress mp3', 'reduce mp3 file size', 'audio compressor online', 'reduce audio file size', 'compress wav', 'make mp3 smaller'],
    steps: [
      'Drop one or more audio files (MP3, WAV, M4A, FLAC, OGG), or tap to pick them.',
      'Choose how hard to compress, or a size limit such as 25 MB for email. Tick Mono for a voice recording.',
      'Compress. One file downloads straight away; several download as a zip.',
    ],
    faq: [
      {
        q: 'Are my files uploaded?',
        a: 'No. Your browser decodes the sound and the smaller file is written inside the page: MP3 by LAME compiled to WebAssembly, OGG by the browser’s own Opus encoder. Your files are not uploaded, so the size limit is your device’s memory (phones hold less), and the page works offline after one visit and a short wait (MP3 output needs one MP3 run first).',
      },
      {
        q: 'How much smaller will it get?',
        a: 'A WAV shrinks to about a tenth at 128 kbps. An MP3 that is already 320 kbps drops to about 40%, and one at 128 kbps only gets smaller at a lower setting. If a file is already smaller than the setting would make it, you get it back unchanged.',
      },
      {
        q: 'How does Fit under work?',
        a: 'It works out the bitrate that brings the file under the limit from its length, and uses that when it is lower than your chosen setting. An hour of audio needs about 48 kbps to fit in 25 MB, fine for speech. Tick Mono as well for recordings of talk.',
      },
      {
        q: 'MP3 or OGG?',
        a: 'MP3 plays everywhere. OGG with Opus sounds better at low bitrates, so a voice memo at 48 kbps Opus is as clear as a 96 kbps MP3; Chrome, Firefox, Android, Discord and WhatsApp play it, older iPhones may not.',
      },
    ],
  },
  {
    slug: 'add-text-to-image',
    icon: 'text',
    name: 'Add text to image',
    title: 'Add Text to Image Online, Free, No Upload | Stayput',
    description:
      'Put text on a photo in your browser: drag it into place, pick a font, colour, outline or box, and save full size. Batch captions too. No upload.',
    heading: 'Add text to an image',
    tagline: 'Write on a photo, a screenshot or a meme and drag the words where you want them. Done on this device, never uploaded.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop images to add text to',
    action: 'Add text',
    keywords: ['add text to image', 'add text to photo', 'write on picture', 'put text on image', 'text on photo online', 'caption photo', 'add words to picture'],
    steps: [
      'Drop a photo or screenshot (JPG, PNG, WebP, HEIC and more), or several to caption them all the same way.',
      'Type your text, then drag it on the preview to place it. Pick a font, colour, size and an outline, shadow or box so it reads on any background. Add a second text for a caption at the other end.',
      'Save. The text is drawn onto the full-size image; one file downloads straight away, several as a zip.',
    ],
    faq: [
      {
        q: 'Is my photo uploaded?',
        a: 'No. Your browser decodes the image, draws your text onto it on a canvas in the page, and saves the result. Your files are not uploaded, and it works offline after one visit and a short wait.',
      },
      {
        q: 'Does the text stay sharp on a big photo?',
        a: 'Yes. The preview is scaled down to fit your screen, but the saved file is drawn at the photo’s full size, and the text size is a share of the photo, so it looks the same as the preview.',
      },
      {
        q: 'Can I add the same text to many images?',
        a: 'Yes. Drop them all at once and the text goes in the same place on each, which is how to caption a set of photos. For a repeated or tiled name across photos, use the watermark tool. The preview shows the first image.',
      },
      {
        q: 'How do I make text readable on a busy photo?',
        a: 'Use Outline for bold meme-style letters, Shadow for a softer look, or Box to put the text on a dark or light panel. White with an outline reads on almost anything.',
      },
      {
        q: 'Can I edit the text later?',
        a: 'Not in the saved image: the text becomes part of the picture. Keep your original, which is never changed, and run it again with new text.',
      },
      {
        q: 'Can I add text to an animated GIF?',
        a: 'This page is for still pictures. For an animated GIF, use [Add text to GIF](/tools/add-text-to-gif), which draws the same text on every frame and keeps the timing.',
      },
    ],
  },
  {
    slug: 'split-image',
    icon: 'grid',
    name: 'Split image',
    title: 'Split Image into Grid: Instagram Grid Maker, No Upload | Stayput',
    description:
      'Cut a picture into a 3×3 grid, a 3-across carousel or any rows and columns in your browser, with square or 4:5 tiles for Instagram. No upload, no watermark.',
    heading: 'Split an image into tiles',
    tagline: 'Cut one picture into a grid or a seamless carousel. Done on this device, never uploaded.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop an image to split',
    action: 'Split image',
    keywords: ['split image', 'image splitter', 'instagram grid maker', 'split image into grid', 'cut image into pieces', 'grid maker for instagram', 'instagram panorama carousel'],
    steps: [
      'Drop a picture (JPG, PNG, WebP, HEIC and more), or tap to pick one.',
      'Pick a grid: 3 across for a carousel, 3 × 3 for a profile grid, or any rows and columns. Choose square or 4:5 tiles for Instagram; the preview shows the cut lines and dims anything trimmed.',
      'Split. The tiles download together as a zip, numbered left to right or in the order to post them.',
    ],
    faq: [
      {
        q: 'Is my picture uploaded?',
        a: 'No. Your browser decodes the image and cuts the tiles on a canvas in the page. Your files are not uploaded, and it works offline after one visit and a short wait.',
      },
      {
        q: 'Which grid for an Instagram profile?',
        a: 'Instagram shows profiles three posts across, and newer profiles show each post as a 4:5 portrait. Choose 3 × 3 (or 3 × 2) with Portrait 4:5 tiles and In posting order, then post tile 1 first: the last one you post lands top left and completes the picture.',
      },
      {
        q: 'How do I make a seamless carousel?',
        a: 'Choose 3 across (or 2 across) with Portrait 4:5 or Square tiles and post the tiles as one carousel, in number order. Swiping reveals one wide picture.',
      },
      {
        q: 'Is quality lost?',
        a: 'No resizing happens: each tile is an exact piece of the original, saved once. Pick PNG for a lossless file, or keep the original format.',
      },
    ],
  },
  {
    slug: 'collage-maker',
    icon: 'merge',
    name: 'Collage maker',
    title: 'Photo Collage Maker: Combine Images, Free, No Upload | Stayput',
    description:
      'Combine photos into one image in your browser: a grid, side by side or stacked, with spacing and a background colour. No upload, no watermark, no sign-up.',
    heading: 'Make a photo collage',
    tagline: 'Put several pictures into one: a grid, a row or a stack. Done on this device, never uploaded.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop two or more pictures to combine',
    action: 'Make collage',
    keywords: ['collage maker', 'photo collage', 'combine images', 'merge images', 'put pictures side by side', 'combine photos into one', 'image grid maker'],
    steps: [
      'Drop two or more pictures (JPG, PNG, WebP, HEIC and more), or tap to pick them. Use the arrows in the list to change the order.',
      'Choose a grid, side by side or stacked. Set the spacing, the background colour and how big the collage should be; the preview updates as you go.',
      'Make the collage. It downloads straight away as one image.',
    ],
    faq: [
      {
        q: 'Are my photos uploaded?',
        a: 'No. Your browser decodes the pictures and draws the collage on a canvas in the page. Your files are not uploaded, and it works offline after one visit and a short wait.',
      },
      {
        q: 'Are the pictures cropped?',
        a: 'Side by side and stacked keep each whole picture, scaled to a shared height or width. A grid gives every picture the same cell: Fill each cell crops the edges to fit, Show whole picture keeps it all with the background around it.',
      },
      {
        q: 'How big is the collage?',
        a: 'Its longest side is 2400 px by default, enough for sharing and a phone screen. Choose 4000 px for printing, or 1200 px for a small file to send in a message.',
      },
      {
        q: 'Is there a watermark or a limit?',
        a: 'No watermark, and no set limit on the number of pictures beyond your device’s memory (phones hold less).',
      },
      {
        q: 'Can I make a video of the pictures instead?',
        a: 'Yes. The [Photo slideshow maker](/tools/photo-slideshow-maker) shows them one after another in an MP4, with seconds per photo and an optional song.',
      },
    ],
  },
  {
    slug: 'extract-pdf-images',
    icon: 'image',
    name: 'Extract Images from PDF',
    title: 'Extract Images from PDF at Full Resolution, No Upload | Stayput',
    description:
      'Save every photo and picture inside a PDF as PNG or JPG, at the resolution it was stored. Runs in your browser: the PDF is not uploaded. Free.',
    heading: 'Extract images from a PDF',
    tagline: 'Every picture in the file, at its real size, without screenshots and without uploading the PDF.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: false,
    dropLabel: 'Drop a PDF here',
    action: 'Extract images',
    keywords: ['extract images from pdf', 'pdf image extractor', 'save images from pdf', 'get pictures from pdf', 'export images from pdf', 'pdf to images extract', 'download images from pdf'],
    steps: [
      'Drop a PDF.',
      'Choose all pages or some, PNG or JPG, and whether to leave out icons and repeats.',
      'Download the pictures one by one or all together as a zip.',
    ],
    faq: [
      {
        q: 'Are the images at full quality?',
        a: 'Yes. Each picture comes out at the pixel size it is stored at inside the PDF, which is usually larger than it looks on the page. Choose PNG to keep every pixel exactly; JPG makes smaller files for photos.',
      },
      {
        q: 'How is this different from PDF to Image?',
        a: 'PDF to Image saves whole pages, text and all, as pictures. This tool pulls out only the photos and pictures placed in the pages, each as its own file, without the text around them.',
      },
      {
        q: 'Why did it find no images?',
        a: 'Some PDFs have no stored pictures: charts and logos are often drawn as vector shapes, and some scanners store each page as one image. For a scan you get one picture per page. For vector drawings, use PDF to Image to save the page instead.',
      },
      {
        q: 'What about password-protected PDFs?',
        a: 'A PDF that opens without a password but blocks copying works as normal. If it needs a password to open, remove it first with Unlock PDF, which also runs in your browser.',
      },
      {
        q: 'Is my PDF uploaded?',
        a: 'No. The file is read by pdf.js running in this tab and the pictures are saved from memory. Your files are not uploaded, and the page keeps working with the network off after one visit and a short wait.',
      },
    ],
  },
  {
    slug: 'pitch-changer',
    icon: 'speed',
    name: 'Pitch and speed changer',
    title: 'Change Pitch or Speed of Audio Online, No Upload | Stayput',
    description:
      'Shift a song or recording up or down by semitones without changing its length, or speed it up or slow it down without chipmunk voices. MP3, WAV, M4A, FLAC. Runs in your browser; nothing is uploaded.',
    heading: 'Change the pitch or speed of audio',
    tagline: 'Change the key of a song, or play it faster or slower, keeping the other the same. Done on this device.',
    category: 'media',
    accept: 'audio/*,.mp3,.wav,.wave,.m4a,.aac,.ogg,.oga,.opus,.flac,.caf,.aiff,.aif,.webm',
    multiple: true,
    dropLabel: 'Drop audio files to change pitch or speed',
    action: 'Change',
    keywords: ['pitch changer', 'change pitch of audio', 'audio pitch shifter', 'speed up audio', 'slow down audio', 'mp3 speed changer', 'pitch shifter online'],
    steps: [
      'Drop one or more sound files (MP3, WAV, M4A, FLAC, OGG), or tap to pick them.',
      'Move the pitch in semitones, choose a speed, or both. Keep the original format or pick another.',
      'Run it. Each file downloads when it is ready; several come as a zip.',
    ],
    faq: [
      {
        q: 'Is my audio uploaded?',
        a: 'No. Your browser decodes the sound, the pitch and speed change run in the page, and the file is written again in your tab. Your files are not uploaded, and it works offline after your first run.',
      },
      {
        q: 'How do I change the key of a song?',
        a: 'Move the pitch slider by the number of semitones between the keys: from C to D is +2, from E to C is −4. The tempo and length stay the same, so you can sing or play along in a key that suits your voice or instrument. The [Key changer](/key-changer) page opens on this control.',
      },
      {
        q: 'Will speeding up make voices sound like chipmunks?',
        a: 'No. Speed changes keep the pitch unless you tick the option to let the pitch follow the speed, which gives the record-player effect some people want for sped-up or slowed songs.',
      },
      {
        q: 'How good is the quality?',
        a: 'Small changes, a few semitones or up to about 1.5× speed, sound natural. Very large ones, a whole octave or half speed, add some smearing, as every pitch shifter does. Save as WAV or FLAC if you will edit the result further.',
      },
      {
        q: 'Can I use it on a video?',
        a: 'This page takes sound files. For a video, use Change video speed, which keeps the pitch of the voices, or save the sound first with Video to MP3.',
      },
    ],
  },
  {
    slug: 'bpm-key-finder',
    icon: 'metronome',
    name: 'BPM and key finder',
    title: 'BPM and Key Finder: Tempo, Key and Camelot Code, Free | Stayput',
    description: 'Find the BPM and musical key of a song from an audio file, with its Camelot code. Free, no sign-up, and the song is not uploaded.',
    heading: 'BPM and key finder with Camelot codes',
    tagline: 'Drop an audio file and read its tempo, key and Camelot code. The song is analysed on this device.',
    category: 'media',
    accept: 'audio/*,.mp3,.wav,.wave,.m4a,.aac,.ogg,.oga,.opus,.flac,.caf,.aiff,.aif,.webm,.mp4,.mov',
    multiple: true,
    dropLabel: 'Drop songs to find their BPM and key',
    action: 'Find BPM and key',
    sizeFact: 'No account, no watermark',
    keywords: ['bpm and key finder', 'key and bpm finder', 'bpm key finder', 'bpm detector', 'bpm analyzer', 'song key and bpm'],
    steps: [
      'Drop one or more songs, or tap to pick them. MP3, WAV, M4A, FLAC, Ogg and most other audio files work; a video’s sound works too.',
      'Press Find BPM and key. A three-minute song takes a few seconds.',
      'Read the tempo, the key and the Camelot code. Check the tempo by ear, and treat a key marked Unsure as a guess.',
    ],
    sections: [
      {
        heading: 'How to read the result',
        bullets: [
          '**BPM** is beats per minute, the steady pulse you would tap your foot to. The page folds the answer into 70 to 180, and for tempos from about 80 to 120 it also shows the half and the double, because a detector cannot always tell a slow song with busy drums from a fast one.',
          '**Key** is the home note and the scale, such as A minor. Many songs sit between a major key and its relative minor (C major and A minor use the same notes), so the page names the relative key as well.',
          '**Camelot code** is the key written as a number from 1 to 12 and a letter: A for minor, B for major. Two songs whose codes are the same, or one number apart, or the same number with the other letter, usually blend well. The [Camelot wheel](/camelot-wheel) page lists all 24.',
          '**Unsure** means the notes in the song did not point clearly to one key. It happens with drones, drum-only tracks, heavy bass and songs that change key.',
        ],
      },
      {
        heading: 'What this page does not do',
        bullets: [
          'It assumes one steady tempo. A song that speeds up, slows down or is played without a click can get a tempo that matches only part of it.',
          'It reads a file, not a link. A streaming-service or video link cannot be analysed here, because the page never fetches anything for you; use a file you have.',
          'It does not find chords. It gives one key for the whole file.',
          'It reads up to 15 minutes. For a longer file, cut the part you want with [Trim audio](/tools/trim-audio).',
        ],
      },
      {
        heading: 'Without a file',
        bullets: [
          'If you only want the tempo, the [BPM finder](/bpm-finder) page puts the BPM first and the key second.',
          'Tap along with a song you can only hear on the [Tap tempo](/tap-tempo) page, and check the answer against a click on the [online metronome](/tools/metronome).',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I find the BPM of a song?',
        a: 'Drop the audio file here and press Find BPM and key. The page decodes the file in your browser, finds the beat and shows the tempo in beats per minute, with its tempo name, and the half and double readings when they are in a plausible range. If you only have the song playing and no file, use the [Tap tempo](/tap-tempo) page and tap along.',
      },
      {
        q: 'Why does the BPM look double or half of what I expected?',
        a: 'Both are the same pulse counted twice. A slow song with a busy hi-hat can be written either way, and detectors cannot always tell which one you mean. The page folds its answer into 70 to 180 BPM and, for tempos from about 80 to 120, shows the half and the double next to it. Pick the one that matches how the song feels, or that your DJ software or session expects.',
      },
      {
        q: 'How accurate is it?',
        a: 'It is an estimate made from the sound, not a lookup, so check it. Play the song next to a click on the [online metronome](/tools/metronome), and treat a key marked Unsure as a guess to confirm by ear or on an instrument.',
      },
      {
        q: 'What is the Camelot code?',
        a: 'It is a way of writing the 24 major and minor keys as 1A to 12B so that keys that sound good together sit next to each other on a wheel. A is minor and B is major. A minor is 8A and its relative major, C major, is 8B. DJ software often shows it next to the BPM.',
      },
      {
        q: 'Why does it show two keys?',
        a: 'A major key and its relative minor use exactly the same notes, so from the notes alone it is often a close call which one the song treats as home. The page shows its best answer and names the relative key, because that is the most common near miss. Listen for which note feels like the place the music comes to rest.',
      },
      {
        q: 'Can I paste a YouTube or Spotify link?',
        a: 'No. The page analyses files on your device and does not fetch anything from other sites. Use an audio file you have, or tap the tempo with the [Tap tempo](/tap-tempo) page.',
      },
      {
        q: 'What happens with songs that change tempo or key?',
        a: 'The page assumes one steady tempo and one key for the whole file, so it reports what fits most of the song. If the song has a tempo change, cut the part you care about with [Trim audio](/tools/trim-audio) and analyse that.',
      },
      {
        q: 'Which files work, and how long can they be?',
        a: 'Whatever your browser can play: MP3, WAV, M4A, AAC, FLAC and Ogg are the usual ones. WMA files are not readable in any browser. Files up to 15 minutes are analysed; for a longer one, cut the part you want first.',
      },
      {
        q: 'Is my audio uploaded anywhere?',
        a: 'No. The file is decoded and analysed by code running in this page, and the results, including the file name in the results file, stay on your device. After your first visit and a short wait you can turn off your internet connection and it still works.',
      },
    ],
  },
  {
    slug: 'mp3-to-midi',
    icon: 'metronome',
    name: 'MP3 to MIDI',
    title: 'MP3 to MIDI Converter, Free, No Upload | Stayput',
    description:
      'Convert MP3 to MIDI: an AI model finds the notes in a recording and saves them as a .mid file. Free, no sign-up, and the audio is not uploaded. Best on one instrument.',
    heading: 'Convert MP3 to MIDI',
    tagline: 'Drop a recording of one instrument, a voice or a hummed tune and get its notes as a MIDI file. The audio is read on this device, up to five minutes.',
    category: 'media',
    accept: 'audio/*,.mp3,.wav,.wave,.m4a,.aac,.ogg,.oga,.opus,.flac,.caf,.aiff,.aif,.webm,.mp4,.mov',
    multiple: false,
    dropLabel: 'Drop an MP3 or other audio file to turn into MIDI',
    action: 'Convert to MIDI',
    sizeFact: 'Up to 5 minutes of audio, no account, no watermark',
    keywords: ['mp3 to midi', 'mp3 to midi converter', 'convert mp3 to midi', 'audio to midi', 'wav to midi', 'audio to midi converter', 'mp3 to midi online', 'convert audio to midi', 'melody to midi'],
    steps: [
      'Drop an MP3, WAV, M4A, FLAC or Ogg file of up to five minutes. A recording of one instrument, a voice or a hummed tune works best.',
      'Press Convert to MIDI. The first run downloads the note model and its engine once; the file is then read in short windows and the notes are found on your device.',
      'Look over the piano roll, press Play to hear the notes, then download the .mid file and open it in your music software.',
    ],
    sections: [
      {
        heading: 'What this page does well and what it does not',
        bullets: [
          '**One instrument at a time.** A solo piano, guitar, flute or sung melody gives the cleanest result. The model can follow several notes at once, so chords are written as chords.',
          '**Full mixes are rough.** A whole band, a dense orchestra or a song with drums gives many wrong, missing and extra notes, because the model was not built to pull one song apart. For a mix, split out the part you want first, for instance with the [vocal remover](/tools/vocal-remover).',
          '**Expect to clean up.** Open the file in a DAW or notation program and fix the note starts, lengths and wrong notes by ear. Treat it as a head start on writing the notes down, not as a finished score.',
          '**Tempo is a guess.** The MIDI file carries one steady tempo, estimated from the audio, or the one you type. A recording that speeds up or slows down will not line up with a fixed grid.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I convert an MP3 to MIDI?',
        a: 'Drop the MP3 on this page and press Convert to MIDI. The page decodes the audio in your browser, an AI model finds the notes in it, and you download a standard .mid file you can open in a DAW, a notation program or a MIDI player. It takes an MP3 up to five minutes long.',
      },
      {
        q: 'Is my audio uploaded?',
        a: 'No. The recording is decoded and the notes are found in this tab, and neither the audio nor its file name is sent anywhere. What gets downloaded is the note model and the engine that runs it, both from this site, the first time you use the page.',
      },
      {
        q: 'What works best, and what does not?',
        a: 'Recordings of one instrument at a time: piano, guitar, a sung or hummed melody. A full band mix and drums turn out poorly, since drums are not pitched notes and a dense mix hides the melody. Pull out the one part you want to transcribe first, and expect to fix some notes by hand.',
      },
      {
        q: 'Why do I need to clean the result up in a DAW?',
        a: 'The model estimates notes from the sound, and it makes mistakes: notes in the wrong octave, short extra notes, missed quiet ones, and note starts a little off the beat. Open the .mid in your DAW, snap the notes to a grid, delete strays and fix what you can hear is wrong.',
      },
      {
        q: 'How big is the download, and how long does it take?',
        a: 'The note model is 0.2 MB and the engine that runs it is about 14 MB (less on the wire, since it is compressed). They are fetched once and kept for later visits. After that, on a recent laptop, a 30-second clip takes about a second and a five-minute file about ten seconds; a phone is slower.',
      },
      {
        q: 'Where does the tempo come from?',
        a: 'It is estimated from the audio with the same beat finder as the [BPM and key finder](/tools/bpm-key-finder), and is only a guess: if the clip has no steady beat, 120 is used. Type your own tempo in the options if you know it. The notes keep their real timing either way; only the grid they sit on changes.',
      },
      {
        q: 'Which model does it use?',
        a: 'Basic Pitch, an open-source model from Spotify’s Audio Intelligence Lab, under the Apache-2.0 licence, run on your device with onnxruntime-web. The page is powered by Spotify’s Basic Pitch and is not made or endorsed by Spotify. See the [licences page](/licenses) for the details.',
      },
    ],
  },
  {
    slug: 'tuner',
    icon: 'tuner',
    name: 'Online tuner',
    title: 'Online Tuner: Guitar, Bass, Ukulele, Chromatic, Private | Stayput',
    description:
      'Tune a guitar, bass, ukulele, violin or any instrument with your microphone. Note, cents and a needle, plus reference notes. Nothing is recorded or sent.',
    heading: 'Online tuner',
    tagline: 'Play a note and see how sharp or flat it is. Guitar, bass, ukulele, violin or chromatic, with the sound kept in your tab.',
    category: 'media',
    accept: '.txt',
    multiple: false,
    dropLabel: 'Start the tuner',
    action: 'Tune',
    keywords: ['online tuner', 'tuner', 'chromatic tuner', 'guitar tuner', 'bass tuner', 'ukulele tuner', 'violin tuner', 'tuner with microphone'],
    steps: [
      'Choose your instrument, or Chromatic for anything else, and press Start the tuner. Allow the microphone when your browser asks.',
      'Play one string or note and let it ring. The big letter is the note, and the needle shows how many cents sharp (right) or flat (left) it is.',
      'Turn the peg until the needle sits in the shaded middle and the text says In tune, then move to the next string.',
    ],
    faq: [
      {
        q: 'Is the sound recorded or uploaded?',
        a: 'No. The pitch is measured by code in this page from the live microphone input, a few times a second, and each reading is thrown away straight after. Nothing is saved, and the audio never leaves this tab.',
      },
      {
        q: 'How accurate is it?',
        a: 'Within a few cents on a clear, sustained note, which is close to the limit of what most ears can hear (a semitone is 100 cents, and the needle counts 5 cents either side as in tune). Let the string ring rather than plucking it repeatedly, and tune in a quiet room: other notes or chatter make the reading jump.',
      },
      {
        q: 'What does A4 = 440 Hz mean? Should I change it?',
        a: 'It is the pitch the whole scale is built from: the A above middle C vibrates 440 times a second. Almost all modern music uses 440. Change it only to match a piano or a recording tuned elsewhere, such as 442 for many orchestras, or 432 if you prefer that tuning.',
      },
      {
        q: 'Why does it jump around on my low strings?',
        a: 'A low string has few vibrations in each moment of sound, and a laptop microphone picks up little bass. Hold the phone or laptop close to the instrument, pluck firmly once and wait a moment for the reading to settle. If the needle never moves, check the microphone with the [mic test](/tools/mic-test). For an electric guitar or bass without an amp, a clip-on or pedal tuner will do better.',
      },
      {
        q: 'Can I tune without a microphone?',
        a: 'Yes. With an instrument chosen, press a string button to hear its note for two seconds, then tune your string until the two sound the same and the wobble between them slows to a stop.',
      },
    ],
  },
  {
    slug: 'metronome',
    icon: 'metronome',
    name: 'Metronome',
    title: 'Online Metronome with Tap Tempo, Free, No Ads | Stayput',
    description:
      'A steady online metronome: 20 to 300 BPM, any time signature, accented downbeat, eighths, triplets and sixteenths, and tap tempo. Works offline after one visit and a short wait.',
    heading: 'Online metronome',
    tagline: 'A steady click at any tempo, with the bar, the subdivisions and tap tempo, running on your device.',
    category: 'media',
    accept: '.txt',
    multiple: false,
    dropLabel: 'Start the metronome',
    action: 'Start',
    keywords: ['metronome', 'online metronome', 'metronome online', 'free metronome', 'metronome with tap tempo', 'bpm metronome', 'click track'],
    steps: [
      'Set the tempo with the slider, the minus and plus buttons, or by tapping Tap tempo along with a song.',
      'Choose the beats per bar (4 for most pop and rock, 3 for a waltz, 6 for a 6/8 jig) and whether to click the eighths, triplets or sixteenths too.',
      'Press Start or the space bar. The lights show where you are in the bar, and the first beat is accented.',
    ],
    faq: [
      {
        q: 'Does the click drift or stutter?',
        a: 'No. The clicks are scheduled a moment ahead on the sound card’s own clock (the Web Audio clock), not on page timers, so the beat stays steady even when the browser is busy. Changing the tempo while it plays keeps the next beat on time and carries on counting the bar.',
      },
      {
        q: 'How do I set a time signature like 6/8 or 7/8?',
        a: 'Set Beats per bar to the top number: 6 for 6/8, 7 for 7/8. For 6/8 many players prefer 2 beats per bar with Triplets, which gives the same six clicks with the stress on 1 and 4.',
      },
      {
        q: 'Will it keep running with the screen off or in another tab?',
        a: 'On a computer it usually keeps going in a background tab, because browsers do not slow down a page that is playing sound. On phones the browser may pause sound when the screen locks, so keep the screen on while you practise.',
      },
      {
        q: 'Does it work offline?',
        a: 'Yes. After one visit and a short wait the page is stored by your browser, so the metronome opens and runs with no connection, in a practice room or on a plane.',
      },
      {
        q: 'Is anything recorded?',
        a: 'No. The metronome only plays sound; it never uses the microphone. Nothing about your practice is stored or sent. To check a microphone before you record yourself playing along, use the [mic test](/tools/mic-test).',
      },
    ],
  },
  {
    slug: 'fill-pdf-form',
    icon: 'text',
    name: 'Fill PDF form',
    title: 'Fill PDF Forms Online Without Uploading, Free | Stayput',
    description:
      'Type into the fields of a fillable PDF form, tick its boxes and pick from its lists, then save the filled PDF. The form never leaves your device.',
    heading: 'Fill in a PDF form',
    tagline: 'Tax forms, applications and contracts carry your most personal details. Fill them in here and the file never leaves this device.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: false,
    dropLabel: 'Drop a fillable PDF form',
    action: 'Save filled PDF',
    keywords: ['fill pdf form', 'fill out pdf online', 'pdf form filler', 'fillable pdf', 'fill in pdf', 'type on pdf form', 'complete pdf form online'],
    steps: [
      'Drop a PDF form. Each page appears with its fields shaded, ready to type into.',
      'Click a box and type, tick the check boxes, and choose from the drop-down lists. Tab moves to the next field.',
      'Save the filled PDF. Tick Lock the answers first if the form should not be edited again.',
    ],
    faq: [
      {
        q: 'Can I add text, a highlight or an image to the PDF too?',
        a: 'Yes. [Edit PDF](/tools/edit-pdf) adds text, cover boxes, highlights, drawings and images to a page and rotates, deletes or reorders pages, all in your browser. It cannot change the text already in the file.',
      },
      {
        q: 'Is my form uploaded anywhere?',
        a: 'No. The PDF is opened, drawn and filled by code running in this tab, and the filled copy is saved straight to your device. Forms often hold your name, address, date of birth, and tax or ID numbers, which is exactly what should not go to a stranger’s server.',
      },
      {
        q: 'Why are there no boxes to type into?',
        a: 'The PDF has no fillable fields: it was saved as a flat page, or scanned. Use Sign PDF instead, which lets you type text, add the date and sign anywhere on the page.',
      },
      {
        q: 'What does “Lock the answers” do?',
        a: 'It flattens the form: the answers are drawn onto the page and the fields are removed, so the PDF looks the same everywhere and nobody can change what you typed. Leave it unticked if you or someone else still needs to edit the form.',
      },
      {
        q: 'Can I sign the form here?',
        a: 'Signature fields are shown but not filled here. Save the filled form, then open it in Sign PDF to draw or type your signature on the line.',
      },
      {
        q: 'Does it work with tax forms like the IRS W-9 or W-4?',
        a: 'Yes, the official IRS PDFs are ordinary fillable forms. A few government forms are built with an older Adobe technology (XFA) that only Adobe Reader can fill; for those the page says the PDF has no fillable fields.',
      },
    ],
  },
  {
    slug: 'blur-face-video',
    icon: 'blur',
    name: 'Blur faces in video',
    title: 'Blur Faces in a Video Automatically, No Upload | Stayput',
    description:
      'Blur or pixelate the faces in a video automatically, frame by frame, before you post it. MP4, MOV, WebM. The video never leaves your device.',
    heading: 'Blur faces in a video',
    tagline: 'Faces found and covered frame by frame, on your own device, for children, bystanders and anyone who did not agree to be filmed. Always watch the result before you share it.',
    category: 'media',
    accept: 'video/*,.mp4,.mov,.m4v,.webm,.mkv',
    multiple: true,
    dropLabel: 'Drop videos to hide the faces in',
    action: 'Blur faces',
    keywords: ['blur face in video', 'blur faces in video online', 'anonymize video', 'pixelate face in video', 'hide faces in video', 'face blur video', 'blur people in video'],
    steps: [
      'Drop one or more videos from your phone or camera.',
      'Choose how to cover the faces: blur, pixelate, a black box or an emoji, and how strong.',
      'Run it. Every frame is scanned for faces and covered; then watch the result through before you share it.',
    ],
    faq: [
      {
        q: 'Is the video uploaded?',
        a: 'No. The video is decoded, scanned and written again by code in this tab, with a face detector that runs on your device. That matters most for exactly the videos you would blur: children, a protest, a witness, people at work.',
      },
      {
        q: 'Will it catch every face?',
        a: 'It finds faces that look towards the camera, including small ones, about ten times a second, and keeps each one covered for half a second after it was last seen. Faces in profile, turned away, very small or behind glasses and masks can be missed for a moment, so always watch the result before you share it. The note under the result says how many frames had a face covered.',
      },
      {
        q: 'Blur, pixelate or black box: which hides best?',
        a: 'A black box or an emoji hides a face completely. Blur and pixelate at a high strength make a face unrecognisable to people, and look softer, but at a low strength someone who knows the person may still recognise them.',
      },
      {
        q: 'Does it keep the sound?',
        a: 'Yes, unless you tick Remove the sound. Voices, names said aloud and background noises can identify people too, so consider removing it for sensitive footage. To mark the finished video with your name or logo, use [Add watermark to video](/tools/add-watermark-to-video).',
      },
      {
        q: 'How long does it take?',
        a: 'Every frame is decoded, scanned and encoded again, so on a laptop a one-minute clip takes roughly one to a few minutes, depending on its resolution. Phones are slower. Keep the tab open until it finishes.',
      },
    ],
  },
  {
    slug: 'remove-silence',
    icon: 'scissors',
    name: 'Remove silence',
    title: 'Remove Silence from Audio Online, No Upload | Stayput',
    description:
      'Cut the long pauses out of a podcast, lecture or voice memo, and trim quiet starts and ends. MP3, WAV, M4A and more. The recording never leaves your device.',
    heading: 'Remove silence from audio',
    tagline: 'Shorter recordings without the dead air, made on your own device. Interviews and lectures stay private.',
    category: 'media',
    accept: 'audio/*,.mp3,.wav,.wave,.m4a,.aac,.ogg,.oga,.opus,.flac,.caf,.aiff,.aif,.webm',
    multiple: true,
    dropLabel: 'Drop recordings to take the silence out',
    action: 'Remove silence',
    keywords: ['remove silence from audio', 'cut silence from mp3', 'trim silence', 'remove pauses from audio', 'shorten pauses', 'remove dead air', 'silence remover'],
    steps: [
      'Drop one or more recordings.',
      'Choose what counts as silence, how long a pause must be before it is shortened, and how much pause to leave.',
      'Run it. The note says how much was taken out; listen through before you publish.',
    ],
    faq: [
      {
        q: 'Is my recording uploaded?',
        a: 'No. The sound is decoded, measured and written again by code in this tab. Lectures, interviews, therapy notes and calls stay on your device.',
      },
      {
        q: 'Which silence setting should I use?',
        a: 'Quiet (−40 dB) suits most recordings made with a headset or a phone held close. If the pauses carry a hum from a fan or traffic and nothing is removed, choose the noisy-room setting. For a studio recording with a very clean background, the near-total silence setting avoids clipping soft word endings.',
      },
      {
        q: 'Will it cut off quiet words or breaths?',
        a: 'Only pauses longer than the length you choose are touched, and the pause left behind is split evenly around the join, so word endings keep their tail. A short fade at each join stops clicks. If soft syllables get clipped, pick the near-total silence setting or leave a longer pause.',
      },
      {
        q: 'Can it do a video?',
        a: 'Not yet: this page works on sound. Take the sound out of a video with Video to MP3, then remove the silence from that.',
      },
    ],
  },
  {
    slug: 'image-to-svg',
    icon: 'pen',
    name: 'Image to SVG',
    title: 'Image to SVG Converter: Vectorize PNG, JPG | Stayput',
    description:
      'Trace a PNG or JPG into a real vector SVG of filled shapes, in black and white, a few flat colours or full detail. Preview before you download. Nothing is uploaded.',
    heading: 'Convert an image to SVG',
    tagline: 'Logos, drawings and signatures traced into shapes that scale to any size, on your own device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop images to trace into SVG',
    action: 'Convert to SVG',
    keywords: ['image to svg', 'convert image to svg', 'vectorize image', 'image to vector', 'raster to vector', 'bitmap to svg', 'trace image to svg'],
    steps: [
      'Drop one or more images. The first one is traced straight away, next to the original.',
      'Pick a style: black and white for cutting and stencils, few colours for logos, many colours for illustrations. Tick “Leave out white” for a transparent background.',
      'Press Convert to SVG and download the files.',
    ],
    faq: [
      {
        q: 'Is it a real vector, or a picture inside an SVG?',
        a: 'A real vector. Every area of colour is traced into a path of lines and curves, so it stays sharp at any size and can be edited node by node in Inkscape, Illustrator, Figma or Cricut Design Space. Some converters only wrap the original pixels in an SVG file, which is still blurry when enlarged.',
      },
      {
        q: 'Which images trace well?',
        a: 'Flat artwork with clear edges: logos, icons, line drawings, signatures, text and clip art. A photo can be traced with the Detailed style, but the result is a poster-like image made of thousands of shapes and is usually far larger than the JPG. Use the biggest, cleanest copy of the image you have; a small, blurry or heavily compressed JPG gives wobbly edges.',
      },
      {
        q: 'Are my images uploaded?',
        a: 'No. The image is decoded and traced by code running in this tab, in a background worker so the page stays responsive. Unreleased logos and client artwork stay on your device.',
      },
      {
        q: 'Can I change the number of colours?',
        a: 'Pick the style closest to what you need: Black and white uses exactly two, Logo reduces the image to at most 8 colours, and Detailed to at most 32. For a logo with a colour or two too many, try Logo first; the traced colours are averaged from your image, not picked from a fixed palette.',
      },
    ],
  },
  {
    slug: 'resize-gif',
    icon: 'resize',
    name: 'Resize GIF',
    title: 'Resize GIF to Exact Pixels or Percent, No Upload | Stayput',
    description:
      'Change a GIF’s width and height by percent or exact pixels in your browser. The animation and timing stay. Your GIF is not uploaded; no watermark.',
    heading: 'Resize a GIF',
    tagline: 'Set a new width and height for an animated GIF, by percent or in exact pixels. The animation plays as before, and the GIF stays on this device.',
    category: 'images',
    accept: 'image/gif,.gif',
    multiple: true,
    dropLabel: 'Drop GIFs to resize',
    action: 'Resize',
    sizeFact: 'No watermark. The limit is your device’s memory (phones hold less): a long or very large GIF may need a computer.',
    keywords: ['resize gif', 'gif resizer', 'resize gif online', 'change gif dimensions', 'resize animated gif', 'make gif bigger'],
    steps: [
      'Drop one or more GIFs, or tap to pick them.',
      'Choose a percentage, or type a width or height in pixels. Proportions are kept unless you switch that off.',
      'Resize. Each GIF keeps its timing and looping; one downloads straight away, several download as a zip.',
    ],
    faq: [
      {
        q: 'Does resizing change how fast the GIF plays?',
        a: 'No. Every frame keeps its own delay and the loop setting is copied, so a resized GIF lasts as long as the original and repeats the same way. Only the width and height change.',
      },
      {
        q: 'Can I make a GIF bigger?',
        a: 'Yes, up to 4096 pixels on the longer side, but the picture does not gain detail: a GIF drawn at 200 pixels wide looks soft at 800. The file also gets larger, because it holds more pixels. Making a GIF smaller than the original keeps the picture sharper than enlarging it does.',
      },
      {
        q: 'How do I resize a GIF without stretching it?',
        a: 'Leave Keep proportions ticked and type only the width or only the height. The other number follows. If you need an exact shape such as 100 by 100 from a wide GIF, untick it and choose Fill and crop to cut the extra from the sides, or Fit inside to leave transparent bars instead of cropping.',
      },
      {
        q: 'Why does the GIF keep its transparent background?',
        a: 'Transparent pixels stay transparent when frames are rewritten. If you pick Fit inside, the bars added around the picture are transparent too, so a page with a coloured background shows through them.',
      },
      {
        q: 'Can I resize a GIF to a size for Discord or Twitch?',
        a: 'Type the pixel size the platform asks for, such as 128 by 128. Those platforms also cap the file size in kilobytes, which resizing alone may not meet. The [emote resizer](/tools/emote-resizer) fits both size and limit in one step, and [Compress GIF](/tools/compress-gif) makes a GIF lighter without changing its dimensions.',
      },
      {
        q: 'Can I add a caption to a GIF?',
        a: 'Yes. [Add text to GIF](/tools/add-text-to-gif) draws a caption on every frame and keeps each frame’s timing and the loop.',
      },
      {
        q: 'Can I turn a GIF the other way up?',
        a: 'Yes. [Rotate GIF](/rotate-gif) turns an animated GIF by 90, 180 or 270 degrees, or flips it, and keeps every frame’s timing.',
      },
      {
        q: 'Is my GIF uploaded?',
        a: 'No. The GIF is read and rewritten by code running in this page, with no server in the process, and the limit is your device’s memory (phones hold less). The page keeps working offline after one visit and a short wait.',
      },
    ],
  },
  {
    slug: 'crop-gif',
    icon: 'crop',
    name: 'Crop GIF',
    title: 'Crop GIF Online to Any Box or Square, No Upload | Stayput',
    description:
      'Crop an animated GIF to a box you draw, a square or 16:9. Every frame is cropped and the timing stays. Your GIF is not uploaded; no watermark.',
    heading: 'Crop a GIF',
    tagline: 'Drag a box over the part of the animation you want to keep. Every frame is cropped to it, and the GIF never leaves this device.',
    category: 'images',
    accept: 'image/gif,.gif',
    multiple: false,
    dropLabel: 'Drop a GIF to crop',
    action: 'Crop',
    sizeFact: 'No watermark. The limit is your device’s memory (phones hold less): a long or very large GIF may need a computer.',
    keywords: ['crop gif', 'gif cropper', 'crop gif online', 'crop gif to square', 'crop animated gif', 'cut part of a gif'],
    steps: [
      'Drop a GIF, or tap to pick one. The first frame appears with a crop box.',
      'Drag the box into place and resize it from the corners, or pick a shape such as square, 16:9 or 9:16 and type exact pixels.',
      'Crop. The cropped GIF keeps its timing and looping and downloads from your browser.',
    ],
    faq: [
      {
        q: 'Does cropping make the GIF shorter?',
        a: 'No. Cropping removes parts of the picture, not parts of the time, so every frame is kept and the GIF lasts as long as before. To make a GIF play for less time, cut the video it came from with [Trim video](/tools/trim-video) and make a new GIF with [Video to GIF](/tools/video-to-gif).',
      },
      {
        q: 'How do I crop a GIF to a square?',
        a: 'Pick Square (1:1) in the Shape list. The box becomes the largest square that fits, centred; drag it to the part you want, or change the Left and Top numbers. The result is as many pixels wide as it is tall, such as 400 by 400.',
      },
      {
        q: 'Does cropping lower the picture quality?',
        a: 'The pixels inside the box are copied as they are, with no resizing. A GIF is limited to 256 colours per frame and each frame is written again, so keep Keep all colours selected if you want the colours to stay as close as possible to the original.',
      },
      {
        q: 'Can I crop a GIF into a circle?',
        a: 'Not yet. A GIF has no soft edges: a pixel is either fully shown or fully see-through, so a circle would come out with jagged edges. Crop it to a square here, then use the shape your site or app offers.',
      },
      {
        q: 'Can I crop on an iPhone?',
        a: 'The page works in a mobile browser, and the crop box is built for touch: pick the GIF from Files or Photos, then drag the box with your finger. Drag the corners to resize it, or pick a shape and type exact numbers.',
      },
      {
        q: 'Can I add text to a GIF?',
        a: 'Yes. [Add text to GIF](/tools/add-text-to-gif) draws a caption on every frame and keeps each frame’s timing and the loop. Crop first if you want the caption placed against the cropped edges.',
      },
      {
        q: 'Can I save the frames of a GIF as pictures?',
        a: 'Yes. [Split GIF](/split-gif) saves every frame of an animated GIF as a PNG, one by one or as a ZIP, with each frame’s delay.',
      },
      {
        q: 'Can I rotate a GIF as well?',
        a: 'Yes. [Rotate GIF](/rotate-gif) turns an animated GIF by 90, 180 or 270 degrees, or flips it, and keeps every frame’s timing.',
      },
      {
        q: 'Is my GIF uploaded?',
        a: 'No. The GIF is decoded and cropped by code running in this page, with no server in the process, and the limit is your device’s memory (phones hold less). The page keeps working offline after one visit and a short wait.',
      },
    ],
  },
  {
    slug: 'gif-speed',
    icon: 'speed',
    name: 'Change GIF speed',
    title: 'Change GIF Speed or Reverse a GIF, No Upload | Stayput',
    description:
      'Speed up, slow down or reverse an animated GIF in your browser. Every frame’s timing is rescaled and the loop kept. Your GIF is not uploaded; no watermark.',
    heading: 'Change GIF speed or play it backwards',
    tagline: 'Make an animated GIF faster or slower, or play it in reverse. Done on this device, and the GIF is not uploaded.',
    category: 'images',
    accept: 'image/gif,.gif',
    multiple: true,
    dropLabel: 'Drop GIFs to speed up, slow down or reverse',
    action: 'Change GIF',
    sizeFact: 'No watermark. The limit is your device’s memory (phones hold less): a long or very large GIF may need a computer.',
    keywords: ['change gif speed', 'gif speed changer', 'speed up gif', 'slow down gif', 'reverse gif', 'gif reverser'],
    steps: [
      'Drop one or more animated GIFs, or tap to pick them.',
      'Choose a speed from 0.25× to 4×, and tick Play it backwards to reverse the order of the frames.',
      'Press Change GIF. Each GIF keeps its size and loop setting; one downloads straight away, several download as a zip.',
    ],
    faq: [
      {
        q: 'How fast can a GIF go?',
        a: 'Browsers show a frame time under 0.02 seconds as about 0.1 seconds, so every frame is held to at least 0.02 seconds. A GIF that is already very fast cannot be made much faster, and speeding it up further only shortens the frames that were longer.',
      },
      {
        q: 'Does reversing keep each frame’s timing?',
        a: 'Yes. The frames are written last to first, and each one takes its own time with it, so a pause on the last frame becomes a pause on the first. The loop setting is copied as it was.',
      },
      {
        q: 'Can I speed up and reverse at once?',
        a: 'Yes. Pick a speed and tick Play it backwards in the same run. The file name says which you chose, such as -reversed-2x.',
      },
      {
        q: 'Is my GIF uploaded?',
        a: 'No. The GIF is decoded and rewritten by code running in this page, with no server in the process, and the limit is your device’s memory (phones hold less). The page keeps working offline after one visit and a short wait.',
      },
    ],
  },
  {
    slug: 'gif-rotate',
    icon: 'rotate',
    name: 'Rotate GIF',
    title: 'Rotate or Flip a GIF: 90, 180, 270 Degrees, No Upload | Stayput',
    description:
      'Rotate an animated GIF by 90, 180 or 270 degrees, or flip it horizontally or vertically, in your browser. Timing and loop stay. Not uploaded; no watermark.',
    heading: 'Rotate or flip a GIF',
    tagline: 'Turn an animated GIF a quarter, half or three-quarter turn, or mirror it. Every frame keeps its timing, and the GIF stays on this device.',
    category: 'images',
    accept: 'image/gif,.gif',
    multiple: true,
    dropLabel: 'Drop GIFs to rotate or flip',
    action: 'Rotate',
    sizeFact: 'No watermark. The limit is your device’s memory (phones hold less): a long or very large GIF may need a computer.',
    keywords: ['rotate gif', 'rotate gif online', 'flip gif', 'rotate animated gif', 'mirror gif', 'turn gif sideways'],
    steps: [
      'Drop one or more animated GIFs, or tap to pick them.',
      'Choose 90° right, 180° or 90° left, and tick a flip if you want one.',
      'Press Rotate. Each GIF keeps its frames, timing and loop; one downloads straight away, several download as a zip.',
    ],
    faq: [
      {
        q: 'Does rotating a GIF keep it animated?',
        a: 'Yes. Every frame is turned and written back with its own delay, and the loop setting is copied, so the result plays exactly as the original did, only turned.',
      },
      {
        q: 'Why do the width and height swap?',
        a: 'A quarter turn makes a landscape GIF portrait and the other way round, so a 400 by 300 GIF comes out 300 by 400. A half turn keeps the size.',
      },
      {
        q: 'Is the turn clockwise?',
        a: '90° right is clockwise and 90° left is counter-clockwise. The flip is applied after the turn: horizontal mirrors left to right, vertical mirrors top to bottom.',
      },
      {
        q: 'Is my GIF uploaded?',
        a: 'No. The GIF is decoded and rewritten by code running in this page, with no server in the process, and the limit is your device’s memory (phones hold less). The page keeps working offline after one visit and a short wait.',
      },
    ],
  },
  {
    slug: 'gif-frame-splitter',
    icon: 'grid',
    name: 'GIF frame splitter',
    title: 'Split a GIF into Frames: Save Each as PNG, No Upload | Stayput',
    description:
      'Split an animated GIF into its frames in your browser. See each frame’s delay, save one as a PNG or all as a ZIP. Frames are whole pictures. No upload.',
    heading: 'Split a GIF into frames',
    tagline: 'Pull every frame out of an animated GIF as a PNG, with each frame’s delay. It stays on this device.',
    category: 'images',
    accept: 'image/gif,.gif',
    multiple: true,
    dropLabel: 'Drop a GIF to split into frames',
    action: 'Split GIF',
    sizeFact: 'No watermark. The limit is your device’s memory (phones hold less): a long or very large GIF may need a computer.',
    keywords: ['split gif', 'gif frame splitter', 'gif to png frames', 'extract frames from gif', 'gif to frames', 'gif splitter', 'split gif into frames'],
    steps: [
      'Drop an animated GIF, or tap to pick one.',
      'Press Split GIF. The frame count and total time show above the frames, and each frame lists its delay.',
      'Save one frame as a PNG, or all of them as a zip named frame-001.png, frame-002.png and so on.',
    ],
    faq: [
      {
        q: 'Are the frames whole pictures?',
        a: 'Yes. Many GIFs store only the part that changed from one frame to the next. Each frame here is drawn the way a browser plays the GIF, with the earlier frames and the disposal rules applied, so every PNG is the full picture.',
      },
      {
        q: 'Do I get each frame’s timing?',
        a: 'Yes. Every frame lists its delay in milliseconds, and the total shows above them. A delay of 10 ms or less is shown as 100 ms, which is how browsers play it.',
      },
      {
        q: 'Can I put the frames back together?',
        a: 'Yes. [GIF maker](/tools/gif-maker) builds a GIF from pictures, so you can edit frames and join the ones you keep. To play a GIF backwards without splitting it, use [Reverse GIF](/reverse-gif).',
      },
      {
        q: 'Is my GIF uploaded?',
        a: 'No. The GIF is decoded by code running in this page, with no server in the process, and the limit is your device’s memory (phones hold less). The page keeps working offline after one visit and a short wait.',
      },
    ],
  },
  {
    slug: 'add-text-to-gif',
    icon: 'text',
    name: 'Add text to GIF',
    title: 'Add Text to GIF Online, Free, No Upload | Stayput',
    description:
      'Add a caption to an animated GIF in your browser: type it, drag it into place, pick a font, colour and outline. Free, no account, not uploaded.',
    heading: 'Add text to a GIF',
    tagline: 'Write a caption on every frame of an animated GIF and drag it where you want it. Done on this device, and the GIF is not uploaded.',
    category: 'images',
    accept: 'image/gif,.gif',
    multiple: false,
    dropLabel: 'Drop a GIF to add text to',
    action: 'Add text',
    sizeFact: 'No watermark. The limit is your device’s memory (phones hold less): a long or very large GIF may need a computer.',
    keywords: ['add text to gif', 'caption a gif', 'write on gif', 'gif caption maker', 'put text on a gif', 'text on gif online', 'add words to gif'],
    lead:
      'Writes your text on every frame of an animated GIF, in the font, colour and outline you choose, and saves a new GIF that keeps each frame’s timing and the loop setting. It is free, needs no account and adds no watermark, and your GIF is not uploaded: every frame is drawn and rewritten by code in this tab. The size limit is your device’s memory, and phones hold less; after one visit and a short wait the page works offline.',
    steps: [
      'Drop an animated GIF, or tap to pick one.',
      'Type your text, then drag it on the preview to place it. Pick a font, colour, size and an outline, shadow or box so it reads on every frame. Add a second text for a caption at the other end.',
      'Press Add text. The text is drawn on every frame, and the new GIF downloads with the same size and timing.',
    ],
    sections: [
      {
        heading: 'A worked example',
        paragraphs: [
          'You have reaction.gif, 480 by 270 pixels with 40 frames, and you want WHEN THE BUILD PASSES across the bottom. Drop it, type the words, drag them to the bottom edge, choose the bold font with an outline so they stay readable over the changing picture, and set the size to 12.',
          'The size is a share of the shorter side, so 12 on a GIF 270 pixels high gives letters 32 pixels tall. Press Add text. The same words are drawn in the same place on all 40 frames, and you download reaction-text.gif: 480 by 270 pixels, playing at the same speed as the original.',
        ],
      },
      {
        heading: 'What you can set',
        bullets: [
          'Up to two pieces of text, for example a top and a bottom caption, each dragged to where you want it.',
          'Font: a clean sans, a bold face, a serif, a handwritten face or a monospace.',
          'Colour, size, opacity, upper case, and an outline, a shadow or a box behind the letters.',
        ],
      },
      {
        heading: 'What this page does not do',
        bullets: [
          'The text is the same on every frame. It cannot appear for only part of the animation, and it does not move.',
          'It works on one GIF at a time. A long or very large GIF uses a lot of memory, and a phone may run out of it sooner than a computer.',
          'The result is a GIF, so each frame holds at most 256 colours. To make the file lighter afterwards, use [Compress GIF](/tools/compress-gif).',
        ],
      },
    ],
    faq: [
      { q: 'How do I add text to a GIF?', a: 'Drop the GIF, type your text and drag it to where you want it on the preview. Choose a font, colour, size and an outline, then press Add text. The text is drawn on every frame, and the new GIF downloads with the same size and timing.' },
      { q: 'Does the text appear on every frame?', a: 'Yes, in the same place and style on all of them. This page cannot show text for only part of the animation or move it.' },
      { q: 'Does it change how fast the GIF plays?', a: 'No. Every frame keeps its own delay and the loop setting is copied, so the new GIF lasts as long as the original and repeats the same way. Frames with a delay of 10 milliseconds or less are written as 100 milliseconds, which is how browsers already play them.' },
      { q: 'Will the colours or the file size change?', a: 'They can. A GIF holds at most 256 colours per frame, and the whole GIF is written again with your text on it, so smooth gradients and soft shadows can look a little different, and the file can come out larger or smaller than the original. [Compress GIF](/tools/compress-gif) makes a GIF lighter afterwards.' },
      { q: 'Which fonts can I use?', a: 'A clean sans, a bold face, a serif, a handwritten face and a monospace. The sans and the handwritten face are this site’s own fonts; the bold face, the serif and the monospace are drawn with the fonts your device has, so they can look a little different on a phone than on a computer. Once the GIF is saved the letters are pixels and look the same everywhere.' },
      { q: 'Can I add text to a GIF with a transparent background?', a: 'Yes, and transparent areas stay transparent. GIF transparency is on or off, so where text sits over a transparent area its edges can look rough. Choose an outline or a box to make it read cleanly.' },
      { q: 'Can I add text to a GIF without uploading it?', a: 'Yes. Your browser reads the GIF, draws your text onto every frame and writes the new GIF with code running in this tab. Open the network tab, run it, and your GIF is not among the requests. After one visit and a short wait the page works offline.' },
      { q: 'Can I add text to a photo or a video instead?', a: 'For a photo or a screenshot, use [Add text to image](/tools/add-text-to-image). To turn a video clip into a GIF first, use [Video to GIF](/tools/video-to-gif).' },
    ],
  },
  {
    slug: 'merge-gifs',
    icon: 'merge',
    name: 'Merge GIFs',
    title: 'Merge GIFs: Join Several GIFs into One, No Upload | Stayput',
    description: 'Join two or more animated GIFs into one GIF, in the order you set. Different sizes are fitted for you. Free, no account, and your GIFs are not uploaded.',
    heading: 'Merge GIFs into one',
    tagline: 'Join several animated GIFs end to end, in the order you choose. They are put together on this device, and the GIFs are not uploaded.',
    category: 'images',
    accept: 'image/gif,.gif',
    multiple: true,
    dropLabel: 'Drop the GIFs to merge',
    action: 'Merge GIFs',
    sizeFact: 'No watermark. The limit is your device’s memory (phones hold less): long or large GIFs may need a computer.',
    keywords: ['merge gifs', 'combine gifs', 'join gifs', 'merge gif online', 'combine gifs into one', 'put gifs together', 'concatenate gifs'],
    lead: 'Joins two or more animated GIFs into one GIF that plays them one after another, in the order you set, and saves it as a new GIF. Every frame keeps its own timing, and a GIF of another size is fitted to the size of the first one. It is free, needs no account and adds no watermark, and your GIFs are not uploaded: they are read and rewritten by code in this tab. The limit is your device’s memory, and phones hold less; after one visit and a short wait the page works offline.',
    steps: [
      'Drop two or more GIFs, or tap to pick them. Put them in order with the arrows in the list. The first one sets the size.',
      'If a GIF is a different shape, choose Fit inside to show all of it with bars of a colour you pick, or Fill and crop to cover the frame and trim the edges.',
      'Press Merge GIFs. The frames are joined in that order, and the new GIF downloads from your browser.',
    ],
    sections: [
      {
        heading: 'A worked example',
        paragraphs: [
          'You have intro.gif, 480 by 270 pixels with 30 frames at 0.1 seconds each, and loop.gif, 400 by 400 pixels with 20 frames at 0.05 seconds each. Drop intro.gif first and loop.gif second. The first GIF sets the size, so the result is 480 by 270.',
          'loop.gif is square, so Fit inside shrinks it to 270 by 270 and puts it in the middle, with a white bar 105 pixels wide on each side. Press Merge GIFs and you download merged.gif: 480 by 270 pixels, 3 seconds of intro followed by 1 second of loop, 4 seconds in all.',
        ],
      },
      {
        heading: 'What you can set',
        bullets: [
          'The order, with the arrows in the file list. The first GIF sets the size of the result.',
          'Fit inside, which shows all of each GIF, or Fill and crop, which covers the frame and trims what overflows from the centre.',
          'The colour of the bars that Fit inside leaves, white to start with, or transparent.',
        ],
      },
      {
        heading: 'What this page does not do',
        bullets: [
          'The GIFs play straight after one another. There is no transition between them and no pause, and it does not change how fast any of them plays.',
          'The result is one GIF, so each frame holds at most 256 colours. To make the file lighter afterwards, use [Compress GIF](/tools/compress-gif).',
          'It joins GIFs only. For a video clip, use [Video to GIF](/tools/video-to-gif) first, and for still pictures, use the [GIF maker](/tools/gif-maker).',
          'Every frame is held in memory while the new GIF is written, so a long or large result may need a computer, and a phone may run out of memory sooner.',
        ],
      },
    ],
    faq: [
      { q: 'How do I merge GIFs into one?', a: 'Drop two or more GIFs, put them in the order you want with the arrows in the list, and press Merge GIFs. The frames of the second GIF follow the last frame of the first, and so on, and the new GIF downloads with each frame’s own timing.' },
      { q: 'What happens when the GIFs are different sizes?', a: 'The first GIF in the list sets the size of the result, so put the one whose shape you want first. Every other GIF is fitted inside that size without being stretched, and the space left over becomes bars in a colour you choose, white to start with. A smaller GIF is enlarged to fit, which can make it look soft. Choose Fill and crop to cover the frame instead, which trims the edges from the centre. For a size you pick yourself, merge first and then use [Resize GIF](/tools/resize-gif).' },
      { q: 'Does the merged GIF keep each GIF’s speed?', a: 'Yes. Every frame keeps its own delay, so each part plays as fast as it did before and the merged GIF lasts as long as the originals added together. Frames with a delay of 10 milliseconds or less are written as 100 milliseconds, which is how browsers already play them. Two frames that look the same side by side may be written as one frame shown for longer, so the frame count can be lower while the length stays the same.' },
      { q: 'What happens to a GIF with a transparent background?', a: 'With a bar colour chosen, transparent areas are filled with that colour, so the result is a solid picture and a smaller file. To keep transparency, set the bars to transparent. GIF transparency is on or off, so soft edges can look rough over a coloured page.' },
      { q: 'Will the merged GIF loop?', a: 'It follows the loop setting of the first GIF in the list: if that GIF repeats forever, so does the merged one, and it repeats as a whole, from the first GIF to the last. If the first GIF plays once, the merged GIF plays once.' },
      { q: 'Will the colours or the file size change?', a: 'They can. A GIF holds at most 256 colours per frame, and the frames are written again, so smooth gradients can look a little different. The file is usually about as large as the originals together, and a GIF fitted to a larger size comes out bigger. [Compress GIF](/tools/compress-gif) makes a GIF lighter afterwards.' },
      { q: 'How many GIFs, or how long, can I merge?', a: 'The limit is your device’s memory, and phones hold less. Every frame of the merged GIF is held in memory while the file is written, so many GIFs, a long result or a large first GIF may need a computer. If the page says it is too large, merge fewer GIFs at a time, or make them smaller first with [Resize GIF](/tools/resize-gif).' },
      { q: 'Can I merge GIFs without uploading them?', a: 'Yes. Your browser reads each GIF, joins the frames and writes the new GIF with code running in this tab. Open the network tab, run it, and your GIFs are not among the requests. After one visit and a short wait the page works offline.' },
      { q: 'Can I merge a GIF with a video or a photo?', a: 'Not on this page, which takes GIFs only. To turn a video clip into a GIF first, use [Video to GIF](/tools/video-to-gif). To make a GIF from still pictures, use the [GIF maker](/tools/gif-maker), then merge the result here.' },
    ],
  },
  {
    slug: 'gif-maker',
    icon: 'film',
    name: 'GIF maker',
    title: 'GIF Maker: Make an Animated GIF from Images, No Upload | Stayput',
    description:
      'Make an animated GIF from photos, screenshots or drawings. Set the order, the time per picture, the size and the loop, with a live preview. Nothing is uploaded.',
    heading: 'Make a GIF from images',
    tagline: 'Your pictures turned into one looping GIF, put together on this device, with no watermark.',
    taglineMd: 'Your pictures turned into one looping GIF, put together on this device, with no watermark. Want sound or a bigger file? Make a video with the [photo slideshow maker](/tools/photo-slideshow-maker).',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop the pictures for your GIF',
    action: 'Make GIF',
    sizeFact: 'No watermark. Up to 300 pictures; the limit is your device’s memory (phones hold less).',
    keywords: ['gif maker', 'make a gif', 'animated gif maker', 'create gif from images', 'photo to gif', 'gif creator', 'make gif from pictures'],
    steps: [
      'Drop two or more pictures. Put them in order with the arrows in the list.',
      'Choose the time each picture stays on screen, the width, and whether the GIF loops. The preview plays as the GIF will.',
      'Press Make GIF and download it.',
    ],
    faq: [
      {
        q: 'Are my pictures uploaded?',
        a: 'No. They are decoded, resized and turned into GIF frames by code in this tab. Family photos, screenshots of work and unreleased product shots stay on your device.',
      },
      {
        q: 'Why do the colours look a little grainy?',
        a: 'A GIF frame can hold at most 256 colours, so a photo with smooth gradients, such as a sky, shows some banding. Each frame gets its own best 256 colours, which keeps faces and products close to the original. For full colour, a short MP4 is the better format; make the GIF, then turn it into a video with GIF to MP4.',
      },
      {
        q: 'My pictures are different sizes. What happens?',
        a: 'The GIF takes the shape of the first picture. Others are either shown whole with a background colour around them, or scaled up to fill the frame with their edges cropped; you choose which. Put the picture whose shape you want first.',
      },
      {
        q: 'How big will the GIF be?',
        a: 'Roughly the number of frames times the frame size, since GIF compression is weak on photos. Twenty photos at 480 pixels wide come to about 1 to 3 MB. Choose 320 pixels for a smaller file, or fewer pictures; the note under the download gives the exact size.',
      },
      {
        q: 'How do I add sound, or get a bigger file?',
        a: 'Make a video instead. The [Photo slideshow maker](/tools/photo-slideshow-maker) turns the same pictures into an MP4 with a song, a crossfade and the shape of your choice.',
      },
    ],
  },
  {
    slug: 'flatten-pdf',
    icon: 'pdf',
    name: 'Flatten PDF',
    title: 'Flatten PDF Online: Lock Form Fields, No Upload | Stayput',
    description:
      'Flatten a filled-in PDF form, comments, stamps and signatures into the page so they show the same everywhere and cannot be edited. Text stays selectable. No upload.',
    heading: 'Flatten a PDF',
    tagline: 'Filled-in forms, comments and signatures pressed into the page, on your own device, before you send it.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: true,
    dropLabel: 'Drop PDFs to flatten',
    action: 'Flatten PDF',
    keywords: ['flatten pdf', 'flatten pdf form', 'flatten pdf online', 'lock pdf form fields', 'flatten annotations', 'make pdf non editable', 'flatten fillable pdf'],
    steps: [
      'Drop one or more PDFs: a filled-in form, a marked-up draft, a signed contract.',
      'Choose Fields and annotations to keep the text selectable, or Whole pages as images for a copy with nothing left to edit.',
      'Press Flatten PDF and send the flattened copy. Keep your original if you might need to change an answer.',
    ],
    faq: [
      {
        q: 'What does flattening a PDF do?',
        a: 'Form fields, comments, highlights, stamps, drawings and many electronic signatures sit on top of the page as separate layers that a PDF app can move, change or hide. Flattening draws each one into the page itself and removes the layer, so every reader shows exactly the same thing and the answers can no longer be typed over.',
      },
      {
        q: 'When do I need to flatten?',
        a: 'When the recipient must see exactly what you filled in. A form filled in one app can show empty boxes in another, and some court e-filing systems and application portals reject PDFs that still have fillable fields. Flattening before you print, merge or upload avoids both.',
      },
      {
        q: 'Is my PDF uploaded?',
        a: 'No. pdf-lib and pdf.js run in this tab, so tax forms, contracts and medical paperwork never leave your device.',
      },
      {
        q: 'Can I undo it?',
        a: 'Not in the flattened copy: the fields are gone and their answers are part of the page. Your original file is not changed, so keep it if you may need to edit the form again.',
      },
    ],
  },
  {
    slug: 'resize-pdf',
    icon: 'resize',
    name: 'Resize PDF pages',
    title: 'Resize PDF Page Size: A4, Letter, Legal, A3, No Upload | Stayput',
    description:
      'Change the page size of a PDF to A4, US Letter, Legal, A3, A5 or Tabloid, with the content scaled to fit and centred. Text stays sharp and links keep working. No upload.',
    heading: 'Change the page size of a PDF',
    tagline: 'Every page moved onto new paper, the content scaled to fit, on your own device.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: true,
    dropLabel: 'Drop PDFs to resize',
    action: 'Resize PDF',
    keywords: ['resize pdf', 'change pdf page size', 'pdf page size', 'scale pdf', 'resize pdf pages', 'pdf to a4', 'pdf to letter size'],
    steps: [
      'Drop one or more PDFs.',
      'Pick the new page size, the orientation and an optional margin.',
      'Press Resize PDF. The note says how much the content was scaled.',
    ],
    faq: [
      {
        q: 'Does resizing make the text blurry?',
        a: 'No. The pages are not turned into pictures: the same text and drawings are placed on the new page with a scale, so they stay sharp at any zoom and can still be selected and searched.',
      },
      {
        q: 'Will the content be stretched?',
        a: 'Never. It keeps its proportions and is scaled to the largest size that fits, then centred. When the new paper has a different shape, the leftover space becomes a white band at the sides or at the top and bottom.',
      },
      {
        q: 'What happens to links, form fields and comments?',
        a: 'They move and scale with the content, so a link still sits over its words and a form can still be filled in.',
      },
      {
        q: 'Is my PDF uploaded?',
        a: 'No. pdf-lib rewrites the page sizes in this tab, so contracts, CVs and statements stay on your device.',
      },
    ],
  },
  {
    slug: 'transcribe',
    icon: 'text',
    name: 'Transcribe audio to text',
    title: 'Transcribe Video to Text: Free, Private, No Upload | Stayput',
    description:
      'Turn speech in an MP3, WAV, M4A, MP4 or MOV into text, SRT subtitles or WebVTT captions with Whisper running on your device. 16+ languages, no upload, no account.',
    heading: 'Transcribe audio and video to text',
    tagline: 'Speech to text and subtitles made by an AI model running in this tab. Interviews, lectures and voice notes are never uploaded.',
    category: 'media',
    accept: 'audio/*,video/*,.mp3,.wav,.wave,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm,.mp4,.mov,.m4v,.mkv',
    multiple: true,
    dropLabel: 'Drop recordings or videos to transcribe',
    action: 'Transcribe',
    keywords: ['transcribe audio to text', 'audio to text', 'speech to text', 'transcribe video', 'mp3 to text', 'voice memo to text', 'whisper transcription online', 'transcription without upload'],
    steps: [
      'Drop one or more recordings or videos.',
      'Pick the spoken language (or let it detect it), and whether you want text, SRT subtitles or WebVTT captions.',
      'Press Transcribe. The first run downloads the speech model and its engine once; the transcript appears with a Copy button and downloads as a file.',
    ],
    faq: [
      {
        q: 'Is my recording uploaded?',
        a: 'No. The sound is decoded in this tab and the Whisper speech model runs in your browser, so interviews, medical dictation, meetings and voice notes stay on your device. What gets downloaded is the speech model and the engine that runs it (model and runtime), both from this site, the first time: about 77 MB for the model, or 95 MB on computers with WebGPU.',
      },
      {
        q: 'How accurate is it?',
        a: 'This is Whisper base, OpenAI’s small multilingual model, compressed to run in a browser. Clear speech in English and other widely spoken languages comes out well; strong accents, crosstalk, music and technical names cause mistakes. Read the transcript through before you publish it.',
      },
      {
        q: 'How long does it take?',
        a: 'It depends on your device. On a recent laptop, ten minutes of sound takes about two to three minutes, or about one minute on a computer with WebGPU, plus a few seconds to load the model; on a phone it is several times slower. Keep the tab open while it works.',
      },
      {
        q: 'Can it make subtitles for a video?',
        a: 'Yes. Choose Subtitles (.srt) for YouTube, Premiere, DaVinci Resolve, VLC and most players, or Web captions (.vtt) for a web page’s track element. Each caption is timed to the speech.',
      },
      {
        q: 'Does it tell speakers apart?',
        a: 'No. It writes what is said, not who said it. Long pauses start a new paragraph in the text version, which usually falls where the speaker changes.',
      },
      {
        q: 'Can I turn a video into text?',
        a: 'Yes. Drop an MP4, MOV, M4V, MKV or WebM file and choose Text (.txt): only the soundtrack is read, in this tab, and the video is not uploaded. For a recorded lecture or a Zoom MP4 there is a page set up for it, [Video to text](/video-to-text). For timed captions instead of paragraphs, use [Video to subtitles](/video-to-subtitles); for sound-only files, [Audio to text](/audio-to-text).',
      },
    ],
  },
  {
    slug: 'add-subtitles-to-video',
    icon: 'video',
    name: 'Add subtitles to video',
    title: 'Add Subtitles to a Video: Burned In, No Upload | Stayput',
    description:
      'Burn captions into an MP4, MOV or WebM: written from the speech by Whisper on your device, or from your own SRT or VTT file. Three looks, no watermark, no upload.',
    heading: 'Add subtitles to a video',
    tagline: 'Captions written from the speech and burned into the picture, on your own device. Or bring an SRT and burn in that.',
    category: 'media',
    accept: 'video/*,.mp4,.mov,.m4v,.webm,.mkv,.srt,.vtt',
    multiple: true,
    dropLabel: 'Drop a video, and an SRT or VTT file if you have one',
    action: 'Add subtitles',
    sizeFact: 'No watermark. On a phone, a video over about 200 MB (2 minutes of iPhone video) may run out of memory',
    keywords: ['add subtitles to video', 'auto caption video', 'burn subtitles into video', 'hardcode subtitles', 'add captions to video', 'srt to video', 'open captions', 'subtitles without upload'],
    steps: [
      'Drop a video. To use subtitles you already have, drop the SRT or VTT file with it.',
      'Choose the look, size and place of the captions, and the spoken language if detection gets it wrong.',
      'Press Add subtitles. Without a subtitle file, the speech model writes them first (it downloads once); then every frame is drawn with its caption and the video is saved as a new file.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. The soundtrack is transcribed by a speech model running in this tab, and the frames are redrawn and encoded by your browser’s own video encoder. What gets downloaded is the speech model and the engine that runs it (model and runtime), both from this site, the first time: about 77 MB for the model, or 95 MB on computers with WebGPU.',
      },
      {
        q: 'What is the difference between burned-in and separate subtitles?',
        a: 'Burned-in (open) captions are part of the picture, so they show everywhere the video plays, including Instagram, TikTok and messaging apps that ignore subtitle files. They cannot be turned off or edited afterwards. For captions viewers can switch on and off, make an SRT with Video to subtitles and upload it alongside the video.',
      },
      {
        q: 'Can I fix mistakes before they are burned in?',
        a: 'Yes. Tick Also save the subtitles as an SRT file, correct the words in any text editor, then drop the video again with the corrected SRT: your file is used as it is, and nothing is transcribed.',
      },
      {
        q: 'How long does it take?',
        a: 'Writing the captions takes about two to three minutes for every ten minutes of speech on a laptop, or about one minute on a computer with WebGPU. Redrawing and encoding the video then depends on its length and resolution and on your device’s video encoder. Keep the tab open while it works.',
      },
      {
        q: 'Is there a watermark or a length limit?',
        a: 'No watermark. The limit is your device’s memory, since the new video is built in the tab; on a phone, a video over about 200 MB (2 minutes of iPhone video) may run out of memory.',
      },
    ],
  },
  {
    slug: 'vocal-remover',
    icon: 'mic',
    name: 'Vocal remover',
    title: 'Vocal Remover: Karaoke and Acapella, No Upload | Stayput',
    description:
      'Remove vocals from a song for karaoke, or keep only the vocals for an acapella. An AI separation model runs on your device. MP3, WAV, M4A, FLAC or video in; no upload, no account.',
    heading: 'Vocal remover',
    tagline: 'Split a song into the music and the voice with an AI model running in this tab. Karaoke tracks and acapellas without uploading anything.',
    category: 'media',
    accept: 'audio/*,video/*,.mp3,.wav,.wave,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm,.mp4,.mov,.m4v,.mkv',
    multiple: true,
    dropLabel: 'Drop songs to separate',
    action: 'Separate',
    keywords: ['vocal remover', 'remove vocals from song', 'karaoke maker', 'acapella extractor', 'instrumental maker', 'isolate vocals', 'stem splitter', 'vocal remover without upload'],
    steps: [
      'Drop one or more songs, or videos with music.',
      'Choose what to keep: the music without the vocals, the vocals alone, or both as two files, and MP3 or WAV.',
      'Press Separate. The first run downloads the model and its engine once; each song is split in pieces and the files download when it is done.',
    ],
    faq: [
      {
        q: 'Is my song uploaded?',
        a: 'No. The song is decoded in this tab and the separation model runs on your device, so unreleased demos, stems for a client and your own recordings stay with you. What gets downloaded is the separation model and the engine that runs it, both from this site, the first time.',
      },
      {
        q: 'How good is the separation?',
        a: 'It uses UVR-MDX-NET Inst HQ 3, one of the models Ultimate Vocal Remover offers for instrumentals, so the music usually comes out clean enough to sing over. Heavy reverb, backing vocals mixed like instruments and very distorted recordings leave faint traces of voice, and the acapella can carry a little of the drums.',
      },
      {
        q: 'Why is it slow on my computer?',
        a: 'The model does a lot of arithmetic. Browsers with WebGPU (recent Chrome and Edge on computers, Safari 26) run it on the graphics chip, which is many times faster. Without WebGPU it runs on the CPU and takes several times as long as the song, with the time left shown as it goes. Keep the tab open until it finishes.',
      },
      {
        q: 'Can it split drums and bass too?',
        a: 'No, this model makes two parts: vocals and everything else.',
      },
      {
        q: 'Can I use the result?',
        a: 'For practice, karaoke at home, remixes of your own songs and study, yes. Separating a track does not change who owns it: publishing an instrumental or acapella of someone else’s song still needs their permission. To sing over the karaoke track, check your microphone first with the [mic test](/tools/mic-test).',
      },
    ],
  },
  {
    slug: 'video-background-remover',
    icon: 'cutout',
    name: 'Video background remover',
    title: 'Remove or Blur a Video Background, Free, No Upload | Stayput',
    description:
      'Remove the background behind the person in a video: blur it, fill it with a colour or green screen, or put a picture behind them. An AI person finder runs on your device; no upload, no watermark.',
    heading: 'Remove the background from a video',
    tagline: 'The person stays, the room goes: blurred, a flat colour or a picture of your choice, done frame by frame on your own device.',
    category: 'media',
    accept: 'video/*,.mp4,.mov,.m4v,.webm,.mkv,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
    multiple: true,
    dropLabel: 'Drop a video, and a picture if you want it behind you',
    action: 'Replace background',
    keywords: ['remove background from video', 'video background remover', 'blur video background', 'change video background', 'green screen video', 'replace video background', 'virtual background video'],
    steps: [
      'Drop a video of a person. For a picture behind them, drop the JPG or PNG with it.',
      'Choose Blur, a Colour (green is ready for keying in an editor) or Picture.',
      'Press Replace background. The first run downloads the person finder and its engine once; each frame is then redrawn and the new video downloads.',
    ],
    faq: [
      {
        q: 'Is my video uploaded?',
        a: 'No. Each frame is examined and redrawn in this tab, and the video is encoded by your browser. Recordings of your home, your children or your office never leave your device.',
      },
      {
        q: 'What kind of video works best?',
        a: 'One or two people, facing the camera, lit from the front: video calls, talking-head clips, presentations, dance videos. The person finder is built for people, so pets and objects are treated as background, and fine hair or fast hand movements can blur at the edge. The Fast option is rougher still around hair and in dim light, where it can lose the person altogether, so keep the default for those.',
      },
      {
        q: 'Can I get a transparent background?',
        a: 'Not directly, since MP4 has no transparency. Choose Colour and keep the green, then use the chroma key effect in Premiere, DaVinci Resolve, CapCut or OBS to make it transparent there.',
      },
      {
        q: 'Is the sound kept?',
        a: 'Yes. Only the picture is redrawn; the soundtrack is copied into the new video.',
      },
      {
        q: 'How long does it take?',
        a: 'Every frame is examined and redrawn on your device, so it can take longer than the video plays. The default finder, Better edges, runs on the graphics chip where the browser offers one. On a MacBook Pro with an M3 Max chip a 10-second 30 fps clip took about 6 seconds in Chrome and about 10 seconds in Safari, so a 10-minute clip would take about 6 to 11 minutes (we timed 10 seconds, not the longer clip). Where the browser cannot use a graphics chip (software rendering, some virtual machines and browser settings) it falls back to the processor, and the same clip took about 55 seconds, so a 10-minute clip would take about an hour. The Fast option runs on the processor and took about 5 seconds in Chrome and 8 to 9 seconds in Safari on the same clip, so it is only a little quicker than Better edges on a graphics chip and several times quicker than Better edges without one, but its edges are rougher around hair and in dim light. Phones vary and we have not benchmarked one with the graphics chip: a single run on an iPhone in Safari, before this change, took roughly 5 to 10 minutes for a 2-minute video, which is a rough guide, not a measurement. Slower devices take longer, and so do longer or 60 fps videos. The page shows the time left once it is running; keep the tab open while it works.',
      },
      {
        q: 'Why does the browser console mention a Google address?',
        a: 'The open-source MediaPipe engine that finds the person tries to send its own usage log to a Google address. This site’s security policy makes the browser refuse that request, so it fails and you see an error in the console. Your video is not part of it and it never leaves your device.',
      },
    ],
  },
  {
    slug: 'ocr-pdf',
    icon: 'text',
    name: 'OCR PDF',
    title: 'OCR PDF Online: Make a Scanned PDF Searchable | Stayput',
    description:
      'Turn a scanned PDF into a searchable one: the text is read on your device and laid invisibly over each page, so you can search, select and copy it. Free, no upload, no page limit.',
    heading: 'Make a scanned PDF searchable',
    tagline: 'Text recognition for scanned pages, run on your own device: the PDF looks the same, but now you can search it and copy from it.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: true,
    dropLabel: 'Drop scanned PDFs',
    action: 'Read text',
    keywords: ['ocr pdf', 'make pdf searchable', 'searchable pdf', 'ocr pdf online free', 'scanned pdf to searchable pdf', 'pdf text recognition', 'ocr scanned pdf'],
    steps: [
      'Drop one or more scanned PDFs: a contract from the office scanner, receipts photographed with a scanning app, an old manual.',
      'Leave Scanned pages only chosen, so pages that already have text stay as they are. Tick the box to get the text as a .txt file too.',
      'Press Read text. Each page takes a few seconds; the note says how many words were found.',
    ],
    faq: [
      {
        q: 'What does OCR do to my PDF?',
        a: 'A scanned page is a photograph of paper, so a PDF reader cannot search it or copy from it. OCR (optical character recognition) reads the letters in that picture and places the words as invisible text exactly over where they appear. The page looks unchanged, but Ctrl+F finds words and you can select and copy them.',
      },
      {
        q: 'Which languages does it read?',
        a: 'English. Other languages in Latin letters are read with the English model, so expect mistakes, especially in accented letters. Cyrillic, Greek, Arabic, Chinese and other scripts are not read yet.',
      },
      {
        q: 'How accurate is it?',
        a: 'Clean printed text on a straight, sharp scan reads well. Handwriting, faint photocopies, tables with tight lines and photos of pages taken at an angle read worse. The note under the download gives Tesseract’s average confidence, a rough guide to how well it went.',
      },
      {
        q: 'Is my PDF uploaded?',
        a: 'No. The pages are rendered and read in this tab by Tesseract, an open-source OCR engine, so scanned IDs, bank statements and signed contracts never leave your device.',
      },
    ],
  },
  {
    slug: 'document-scanner',
    icon: 'crop',
    name: 'Document scanner',
    title: 'Document Scanner Online: Photo to Clean PDF | Stayput',
    description:
      'Turn phone photos of documents into a clean, straight PDF: the page is found, flattened and the shadows lifted, on your device. Free, no app, no account, no upload.',
    heading: 'Scan documents with your phone camera',
    tagline: 'A photo of a sheet of paper becomes a flat, white, straight scan, without a scanner app and without sending the page anywhere.',
    category: 'pdf',
    accept: 'image/*,.heic,.heif',
    multiple: true,
    dropLabel: 'Drop photos of documents',
    action: 'Scan',
    keywords: ['document scanner', 'scan document online', 'phone photo to pdf scan', 'scan paper with phone', 'free document scanner no app', 'make photo look scanned'],
    steps: [
      'Photograph each page flat on a darker table, with all four corners in the picture, then drop the photos here in page order. On a phone, choose the camera or your photo library.',
      'Check the green outline on each preview, pick a look (Black and white is crispest for typed pages) and choose one PDF or separate images.',
      'Press Scan. Each page is straightened to a rectangle, the paper turned white and the pages put into one PDF.',
    ],
    faq: [
      {
        q: 'How is this different from just putting the photo in a PDF?',
        a: 'A photo shows the table around the page, the page is a trapezoid because the phone was at an angle, and the paper is grey or yellow with a shadow of your hand. This cuts the page out, pulls its corners back into a rectangle and divides out the uneven light, so it looks like it came off a flatbed scanner.',
      },
      {
        q: 'What if it cannot find the page?',
        a: 'Then the whole photo is kept and cleaned up, and the note says so. Detection needs the paper to be lighter than what it lies on and all four corners in view: white paper on a white desk, or a page cut off at the edge, cannot be found. Take the photo again on a darker surface.',
      },
      {
        q: 'Can I search the text in the scan?',
        a: 'Not yet: a scan is a picture of the words. Run the PDF through OCR PDF next, which reads the text on your device and makes the PDF searchable.',
      },
      {
        q: 'Are my documents uploaded?',
        a: 'No. The photos are decoded, straightened and saved in this tab. IDs, contracts and medical forms never leave your phone or computer.',
      },
    ],
  },
  {
    slug: 'epub-to-pdf',
    icon: 'convert',
    name: 'EPUB to PDF',
    title: 'EPUB to PDF Converter: Free, No Upload, No Email | Stayput',
    description:
      'Convert an EPUB ebook to a PDF you can print, annotate or read anywhere, with chapters on new pages, pictures, italics and a contents page. Runs in your browser; the book is never uploaded.',
    heading: 'Convert EPUB to PDF',
    tagline: 'A DRM-free ebook turned into a paginated PDF, laid out on your own device.',
    category: 'pdf',
    accept: '.epub,application/epub+zip',
    multiple: true,
    dropLabel: 'Drop EPUB books',
    action: 'Convert to PDF',
    keywords: ['epub to pdf', 'epub to pdf converter', 'convert epub to pdf', 'epub to pdf free', 'ebook to pdf', 'epub to pdf no upload'],
    steps: [
      'Drop one or more DRM-free EPUB files, from Project Gutenberg, Standard Ebooks, a Humble Bundle or a publisher that sells without DRM.',
      'Pick a page size (A5 reads like a paperback; A4 or Letter for printing at home) and a text size.',
      'Press Convert to PDF. Each chapter starts on a new page, with page numbers and a contents page.',
    ],
    faq: [
      {
        q: 'Will the PDF look like the book in my e-reader?',
        a: 'The structure carries over: chapters, headings, paragraphs, italics and bold, lists, quotations and pictures. The book’s own fonts and fine styling do not: the text is set in Roboto, justified, at the size you pick. Tables come out as plain paragraphs and footnote links as ordinary text.',
      },
      {
        q: 'Why does it say my book is protected by DRM?',
        a: 'Books bought from stores that lock them (with Adobe DRM, for example) have their chapters encrypted, so no converter can read them without the store’s key. Removing DRM is illegal in many countries, and this tool does not try. Books from Project Gutenberg, Standard Ebooks, Tor, Humble Bundle and many small publishers are DRM-free and work.',
      },
      {
        q: 'Which languages work?',
        a: 'Books in Latin, Greek and Cyrillic letters, which covers English and most European languages. Chinese, Japanese, Korean, Arabic, Hebrew, Thai and Indian scripts cannot be shown by the built-in font yet, and the tool says so instead of making a PDF of empty boxes.',
      },
      {
        q: 'Is my book uploaded?',
        a: 'No. The EPUB is unzipped and laid out in this tab, so your library, including books you wrote or were sent in confidence, never leaves your device.',
      },
    ],
  },
  {
    slug: 'text-to-pdf',
    icon: 'text',
    name: 'Text to PDF',
    title: 'Text to PDF: Paste Text or Drop a TXT File | Stayput',
    description: 'Turn pasted text, or a .txt, .md, .csv or .log file, into a PDF in your browser. Choose A4 or Letter, type size and margins. Not uploaded.',
    heading: 'Convert text to PDF',
    tagline: 'Type or paste text, or drop a text file, and get a PDF with the page size and margins you choose, made on your own device.',
    category: 'pdf',
    accept: '.txt,.md,.markdown,.csv,.tsv,.log,.text,text/plain,text/markdown,text/csv',
    multiple: true,
    dropLabel: 'Drop text files here',
    action: 'Convert to PDF',
    keywords: ['text to pdf', 'text to pdf converter', 'text file to pdf', 'convert text to pdf', 'paste text to pdf', 'text to pdf free', 'txt to pdf'],
    sizeFact: 'No watermark. Up to 2 MB of text per file, about 300 pages',
    lead: 'Turns typed or pasted text, or .txt, .md, .csv and .log files, into a PDF with the page size, margins and type size you choose. It is free, needs no account and adds no watermark, and your text is not uploaded: the PDF is laid out by code in this tab. Chinese, Japanese, Korean, Arabic, Hebrew, Thai and emoji cannot be drawn, and the result tells you when a file had them.',
    steps: [
      'Type or paste your text into the box, or drop one or more text files (.txt, .md, .csv, .log).',
      'Choose A4 or US Letter, the margins and the type. Monospace keeps columns lined up.',
      'Press Convert to PDF. Several files give one PDF each, and Download all zips them.',
    ],
    sections: [
      {
        heading: 'What goes into the PDF',
        paragraphs: [
          'The text is set as you wrote it: line breaks and blank lines are kept, indentation is kept, tabs become four spaces, and a form-feed character starts a new page. Long lines wrap at the margin, and a very long word or web address is broken at the margin instead of running off the page.',
          'It is plain text in and plain text out. Markdown is not formatted, so # and * stay as typed; a CSV is not turned into a table; there are no pictures, bold or italics.',
        ],
      },
      {
        heading: 'A worked example: a log file',
        paragraphs: [
          'A server log has lines up to 80 characters, with columns lined up using spaces. Drop it and the page picks Monospace and 9 pt for you, because the file ends in .log. On US Letter with 1 inch margins that gives 86 characters to a line, so an 80-character line does not wrap and the columns stay lined up. On A4 it is 83 characters. If you switch to 11 pt Monospace, a Letter page holds 70 characters and the same lines wrap.',
          'Set a title if you want one: it is printed at the top of page 1, saved as the PDF’s title and used for the file name. Page numbers read "1 of 12" at the bottom and are on by default.',
        ],
      },
      {
        heading: 'Languages and symbols',
        bullets: [
          'Latin letters with accents, Greek, Cyrillic and Vietnamese are drawn in Roboto.',
          'Arrows, tick marks, box-drawing lines and common symbols are drawn in DejaVu Sans Mono.',
          'Chinese, Japanese, Korean, Arabic, Hebrew, Thai, Indian scripts and emoji are not drawn. Each one shows as a � mark in the PDF, and the result tells you how many there were and which, so nothing disappears without a word.',
        ],
      },
    ],
    faq: [
      {
        q: 'Is my text uploaded?',
        a: 'No. The text is read, laid out and written as a PDF in this tab, so a note, a contract draft or a log file does not leave your device. After one visit and a short wait the page works offline.',
      },
      {
        q: 'Which file types and encodings work?',
        a: 'Plain text files such as .txt, .md, .csv and .log. UTF-8 and UTF-16 files are read correctly, and an older file that is not valid UTF-8 is read as Western European (Windows-1252), and the result says so. Word documents, PDFs and other binary files are refused with a message.',
      },
      {
        q: 'Why is part of my text shown as a � mark?',
        a: 'The built-in fonts cannot draw Chinese, Japanese, Korean, Arabic, Hebrew, Thai, Indian scripts or emoji. Those characters are replaced by � and counted in the result, so you can see what was affected. For a file that is mostly in one of those scripts, open it in your browser and use Print, then Save as PDF, which uses your device’s own fonts.',
      },
      {
        q: 'Why do my columns not line up?',
        a: 'Switch the font to Monospace. In a proportional font the letters have different widths, so columns made with spaces drift. Monospace is picked automatically for .csv and .log files and for text with aligned columns.',
      },
      {
        q: 'Does it turn Markdown or a CSV into a formatted document or a table?',
        a: 'No. The text is set as it is written, so headings keep their # signs and a CSV stays as lines of text with commas. Use Monospace for a readable CSV.',
      },
      {
        q: 'How big a file can I convert?',
        a: 'Up to 2 MB of text per file, which is about 300 pages. A PDF is laid out in your device’s memory, and larger files can make a tab run out of it, so split bigger files into parts. A phone may run out sooner.',
      },
      NOACCOUNT,
    ],
  },
  {
    slug: 'pdf-to-epub',
    icon: 'convert',
    name: 'PDF to EPUB',
    title: 'PDF to EPUB Converter: Free, No Upload | Stayput',
    description:
      'Convert a PDF into an EPUB ebook whose text reflows to fit a phone, Kindle or Kobo screen, with chapters and a table of contents. Runs in your browser; the PDF is never uploaded.',
    heading: 'Convert PDF to EPUB',
    tagline: 'A PDF made for paper turned into an ebook that reflows on a small screen, on your own device.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: true,
    dropLabel: 'Drop PDFs to turn into ebooks',
    action: 'Convert to EPUB',
    keywords: ['pdf to epub', 'pdf to epub converter', 'convert pdf to epub', 'pdf to ebook', 'pdf to epub free', 'reflow pdf'],
    steps: [
      'Drop one or more PDFs with real text in them: a report, a novel exported from a writing app, a long article saved as PDF.',
      'Pick the language of the text, so the e-reader hyphenates and looks words up correctly.',
      'Press Convert to EPUB and open the book in Apple Books, Google Play Books, a Kobo, or send it to a Kindle.',
    ],
    faq: [
      {
        q: 'What survives the conversion?',
        a: 'The text, paragraph by paragraph, and the headings, which become chapters and the table of contents. Page headers, footers and page numbers are removed, and paragraphs split by a page break are joined. Pictures, tables, columns of numbers and footnote layout do not carry over: an EPUB made from a PDF is for reading the words.',
      },
      {
        q: 'Why convert at all instead of reading the PDF?',
        a: 'A PDF has fixed pages, so on a 6-inch e-reader or a phone the text is tiny or you pan around each page. An EPUB reflows: the reader picks the font size and the lines rewrap to fit the screen.',
      },
      {
        q: 'Does it work on scanned PDFs?',
        a: 'Not directly, because a scan has no text, only pictures of pages. Run it through OCR PDF first to add a text layer, then convert that copy here.',
      },
      {
        q: 'Is my PDF uploaded?',
        a: 'No. pdf.js reads the text in this tab and the EPUB is zipped here too, so a manuscript or a confidential report stays on your device.',
      },
    ],
  },
  {
    slug: 'archive-extractor',
    icon: 'merge',
    name: 'Open ZIP, RAR and 7z',
    title: 'Open RAR, ZIP and 7z Files Online, No Upload | Stayput',
    description:
      'Extract ZIP, RAR, 7z and TAR archives in your browser, including password-protected ZIP, 7z and RAR files when you have the password, and download the files inside one by one or all at once. Nothing to install; nothing is uploaded.',
    heading: 'Open ZIP, RAR and 7z files',
    tagline: 'The files inside an archive, unpacked on your own device, without installing WinRAR or 7-Zip.',
    sections: [
      {
        heading: 'Related tools',
        paragraphs: [
          'After unpacking, [Rename files](/tools/rename-files) can give the whole batch new names with a prefix, numbering or find and replace.',
        ],
      },
    ],
    category: 'pdf',
    accept: '.zip,.rar,.7z,.tar,.gz,.tgz,.bz2,.tbz2,.xz,.txz,.iso,.cab,application/zip,application/x-rar-compressed,application/vnd.rar,application/x-7z-compressed,application/x-tar,application/gzip',
    multiple: true,
    dropLabel: 'Drop archives to open',
    action: 'Extract',
    keywords: ['rar extractor', 'open rar file', 'zip file opener', 'unzip files online', '7z extractor', 'extract rar online', 'open 7z file'],
    steps: [
      'Drop a ZIP, RAR, 7z or TAR archive, or several.',
      'If the archive is password-protected, type its password.',
      'Press Extract, then download the files you need, or all of them as one ZIP.',
    ],
    faq: [
      {
        q: 'Why would I open a RAR here instead of installing WinRAR or 7-Zip?',
        a: 'On a work laptop where you cannot install software, on a Chromebook, or on a phone, this is the quickest way to get at the files. On your own computer a desktop app is a fine choice too; both keep the files local, unlike online extractors that upload the archive.',
      },
      {
        q: 'Which formats open?',
        a: 'ZIP, RAR (old RAR and RAR5), 7z, TAR and its compressed forms (TAR.GZ, TGZ, TAR.BZ2, TAR.XZ), ISO disc images and CAB. Archives split into parts (.part1.rar, .7z.001) must be joined first and are not supported yet.',
      },
      {
        q: 'Can it open password-protected archives?',
        a: 'Yes, when you have the password: type it before pressing Extract. That works for password-protected ZIP files, for 7z archives (whether only the contents are encrypted or the file names are too) and for RAR archives (old RAR and RAR5, with or without encrypted file names). A wrong password shows an error and nothing is extracted. For 7z and RAR the page downloads 7-Zip, about 0.7 MB more, only when an archive needs it: when it has a password, or when its list of files is itself encrypted so the page cannot read it without 7-Zip. Everything still runs in your browser and nothing is uploaded. It cannot guess or remove a password you do not have, and archives split into parts are not supported.',
      },
      {
        q: 'How do I remove the password from a ZIP file?',
        a: 'Open the ZIP here, type its password before pressing Extract, then press Download all as zip. The new ZIP has the same files and no password. You need the password: this page cannot recover a forgotten one. The same works for an encrypted 7z or RAR: type the password, press Extract, then Download all as zip to get the files in a ZIP with no password.',
      },
      {
        q: 'Is the archive uploaded?',
        a: 'No. libarchive, the same open-source code behind the tar command on macOS and FreeBSD, runs in this tab as WebAssembly, and so does 7-Zip for password-protected 7z and RAR files, so the archive, its password and everything in it stay on your device.',
      },
    ],
  },
  {
    slug: 'create-zip',
    icon: 'merge',
    name: 'Create ZIP',
    title: 'Create a ZIP File Online, Optional Password | Stayput',
    description:
      'Zip files or whole folders into one ZIP in your browser, and lock it with an AES-256 password if you like. Nothing is uploaded, so private files stay on your device.',
    heading: 'Create a ZIP file',
    tagline: 'Files and folders packed into one ZIP on your own device, locked with a password when they are private.',
    sections: [
      {
        heading: 'Related tools',
        paragraphs: [
          'Want the files to have tidier names first? [Rename files](/tools/rename-files) renames a batch with one pattern and hands back a ZIP.',
        ],
      },
    ],
    category: 'pdf',
    accept: '',
    multiple: true,
    dropLabel: 'Drop files or folders to zip',
    action: 'Create ZIP',
    sizeFact: 'No watermark. A ZIP can be up to 4 GB, and phones hold less.',
    keywords: ['create zip file', 'zip files online', 'password protect zip file', 'zip folder', 'compress files to zip', 'encrypted zip'],
    steps: [
      'Drop files or a folder, or press Add a folder.',
      'Tick Lock with a password and type one if the files are private.',
      'Press Create ZIP; the ZIP downloads straight away.',
    ],
    faq: [
      {
        q: 'How strong is the password lock?',
        a: 'Each file is encrypted with AES-256 in the WinZip format, with a key made from your password and a random salt. That is the strong kind of ZIP encryption, not the old ZipCrypto scheme that tools can break in minutes. The lock is only as good as the password, so use a long one and send it separately from the ZIP.',
      },
      {
        q: 'Can everyone open a password-protected ZIP?',
        a: '7-Zip, WinRAR, PeaZip, The Unarchiver, Keka and our own archive opener all can. The zip openers built into Windows and macOS may refuse AES-locked ZIPs, so tell the person you send it to which app to use. ZIPs without a password open everywhere.',
      },
      {
        q: 'Why are photos and videos barely smaller in the ZIP?',
        a: 'JPEG, PNG, MP4 and similar files are already compressed, so they are stored as they are rather than squeezed again, which saves time. Text, documents, spreadsheets and code usually shrink a lot.',
      },
      {
        q: 'Are my files uploaded?',
        a: 'No. The ZIP is built in this tab with fflate, and the encryption runs here too, so neither the files nor the password leave your device.',
      },
    ],
  },
  {
    slug: 'rename-files',
    icon: 'merge',
    name: 'Rename files',
    title: 'Bulk Rename Files Online: Pattern, Numbers, ZIP | Stayput',
    description:
      'Bulk rename files in your browser: add a prefix or suffix, number them, find and replace, change case. Preview every new name, then download a ZIP. Nothing is uploaded.',
    heading: 'Bulk rename files',
    tagline: 'Rename a whole batch of files with one pattern and see every new name before you download. File names stay on your device.',
    sections: [
      {
        heading: 'Why the result is a ZIP',
        paragraphs: [
          'A web page cannot rename files on your disk, so the renamed copies come back in one ZIP, in the order shown in the preview. Unzip it and the files have their new names; the contents are not changed. To pack files without renaming them, use [Create ZIP](/tools/create-zip), and the [archive opener](/tools/archive-extractor) unpacks a ZIP you were sent.',
        ],
      },
    ],
    category: 'pdf',
    accept: '',
    multiple: true,
    dropLabel: 'Drop the files to rename',
    action: 'Download renamed ZIP',
    sizeFact: 'No watermark. A ZIP can be up to 4 GB, and phones hold less.',
    keywords: ['bulk rename files', 'batch rename files', 'rename multiple files', 'rename files online', 'add numbers to file names', 'find and replace in file names'],
    steps: [
      'Drop the files you want to rename; use the arrows to set their order.',
      'Set a prefix or suffix, numbering, find and replace, or letter case, and check the preview.',
      'Press Download renamed ZIP; the ZIP holds your files under their new names.',
    ],
    faq: [
      {
        q: 'Why do I get a ZIP instead of renamed files?',
        a: 'A web page is not allowed to change files on your disk, so the tool writes copies under the new names into a ZIP. Unzip it to get the renamed files; the originals are untouched.',
      },
      {
        q: 'What happens if two files end up with the same name?',
        a: 'The later one gets a counter before its extension, such as photo-2.jpg, and the preview marks it. Names are compared ignoring upper and lower case, because Windows and macOS treat them as the same file.',
      },
      {
        q: 'Are the file extensions kept?',
        a: 'Yes, by default the extension is kept as it was. Untick Keep the original file extension if you want the pattern to apply to the whole name, extension included.',
      },
      {
        q: 'Are my files or their names uploaded?',
        a: 'No. The names are read and changed in this tab and the ZIP is built here. Neither the files nor their names are sent anywhere or counted by analytics.',
      },
    ],
  },
  {
    slug: 'image-to-base64',
    icon: 'convert',
    name: 'Image to Base64',
    title: 'Image to Base64 Converter, Data URI, No Upload | Stayput',
    description:
      'Turn PNG, JPG, WebP, GIF, SVG, AVIF or ICO images into Base64 and ready-to-paste data URIs, HTML and CSS snippets. Free, in your browser, nothing is uploaded.',
    heading: 'Convert image to Base64',
    tagline: 'Get the data URI, the raw Base64 and ready-made HTML and CSS for any image, with the size it adds. Your image never leaves this tab.',
    category: 'images',
    accept: 'image/*,.svg,.ico,.avif',
    multiple: true,
    dropLabel: 'Drop images to encode as Base64',
    action: 'Encode to Base64',
    keywords: ['image to base64', 'png to base64', 'base64 image', 'image to data uri', 'jpg to base64', 'svg to base64', 'convert image to base64 string'],
    steps: [
      'Drop one or more images (PNG, JPG, WebP, GIF, SVG, AVIF or ICO), or tap to pick them.',
      'Encode. Each image gets its data URI, the raw Base64, an HTML img tag and a CSS background-image rule.',
      'Press Copy next to the one you need, or download the data URI as a .txt file.',
    ],
    faq: [
      {
        q: 'What is the difference between the data URI and the Base64?',
        a: 'The Base64 is the file’s bytes written as text. The data URI is that text with a prefix such as data:image/png;base64, in front, which is what a browser needs to show it from an img src or a CSS url(). Use the data URI for HTML and CSS, and the raw Base64 for an API field or JSON that wants only the encoded bytes.',
      },
      {
        q: 'Why is the Base64 bigger than my image?',
        a: 'Base64 writes three bytes as four characters, so the text is about 33% larger than the file. An image over about 1 MB is better linked as a file than embedded: a data URI makes the page itself heavier and cannot be cached separately. The result card shows both sizes, and warns above 1 MB.',
      },
      {
        q: 'Which images should I embed as a data URI?',
        a: 'Small ones: icons, logos and tiny backgrounds of a few kilobytes, where saving a request is worth more than the extra third. Photos are better as files. If an image is large, shrink it first with [Compress image](/tools/compress-image) or change its format with [Convert image](/tools/convert-image).',
      },
      {
        q: 'Can I encode an SVG?',
        a: 'Yes. The SVG file is encoded as it is. For an SVG you could also paste its markup straight into the page, which is smaller. To turn a raster picture into a vector first, use [Image to SVG](/tools/image-to-svg).',
      },
      {
        q: 'Can I make a favicon this way?',
        a: 'A data URI works in a link tag, but browsers cache a real file better and some ignore data URIs for icons. [Favicon generator](/tools/favicon-generator) writes the whole icon set and the HTML for it.',
      },
      {
        q: 'Is my image uploaded?',
        a: 'No. The file is read by your browser’s FileReader and encoded in this tab. There is no server in the process, and after one visit and a short wait the page works offline.',
      },
    ],
  },
  {
    slug: 'favicon-generator',
    icon: 'image',
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
        a: 'No. The image is decoded and resized on a canvas in your browser tab, and the ICO file is written by a small encoder in the page. Logos for a rebrand or an unannounced product never leave your device. After one visit and a short wait you can go offline and generate icons as often as you like.',
      },
    ],
  },
  {
    slug: 'remove-background',
    icon: 'cutout',
    name: 'Remove background',
    title: 'Background Remover: Free, No Upload, Full Resolution | Stayput',
    description:
      'Free background remover in your browser: transparent PNG, white or coloured background, or blur. Full resolution, no watermark. Your photo is never uploaded.',
    heading: 'Free background remover for photos',
    tagline: 'Cut out people, pets and products at full resolution. The photo never leaves this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop photos to remove the background',
    action: 'Remove background',
    lead:
      'Removes the background from a photo (JPG, PNG, WebP, HEIC, AVIF or JPEG XL) and saves a transparent PNG or WebP, a white or coloured background as PNG, WebP or JPG, or the same photo with the background blurred, at the photo’s full resolution. It is free, needs no account and adds no watermark, and your photos are not uploaded: a cut-out model runs in your browser. The first run downloads that model and its WebAssembly runtime (about 42 MB in all) to your browser, and after that the tool works offline.',
    sections: [
      {
        heading: 'A worked example: a product photo on a white background',
        paragraphs: [
          'Say you have a 12-megapixel JPG of a mug on a kitchen table for a marketplace listing. Drop it, choose White, set Save as to JPG and press Remove background. The first photo downloads the model and its engine once; after that each photo takes a few seconds. You get mug-no-bg.jpg at the same 4000 × 3000 size, and the result line shows that size. If part of the mug goes missing, set Keep around the edges to More and run it again.',
        ],
      },
    ],
    keywords: ['remove background', 'background remover', 'remove background from image', 'transparent background', 'make background transparent', 'remove bg', 'remove.bg alternative', 'cut out image', 'white background'],
    steps: [
      'Drop one or more photos (JPG, PNG, WebP, HEIC, AVIF or JPEG XL), or tap to pick them.',
      'Choose a transparent, white or coloured background, or keep the scene and blur it, and the file type. The first photo downloads the cut-out model and its WebAssembly runtime once; after that it is cached.',
      'Download the cut-out at the photo’s full size, or all of them in one zip.',
    ],
    faq: [
      {
        q: 'Can I remove a background without uploading the photo?',
        a: 'Yes. A segmentation model runs inside your browser tab and works out which pixels are the subject; the new image is written there too. What gets downloaded is the model and the WebAssembly runtime that runs it, both fetched from this site the first time. After your first run you can turn off Wi-Fi and it keeps working.',
      },
      {
        q: 'Why is the first photo slow?',
        a: 'The first time, the page downloads the model and the WebAssembly runtime that runs it (about 42 MB in all), and shows the progress. Both are cached by your browser, so later photos, and later visits, start straight away. Each photo then takes a few seconds, depending on your device.',
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
        q: 'Which file types can I save the result as?',
        a: 'PNG, WebP or JPG. JPG has no transparency, so it is offered only once you pick a white, coloured or blurred background; for a transparent cut-out use PNG or WebP.',
      },
      {
        q: 'Does it work on iPhone HEIC photos?',
        a: 'Yes. The page accepts HEIC and HEIF as well as JPG, PNG, WebP, AVIF and JPEG XL, and the cut-out keeps the photo’s full resolution.',
      },
      {
        q: 'Is this background remover free with no watermark?',
        a: 'Yes. It is free, needs no account, and nothing is added to your photo, so there is no watermark. The cut-out is the same size as your photo, with no credits and no low-resolution preview tier.',
      },
      NOACCOUNT,
      {
        q: 'Which model does this use?',
        a: 'ISNet general-use from the DIS research project (see the licenses page for its licensing), converted to 8-bit weights so it downloads faster. It runs with onnxruntime-web, Microsoft’s open-source runtime for machine learning models in the browser.',
      },
      {
        q: 'Is this an alternative to remove.bg?',
        a: 'It does the same job in your browser. remove.bg\'s own site says its standalone website closes on 1 December 2026 (checked 12 October 2026). This is free, needs no account, and your photos are not uploaded; the first run downloads a model and its runtime, about 42 MB in all. There is no API. See [remove.bg alternatives](/guides/remove-bg-alternative).',
      },
    ],
  },
  {
    slug: 'passport-photo',
    icon: 'portrait',
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
      'Pick the size, and keep the background or replace it with white or light grey. The first photo downloads the face finder, the cut-out model and their WebAssembly runtime once.',
      'Download the single photo for online applications, and the 4 × 6 sheet to print at a photo counter or at home, then cut along the grey lines.',
    ],
    sections: [
      {
        heading: 'A worked example: a 2 × 2 inch photo for a US passport form',
        paragraphs: [
          'Say you need a 2 × 2 inch photo for a passport application and have a selfie taken against a plain wall. Drop it, leave 2 × 2 in chosen and press Make passport photo. The first photo downloads the face finder and the cut-out model once. You get selfie-passport.jpg, about 1200 × 1200 pixels, and selfie-passport-4x6-print.jpg, a 4 × 6 inch sheet to print at a photo counter and cut along the grey lines. Check your government’s current photo rules before you apply.',
        ],
      },
    ],
    lead:
      'Makes a 2 × 2 inch US passport photo or a 35 × 45 mm photo from a selfie, with the head sized to the allowed range at 600 pixels per inch, plus a 4 × 6 inch print sheet. It is free, needs no account and adds no watermark, and your photo is not uploaded: a face finder and a cut-out model run in your browser. The first run downloads those models and their WebAssembly runtimes (about 46 MB in all) to your browser, and after that the tool works offline.',
    faq: [
      {
        q: 'Can I make a passport photo without uploading my photo?',
        a: 'Yes. A face detector finds your eyes and mouth, a segmentation model finds the outline of your head, and the photo is cropped and drawn on a canvas, all inside your browser tab. The downloads are the face finder (about 4 MB, with its own WebAssembly runtime), the cut-out model (about 39 MB) and the WebAssembly runtime that runs the cut-out model (about 3 MB), all fetched from this site the first time. A passport photo is an identity document; it has no business on a stranger’s server.',
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
        a: 'One taken by someone else from about 1.5 metres (4 to 5 feet) away, at eye level, in even daylight with no shadows on your face or behind you. Take off glasses and hats, keep your hair off your face, and leave plenty of space above your head and around your shoulders so there is room to crop. If you use a laptop camera, check its picture first with the [webcam test](/tools/webcam-test), which saves a snapshot as JPG.',
      },
    ],
  },
  {
    slug: 'watermark-image',
    icon: 'stamp',
    name: 'Watermark image',
    sizeFact: 'The limit is your device’s memory (phones hold less)',
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
        a: 'No. Each photo is decoded, drawn with the watermark and saved inside your browser tab. Your files are not uploaded, so unpublished work, client photos and pictures of your home stay on your device. The page works with Wi-Fi off after one visit and a short wait.',
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
    icon: 'stamp',
    name: 'Watermark PDF',
    sizeFact: 'The limit is your device’s memory (phones hold less)',
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
        q: 'Can I add text, a highlight or an image to the PDF too?',
        a: 'Yes. [Edit PDF](/tools/edit-pdf) adds text, cover boxes, highlights, drawings and images to a page and rotates, deletes or reorders pages, all in your browser. It cannot change the text already in the file.',
      },
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
    icon: 'shield',
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
        a: 'No. The file is read and rewritten by code running in your browser tab, so a CV, contract, legal filing or anonymous tip never leaves your device. The page works with Wi-Fi off after one visit and a short wait.',
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
    icon: 'sticker',
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
        a: 'No. The cut-out model runs inside your browser tab, and the border and file are made there too. Photos of your friends, kids and pets stay on your device. What gets downloaded is the model and the WebAssembly runtime that runs it, fetched from this site once and then cached.',
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
    icon: 'portrait',
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
        q: 'Can I use a photo from my webcam?',
        a: 'Yes, as a photo file. Check your framing and light first with the [webcam test](/tools/webcam-test), save a snapshot as JPG, then drop it here.',
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
  {
    slug: 'upscale-image',
    icon: 'resize',
    name: 'AI image upscaler',
    title: 'AI Image Upscaler: Enlarge Photos 2×, 3×, 4×, No Upload | Stayput',
    description:
      'Make a small or blurry picture 2, 3 or 4 times bigger with an AI upscaler that runs in your browser. Sharper edges, fewer JPEG blocks. Nothing uploaded.',
    heading: 'Upscale an image with AI',
    tagline: 'Make a small picture bigger and sharper with a neural network that runs on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop pictures to upscale',
    action: 'Upscale',
    sizeFact: 'No watermark. The enlarged picture can be up to about 16.7 megapixels (4096 × 4096 px).',
    keywords: ['ai image upscaler', 'upscale image', 'image upscaler', 'increase image resolution', 'enlarge image without losing quality', 'photo enhancer', 'upscale photo', 'make image bigger'],
    steps: [
      'Drop one or more pictures (JPG, PNG, WebP, HEIC, AVIF or JPEG XL).',
      'Pick 2×, 3× or 4×, and keep the format or choose PNG, JPG or WebP.',
      'Run it. The upscaling model downloads once (4.9 MB), then each picture is enlarged in your tab.',
    ],
    faq: [
      {
        q: 'Are my pictures uploaded?',
        a: 'No. The upscaler is a neural network that runs as WebAssembly inside this page, in a background thread. Your pictures are decoded, enlarged and saved in your tab. The model and the WebAssembly runtime that runs it are downloaded once, from this site.',
      },
      {
        q: 'How is this different from resizing?',
        a: 'Resizing spreads the same pixels further apart, so a small picture gets soft and blocky. The upscaler is Real-ESRGAN, a network trained on pairs of sharp and degraded photos, so it draws crisp edges and removes JPEG blocks and blur while it enlarges.',
      },
      {
        q: 'Can it recover a face or text that is not in the picture?',
        a: 'No. It sharpens what is there and fills in plausible fine texture, but it cannot restore detail that was never captured. Tiny faces and small print come out cleaner, not readable if they were not readable before.',
      },
      {
        q: 'How big can the result be?',
        a: 'Up to 16 megapixels, about 4900 × 3300, because that is the most every browser, including Safari on iPhone, can hold as one image. A larger request is held to that size and the result says so.',
      },
      {
        q: 'How long does it take?',
        a: 'Time grows with the size of the result. A 4× enlargement to about 2000 × 1500 takes around half a minute on a recent laptop and longer on a phone. The page stays usable while it works, and several pictures run one after another.',
      },
    ],
  },
  {
    slug: 'remove-object',
    icon: 'eraser',
    name: 'Remove object from photo',
    title: 'Remove Objects from Photos (Magic Eraser), No Upload | Stayput',
    description:
      'Paint over a person, a bin, a wire or a date stamp and an AI fills it in with what should be behind it. Runs in your browser, free, no sign-up, no upload.',
    heading: 'Remove an object from a photo',
    tagline: 'Paint over what should not be there and let a small AI fill it in, on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: false,
    dropLabel: 'Drop a photo to clean up',
    action: 'Save',
    keywords: ['remove object from photo', 'magic eraser', 'remove person from photo', 'object remover', 'remove unwanted objects from photos', 'photo eraser', 'remove text from image', 'cleanup pictures'],
    steps: [
      'Drop a photo (JPG, PNG, WebP, HEIC, AVIF or JPEG XL).',
      'Paint over the thing to remove, a little past its edges and over its shadow, and press Erase. Repeat for anything else; Undo steps back.',
      'Press Save to download the cleaned-up photo.',
    ],
    faq: [
      {
        q: 'Is my photo uploaded?',
        a: 'No. The eraser is MI-GAN, a small open-source inpainting network, running as WebAssembly in a background thread of this page. Your photo is decoded, filled in and saved in your tab. The 28 MB model and the WebAssembly runtime that runs it are downloaded once, from this site.',
      },
      {
        q: 'What does it do well, and what not?',
        a: 'It is best at things standing on a background that repeats: a person on a beach, a bin on a pavement, a wire across the sky, a spot on a wall, a date stamp in a corner. It invents what is behind, so a large object in front of something unique, like a face or a sign, comes back as a plausible blur rather than the real thing.',
      },
      {
        q: 'How do I get the cleanest result?',
        a: 'Paint a little past the edges of the object and include its shadow and reflection, which the eye notices at once if left behind. Erase one thing at a time: a smaller area gets more detail. If a patch looks smudged, paint over just that patch and erase again.',
      },
      {
        q: 'Does it change the rest of the photo?',
        a: 'No. Only the painted pixels are replaced; every other pixel is copied through as it was. The photo keeps its full size. Saving as PNG adds no compression at all, and JPG at quality 92 is visually the same as the original.',
      },
      {
        q: 'Is the camera data kept?',
        a: 'No. The saved photo is written fresh from the canvas, so location, camera and date metadata are left out, which suits a picture you are about to post.',
      },
    ],
  },
  {
    slug: 'adjust-image',
    icon: 'sliders',
    name: 'Adjust photo',
    title: 'Adjust Photo Brightness and Contrast, No Upload | Stayput',
    description:
      'Brighten a dark photo, add contrast, boost or mute colour, warm it up, sharpen it or invert it, with a live preview. Batches of images, all in your browser.',
    heading: 'Adjust brightness, contrast and colour',
    tagline: 'Brightness, contrast, saturation, warmth, sharpening and invert, previewed live and made on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop photos to adjust',
    action: 'Apply',
    keywords: ['adjust image brightness', 'brighten photo', 'increase contrast of image', 'sharpen image', 'invert image colors', 'saturation editor', 'photo color correction', 'make photo brighter'],
    steps: [
      'Drop one or more photos (JPG, PNG, WebP, HEIC, AVIF or JPEG XL).',
      'Move the sliders while you watch the preview; press and hold Hold to compare to see the original.',
      'Press Apply. Every photo you dropped gets the same settings.',
    ],
    faq: [
      {
        q: 'Are my photos uploaded?',
        a: 'No. Each photo is decoded and adjusted pixel by pixel on a canvas in your tab, and saved by your browser. Your files are not uploaded, so it works offline after one visit and a short wait.',
      },
      {
        q: 'Why does brightness not wash out the whites?',
        a: 'Brightness here is a curve, not a flat addition: it lifts the dark and middle tones while black stays black and white stays white. Adding a fixed amount to every pixel, as simple editors do, turns bright skies into flat white patches.',
      },
      {
        q: 'How much should I sharpen?',
        a: 'For a photo straight off a phone, 20 to 40 is usually enough. Look at edges such as hair or text in the preview: once a thin bright halo appears along them you have gone too far. Sharpening cannot rescue a badly blurred shot; for a small or soft picture the AI upscaler adds real detail.',
      },
      {
        q: 'Can I adjust many photos at once?',
        a: 'Yes. Drop them all; the preview shows the first, and the same settings are applied to every one when you press Apply. That suits a set shot in the same light, such as product photos or a batch of scans.',
      },
      {
        q: 'Is the camera data kept?',
        a: 'No. The adjusted photos are written fresh from the canvas, so location, camera and date metadata are not in them.',
      },
    ],
  },
  {
    slug: 'emote-resizer',
    icon: 'smile',
    name: 'Emote resizer',
    title: 'Emote Resizer for Twitch, Discord and Slack, No Upload | Stayput',
    description:
      'Resize art or animated GIFs into Twitch emotes (112, 56, 28 px), sub badges, Discord emoji and stickers or Slack emoji, under each size limit. Nothing is uploaded.',
    heading: 'Emote resizer',
    tagline: 'Every size Twitch, Discord or Slack asks for from one drawing, with transparency kept, made on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl,.svg',
    multiple: true,
    dropLabel: 'Drop emote artwork',
    action: 'Make the emotes',
    keywords: ['emote resizer', 'twitch emote resizer', 'discord emoji resizer', 'twitch badge resizer', 'discord sticker resizer', 'resize emote 112x112', 'slack emoji resizer'],
    steps: [
      'Drop one or more drawings, ideally square transparent PNGs at 500 px or larger.',
      'Pick the platform; empty transparent edges are trimmed so the art fills the square.',
      'Download the PNGs, one by one or as a zip, and upload them in the platform’s emote settings.',
    ],
    faq: [
      {
        q: 'Which sizes do I get?',
        a: 'Twitch emotes come out at 112, 56 and 28 pixels, sub badges at 72, 36 and 18, Discord emoji at 128, Discord stickers at 320 and Slack emoji at 128. Each is a transparent PNG, checked against the platform’s file size limit, and the result list says if one is over.',
      },
      {
        q: 'Why does my emote look blurry at 28 pixels?',
        a: 'At that size there are too few pixels for thin lines. The smallest sizes get a light sharpening pass here, but the real fix is in the art: thick outlines, one bold shape and little text. Twitch’s own guidance is to check that an emote still reads at 28 pixels before you submit it.',
      },
      {
        q: 'Can I resize an animated GIF emote?',
        a: 'Yes, for Twitch emotes, Discord emoji and Slack emoji. An animated GIF comes out as animated GIFs at each size, with compression stepped up and frames thinned only as far as needed to get under the limit, and Twitch’s 60 frame cap applied. Sub badges and Discord stickers cannot move, so a GIF becomes a still PNG there. For any other size, [Resize GIF](/tools/resize-gif) sets exact pixels and keeps the animation.',
      },
      {
        q: 'What does trimming the edges do?',
        a: 'Drawings are often exported with a wide transparent margin, which makes the finished emote look tiny in chat. Trimming crops those empty rows and columns first, so the art fills the square. Untick it if the margin is deliberate.',
      },
      {
        q: 'Is my artwork uploaded?',
        a: 'No. The image is decoded, trimmed, resized and saved as PNG on a canvas in your tab. Commissioned emotes and unreleased sub badges stay on your device, and the page works offline after one visit and a short wait.',
      },
    ],
  },
  {
    slug: 'compare-images',
    icon: 'sliders',
    name: 'Compare images',
    title: 'Compare Two Images: Find the Differences, No Upload | Stayput',
    description:
      'Compare two images side by side: drag a slider, see the changed pixels highlighted, or fade between them. Shows the percent that differ. Nothing is uploaded.',
    heading: 'Compare two images',
    tagline: 'Find what changed between two pictures with a slider, a difference map or a fade, all on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl,.svg',
    multiple: true,
    dropLabel: 'Drop two images to compare',
    action: 'Save difference map',
    keywords: ['compare images', 'compare two images', 'image difference', 'image diff', 'spot the difference', 'compare photos', 'visual diff'],
    steps: [
      'Drop two images, or choose one for A and one for B.',
      'Pick Slider, Difference or Fade, and set the sensitivity threshold.',
      'Read the percentage of pixels that differ, and save the difference map as a PNG if you want it.',
    ],
    faq: [
      {
        q: 'What does it compare?',
        a: 'Pixels, not meaning. Each pixel in A is checked against the pixel in the same place in B. A photo shifted by a few pixels, or the same scene taken twice, shows as mostly different even though a person would call them alike. It cannot tell whether two photos show the same scene.',
      },
      {
        q: 'Why do two JPEGs of the same picture show small differences?',
        a: 'JPEG changes colours slightly every time it is saved, which leaves faint noise around edges. Raise the sensitivity threshold until the noise disappears and only real changes are left. At 0 any change counts.',
      },
      {
        q: 'What happens when the images are different sizes?',
        a: 'With “Fit B to A’s size” on, B is scaled to A’s width and height before comparing, and a warning appears when the two have different aspect ratios because B is then stretched. Turn it off to compare at B’s own size, with anything outside it counted as different.',
      },
      {
        q: 'Is there a size limit?',
        a: 'Very large pictures are compared at no more than 4,096 pixels on the long side, and the page says when that happened, so a 24 megapixel pair does not freeze a phone. The difference map you save is that size too.',
      },
      {
        q: 'Are my images uploaded?',
        a: 'No. Both images are decoded and compared on a canvas in your browser tab, and the difference map is saved from there. Your files are not uploaded, and it works offline after one visit and a short wait.',
      },
    ],
  },
  {
    slug: 'image-to-ascii',
    icon: 'text',
    name: 'Image to ASCII art',
    title: 'Image to ASCII Art Converter, Free, No Upload | Stayput',
    description:
      'Convert an image to ASCII art: pick the width and character set, then copy the text or save it as .txt or PNG. Not OCR. Your image is not uploaded.',
    heading: 'Convert an image to ASCII art',
    tagline: 'Turn a picture into text characters you can copy, paste or save, made on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl,.svg',
    multiple: false,
    dropLabel: 'Drop a picture to turn into ASCII art',
    action: 'Make ASCII art',
    keywords: ['image to ascii art', 'image to ascii', 'picture to ascii art', 'photo to ascii', 'ascii art generator from image', 'convert image to text art', 'jpg to ascii'],
    steps: [
      'Drop a photo, drawing or logo (JPG, PNG, WebP, HEIC or SVG).',
      'Set the width in characters and pick a character set, and invert it for a dark background.',
      'Press Make ASCII art, then copy the text or download it as a .txt file or a PNG.',
    ],
    faq: [
      {
        q: 'Why does the result look wrong when I paste it?',
        a: 'ASCII art is plain text, so it lines up only in a monospace font such as Courier or Menlo. In a proportional font, narrow letters squash the rows and the picture falls apart. Paste it into a code block, a text editor or a terminal, or save the PNG, which has the characters already drawn in a monospace font.',
      },
      {
        q: 'How many characters wide should I use?',
        a: 'The default of 100 suits a portrait or logo. Wide landscapes and detailed photos need 150 to 200 columns to keep their shapes, and small avatars look best at 40 to 60. The rows follow the picture’s shape, halved because a text character is about twice as tall as it is wide.',
      },
      {
        q: 'Is this the same as OCR?',
        a: 'No. This draws a picture out of characters, using bright and dark areas to choose them. It does not read any words in the image. To pull the text out of a screenshot or scan, use [Image to text](/tools/image-to-text). To turn a picture into chunky coloured blocks instead, use the [pixel art converter](/tools/pixel-art-converter).',
      },
      {
        q: 'Does the output contain my file name?',
        a: 'No. The text holds only the characters that draw the picture. Your file name is used only to name the downloads, such as photo-ascii.txt, and the file stays on your device.',
      },
      {
        q: 'Are my images uploaded?',
        a: 'No. The image is decoded and shrunk on a canvas in your browser tab and the characters are chosen there, so your picture is not uploaded. It works offline after one visit and a short wait.',
      },
    ],
  },
  {
    slug: 'pixel-art-converter',
    icon: 'grid',
    name: 'Pixel art converter',
    title: 'Pixel Art Converter: Turn a Picture into Pixel Art | Stayput',
    description:
      'Turn any photo or drawing into pixel art: pick how many pixels across, a colour count or a retro palette like Game Boy or PICO-8, dithering and a grid. No upload.',
    heading: 'Pixel art converter',
    tagline: 'Chunky pixels and a limited palette from any picture, previewed live and made on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl,.svg',
    multiple: true,
    dropLabel: 'Drop pictures to pixelate',
    action: 'Make pixel art',
    keywords: ['pixel art converter', 'picture to pixel art converter', 'image to pixel art', 'photo to pixel art', 'pixel art maker from image', 'pixel art converter with grid', '8 bit image converter'],
    steps: [
      'Drop a photo, drawing or logo (JPG, PNG, WebP, HEIC or SVG).',
      'Set how many pixels across and pick a palette; the preview updates as you go.',
      'Press Make pixel art and download a crisp PNG, enlarged or at one pixel per block.',
    ],
    faq: [
      {
        q: 'How many pixels across should I use?',
        a: 'For a sprite or avatar, 32 to 64. For a recognisable portrait or landscape, 96 to 128. A face that is small in the photo turns into a few blocks, so crop close to it before converting.',
      },
      {
        q: 'What do the palettes do?',
        a: 'The picture’s own colours pick the 8 to 64 shades that represent it best, which keeps it natural. Game Boy maps everything to four greens, PICO-8 to the fantasy console’s 16 fixed colours, and the grey and black-and-white sets suit prints and stamps. Dithering mixes neighbouring colours in a checker pattern to fake shades the palette lacks.',
      },
      {
        q: 'Why is the result a PNG?',
        a: 'Pixel art is flat blocks of exact colour. JPG blurs those edges and adds speckles, while PNG keeps every block sharp and is small for this kind of image. Transparent areas in the source stay transparent.',
      },
      {
        q: 'Can I use it as a pattern for beads or cross-stitch?',
        a: 'Yes. Turn on grid lines and save enlarged: each square is one bead or stitch. Pick a small palette so you need few thread or bead colours, and set pixels across to your pegboard or fabric width, for example 29 for a small Perler board.',
      },
      {
        q: 'Is my picture uploaded?',
        a: 'No. The picture is shrunk, recoloured and enlarged on a canvas in your browser tab, and the PNG is saved from there. Your files are not uploaded, and it works offline after one visit and a short wait.',
      },
    ],
  },
  {
    slug: 'photo-to-sketch',
    icon: 'pen',
    name: 'Photo to sketch',
    title: 'Photo to Sketch: Pencil Drawing from a Photo, Free | Stayput',
    description:
      'Turn a photo into a pencil sketch, charcoal drawing or coloured pencil sketch with a live preview. Full resolution, batches, in your browser, nothing uploaded.',
    heading: 'Turn a photo into a sketch',
    tagline: 'Pencil, charcoal or coloured pencil from any photo, previewed live and drawn on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop photos to sketch',
    action: 'Make the sketch',
    keywords: ['photo to sketch', 'photo to sketch converter', 'photo to pencil sketch', 'convert photo to drawing', 'picture to sketch', 'photo to line drawing', 'pencil sketch effect'],
    steps: [
      'Drop one or more photos (JPG, PNG, WebP, HEIC, AVIF or JPEG XL).',
      'Pick pencil, charcoal or coloured pencil and adjust stroke width and darkness while you watch the preview.',
      'Press Make the sketch and download the drawings, one by one or as a zip.',
    ],
    faq: [
      {
        q: 'Which photos make the best sketches?',
        a: 'Photos with clear edges and even light: a portrait by a window, a building, a pet against a plain wall. Busy backgrounds turn into scribbles, so crop tight or remove the background first. Very dark photos give heavy, smudgy sketches; brighten them first.',
      },
      {
        q: 'What do stroke width and darkness change?',
        a: 'Stroke width sets how far the effect looks around each edge: low values give fine pen-like lines, high values soft, shaded pencil. Darkness presses harder on every line. Charcoal starts darker and more contrasted than pencil.',
      },
      {
        q: 'Is this AI?',
        a: 'No. It is the classic colour dodge technique artists use in Photoshop: a grey copy of the photo is divided by a blurred negative of itself, so flat areas go white and edges stay as strokes. It is plain arithmetic on the pixels, with no AI model to download, so it gives the same result every time.',
      },
      {
        q: 'Can I print the sketch?',
        a: 'Yes. The sketch keeps the photo’s full resolution, so a 12 megapixel phone photo prints sharply at A4 or letter size. Save as PNG for printing line art without JPG speckles.',
      },
      {
        q: 'Are my photos uploaded?',
        a: 'No. Each photo is turned into a sketch pixel by pixel in your browser tab and saved from there. Family photos and portraits stay on your device.',
      },
    ],
  },
  {
    slug: 'add-border-to-image',
    icon: 'frame',
    name: 'Add border to image',
    title: 'Add a Border or Rounded Corners to an Image, Free | Stayput',
    description:
      'Put a white, black or coloured border around a picture and round its corners, from a subtle frame to a circle. Live preview, batches, no upload.',
    heading: 'Add a border to an image',
    tagline: 'A clean frame and rounded corners for photos, screenshots and product shots, made on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop pictures to frame',
    action: 'Add the border',
    keywords: ['add border to image', 'add border to photo', 'image border', 'white border for photo', 'rounded corners image', 'round image corners', 'photo frame online'],
    steps: [
      'Drop one or more pictures.',
      'Set the border width and colour, and round the corners if you like; the preview shows the first picture.',
      'Press Add the border and download the framed pictures.',
    ],
    faq: [
      {
        q: 'How is the border width measured?',
        a: 'As a share of the picture’s shorter side, added on every edge, so a batch of different sizes gets frames that look the same. 3 to 5% is a gallery-style mat; 10% or more is a thick polaroid-like frame.',
      },
      {
        q: 'Why is my rounded image a PNG?',
        a: 'The corners outside the curve need to be transparent so the picture sits cleanly on any background. JPG cannot store transparency, so with rounded corners the automatic setting saves PNG. Choose JPG to put the corners on white instead.',
      },
      {
        q: 'Can I make a circle?',
        a: 'Set rounded corners to 50%. A square picture becomes a circle and a rectangle becomes a pill shape. For a circular profile picture cropped to the face, the crop tool’s circle shape is quicker.',
      },
      {
        q: 'Does it change the picture itself?',
        a: 'No. The picture is drawn at full size inside the frame; only the new border and corners are added. The output is larger by the border on each side.',
      },
      {
        q: 'Are my pictures uploaded?',
        a: 'No. The frame is drawn on a canvas in your browser tab and saved from there. Your files are not uploaded.',
      },
    ],
  },
  {
    slug: 'black-and-white-image',
    icon: 'contrast',
    name: 'Black and white photo',
    title: 'Make a Photo Black and White, Free, No Upload | Stayput',
    description:
      'Turn photos black and white: grayscale, high contrast, pure black and white for scans and signatures, or sepia. Live preview, batches, no upload.',
    heading: 'Make a photo black and white',
    tagline: 'Grayscale, high contrast, two-tone or sepia, previewed live and made on this device.',
    category: 'images',
    accept: 'image/*,.heic,.heif,.avif,.jxl',
    multiple: true,
    dropLabel: 'Drop photos to make black and white',
    action: 'Convert',
    keywords: ['black and white photo', 'convert image to black and white', 'black and white filter', 'make photo black and white', 'grayscale image', 'sepia filter', 'black and white converter'],
    steps: [
      'Drop one or more photos (JPG, PNG, WebP, HEIC, AVIF or JPEG XL).',
      'Pick a look: grayscale, high contrast, pure black and white, or sepia. The first photo previews it.',
      'Download the converted photos, one by one or as a zip.',
    ],
    faq: [
      {
        q: 'Are my photos uploaded?',
        a: 'No. Each photo is decoded, converted and saved by code running in your browser tab. Your files are not uploaded, and the page works offline after one visit and a short wait.',
      },
      {
        q: 'What is the difference between the looks?',
        a: 'Grayscale keeps every tone of the original as a shade of grey. High contrast stretches those tones so the darks are deeper and the lights brighter, which suits portraits and street photos. Pure black and white uses only two colours, ideal for a scanned document, a signature or a stencil. Sepia gives the warm brown of an old print.',
      },
      {
        q: 'How do I make a signature or scan clean black and white?',
        a: 'Choose Pure black and white and PNG. The split between ink and paper is chosen automatically from the image, so grey paper becomes white and pen strokes become solid black. Photograph the page in even light for the cleanest result.',
      },
      {
        q: 'Does it keep transparency?',
        a: 'Yes, when you save as PNG or WebP. JPG has no transparency, so transparent areas become white.',
      },
      {
        q: 'Is the location and camera data kept?',
        a: 'No. The converted photo is a new image drawn by your browser, so EXIF data such as GPS location, camera model and date is not carried over.',
      },
    ],
  },
  {
    slug: 'grayscale-pdf',
    icon: 'contrast',
    name: 'Grayscale PDF',
    title: 'Convert PDF to Grayscale, Text Kept, No Upload | Stayput',
    description:
      'Turn a colour PDF into grayscale for printing or submission. The colour is rewritten to gray inside the file, text stays text and sharp (scanned pages are images and stay images), and the file does not grow. Runs in your browser; nothing is uploaded.',
    heading: 'Convert a PDF to grayscale',
    tagline: 'Every colour becomes its own shade of grey, and the text stays text.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: true,
    dropLabel: 'Drop PDFs to convert to grayscale',
    action: 'Convert to grayscale',
    keywords: ['pdf to grayscale', 'grayscale pdf', 'convert pdf to grayscale', 'pdf black and white', 'remove color from pdf', 'greyscale pdf', 'print pdf in grayscale'],
    steps: [
      'Drop one or more PDFs, or tap to pick them.',
      'Press Convert to grayscale.',
      'Download the grayscale copies. Pages, text, links and bookmarks are kept.',
    ],
    faq: [
      {
        q: 'Is my PDF uploaded?',
        a: 'No. The conversion runs in your browser tab, so the document stays on your device, and the page works offline after one visit and a short wait.',
      },
      {
        q: 'Will the text still be selectable?',
        a: 'If the PDF has text, yes. The pages are not turned into pictures: the colour settings inside each page are rewritten to gray and the text itself is not touched, so it can still be selected, searched and copied, and it stays sharp at any zoom. A scanned PDF is made of page images with no text layer, so it stays that way unless it was run through OCR.',
      },
      {
        q: 'Why would I need a grayscale PDF?',
        a: 'Some courts, universities, grant portals and print shops ask for documents in black and white, and a grayscale copy shows how a colour chart or slide deck will look on a mono printer before you print it. Office printers set to colour can also charge a colour page for a single blue logo. The colour is taken out of the file itself, not just painted over, so a colour-space check passes for everything the tool can read. The exception is rare colour kinds, such as spot colours (Pantone and similar), Lab colour and JPEG 2000 images, which it can’t rewrite: a page with any of those is greyed over instead, and the result says how many pages that was.',
      },
      {
        q: 'Do different colours stay distinguishable?',
        a: 'Colours of different brightness become different greys; colours of similar brightness, such as a mid red and a mid green, can end up almost the same grey. Check charts and colour-coded tables in the result before you send it.',
      },
      {
        q: 'Are comments and form fields converted too?',
        a: 'Highlights, sticky notes and form fields that store their own look are converted along with the page, and so are their border and fill colours. Rich-text styling inside some comments is not rewritten, so such a note can still show colour in a reader. Flatten them into the page first if everything must be grey.',
      },
      {
        q: 'What happens to colour it can’t convert?',
        a: 'That page keeps a grey layer drawn over it, so it looks and prints grey, but its colour data is still stored in the file. The result line says how many pages that is, for example “12 pages converted; 1 page has colour we couldn’t convert and is greyed on top”. The other pages are converted for real.',
      },
      {
        q: 'Does the file get bigger?',
        a: 'Usually not. Colour images become one-channel gray images, so a PDF with photos or colour scans is often smaller, and a text-only PDF changes by a few dozen bytes. JPEG photos are decoded in your tab and saved again as grayscale JPEGs at high quality, which adds a very small extra loss. A page that falls back to the grey layer gets a few hundred bytes more.',
      },
    ],
  },
  {
    slug: 'crop-pdf',
    icon: 'crop',
    name: 'Crop PDF',
    title: 'Crop PDF Pages and Trim Margins, Free, No Upload | Stayput',
    description:
      'Crop PDF pages to the area you draw, or trim white margins from every page in one click. Text stays sharp and selectable. Runs in your browser, no upload.',
    heading: 'Crop a PDF',
    tagline: 'Cut PDF pages down to what matters: draw the area to keep, or trim the white margins automatically.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: false,
    dropLabel: 'Drop a PDF to crop',
    action: 'Download cropped PDF',
    keywords: ['crop pdf', 'crop pdf pages', 'trim pdf margins', 'remove white margins from pdf', 'cut pdf page', 'resize pdf page', 'crop pdf online free'],
    steps: [
      'Drop the PDF. Its pages appear here, drawn in your browser.',
      'Press Trim white margins to crop each page to its content, or drag on a page to draw the area to keep, for every page or just that one.',
      'Download the cropped PDF. Text, links and images inside the area stay exactly as they were.',
    ],
    faq: [
      {
        q: 'Is my PDF uploaded?',
        a: 'No. The pages are drawn and the crop is written by code running in your browser tab, so the document never leaves your device, and the page works offline after one visit and a short wait.',
      },
      {
        q: 'Does cropping lower the quality?',
        a: 'No. The pages are not turned into pictures: the tool changes the page boxes that tell every viewer and printer which part of the page to show. Text stays sharp at any zoom and can still be selected and searched.',
      },
      {
        q: 'Is the cropped-off part deleted?',
        a: 'No, it is hidden. Every PDF viewer and printer shows only the cropped area, but the content outside it is still in the file and a PDF editor can bring it back. To remove something for good, such as an account number in a margin, use the redact PDF tool instead.',
      },
      {
        q: 'What does Trim white margins do?',
        a: 'It looks at each page on its own and crops it to the smallest box that holds all its text and images, plus a small margin, so a page with a wide border becomes easier to read on a phone or e-reader. Pages that are already full are left alone.',
      },
      {
        q: 'Can I crop pages to different sizes?',
        a: 'Yes. Choose This page before you draw and the box applies only to the page you are looking at. Trim white margins always works page by page. Go to another page and draw again to crop it differently.',
      },
      {
        q: 'Why is the file almost the same size?',
        a: 'Because nothing is removed from the pages, only hidden. If you need a smaller file, run the cropped PDF through the compress PDF tool.',
      },
    ],
  },
  {
    slug: 'redact-pdf',
    icon: 'redact',
    name: 'Redact PDF',
    title: 'Redact PDF Free, Text Really Removed, No Upload | Stayput',
    description:
      'Black out names, numbers and addresses in a PDF so the text underneath is gone, not just covered. Search or draw boxes; the PDF never leaves your browser.',
    heading: 'Redact a PDF',
    tagline: 'Find a name or number and black it out for good, or draw boxes by hand. The document stays on this device.',
    category: 'pdf',
    accept: 'application/pdf,.pdf',
    multiple: false,
    dropLabel: 'Drop a PDF to redact',
    action: 'Download redacted PDF',
    keywords: ['redact pdf', 'redact pdf free', 'black out text in pdf', 'pdf redaction tool', 'censor pdf', 'hide text in pdf', 'remove sensitive information from pdf'],
    steps: [
      'Drop the PDF. Its pages show up here, drawn in your browser.',
      'Type a name, account number or address and press Redact all matches, or use the email, phone and long-number buttons. Drag on a page to black out anything else, such as a signature or a photo.',
      'Download the redacted PDF. Pages with a box become flat images with the text removed; the other pages stay as they were.',
    ],
    faq: [
      {
        q: 'Can I add text, a highlight or an image to the PDF too?',
        a: 'Yes. [Edit PDF](/tools/edit-pdf) adds text, cover boxes, highlights, drawings and images to a page and rotates, deletes or reorders pages, all in your browser. It cannot change the text already in the file.',
      },
      {
        q: 'Is the text really gone, or just covered?',
        a: 'Gone. Each page you redact is redrawn as an image with the black boxes painted into it, and the page’s original text, fonts, links, comments and form values are deleted from the file. Copy and paste, search and text extractors find nothing under the boxes. That is the difference from drawing a black rectangle in a PDF editor, which leaves the words underneath for anyone to select.',
      },
      {
        q: 'Is my PDF uploaded?',
        a: 'No. The pages are drawn, searched and rewritten by code running in your browser tab, so a bank statement, medical record, court filing or HR document never leaves your device. The page works with Wi-Fi off after one visit and a short wait.',
      },
      {
        q: 'Why can I no longer select text on the redacted pages?',
        a: 'Because the whole page became an image, which is what makes the redaction safe. Pages without boxes keep their selectable text. If you need the rest of a redacted page searchable, run the result through the image to text tool, or redact as few pages as you can.',
      },
      {
        q: 'Does the search find everything?',
        a: 'It finds text the PDF stores as text, on every page at once, ignoring upper and lower case. It cannot read words that are part of a picture, such as a scanned page or a photo of an ID, and a match that is split across two lines is missed. Look through each page before you download, and draw boxes over anything left.',
      },
      {
        q: 'What else is removed?',
        a: 'The document’s metadata (author, title, creating software, dates, XMP and file ID), because the author is often the very name you are redacting, and the accessibility tags, which can repeat page text. Bookmarks and links on the pages you did not redact keep working.',
      },
      {
        q: 'Does it work on scanned or password-protected PDFs?',
        a: 'Scans work: draw the boxes by hand, since a scan has no text to search. A PDF that only needs a password to edit is handled automatically. If it asks for a password to open, you are prompted for it, and the result is saved without the password.',
      },
    ],
  },
  {
    slug: 'file-checksum',
    icon: 'hash',
    name: 'File Checksum',
    title: 'MD5 & SHA-256 File Checksum, No Upload | Stayput',
    description:
      'Get the MD5, SHA-1 or SHA-256 checksum of a file and compare it with the one the publisher lists. Runs in your browser; the file is not uploaded.',
    heading: "Check a file's MD5 or SHA-256 checksum",
    tagline: "Get a file's checksum on your device and compare it with the one the publisher lists.",
    category: 'pdf',
    accept: '',
    multiple: true,
    dropLabel: 'Drop files to checksum',
    action: 'Calculate checksums',
    sizeFact: 'No account, no watermark',
    keywords: ['md5 checksum', 'file hash', 'sha256 checksum', 'md5 checksum of file', 'file hash checker', 'verify file checksum', 'checksum checker online'],
    steps: [
      'Drop a file, or several, or tap to pick them. Nothing is uploaded.',
      'Press Calculate checksums. A large file takes a while; a progress bar shows how far it has got.',
      'Paste the checksum the publisher gave you into the compare box to see whether it matches. Copy any value with its Copy button.',
    ],
    faq: [
      {
        q: "How do I check a file's checksum?",
        a: 'Drop the file and press Calculate checksums. You get its MD5, SHA-1 and SHA-256 values; use whichever one the download page lists. Paste the published value into the compare box and it says whether it matches, and which algorithm matched. Capital letters and spaces in the pasted value do not matter.',
      },
      {
        q: 'Is the file uploaded?',
        a: 'No. The file is read by this tab and hashed on your device; only the page itself is downloaded. Neither the file, its name nor the checksums are sent anywhere.',
      },
      {
        q: 'Is MD5 secure? Which should I use?',
        a: 'No. MD5 is not secure against deliberate tampering, because attackers can craft two different files with the same MD5. It still catches accidental corruption, such as a broken download. If the publisher lists SHA-256, use that. A matching hash also does not prove a file is safe, only that it is the same file the publisher hashed, and that is only as trustworthy as where you got the checksum.',
      },
      {
        q: 'What is the difference between MD5, SHA-1 and SHA-256?',
        a: 'They are different algorithms that give different-length fingerprints: 128, 160 and 256 bits. The same file gives a different value in each, so compare like with like. MD5 and SHA-1 are broken for security use; SHA-256 is the usual choice.',
      },
      {
        q: 'How do I get a checksum on Windows without installing anything?',
        a: '`certutil -hashfile <file> SHA256` in Command Prompt, or `Get-FileHash <file> -Algorithm SHA256` in PowerShell, give the same answer as this tool. Use MD5 or SHA1 in place of SHA256 for the other algorithms.',
      },
      {
        q: 'Can it hash a very large file, like an ISO?',
        a: 'It is built for large files: it reads the file in small pieces rather than loading it whole, so a multi-gigabyte ISO does not need that much memory. It is still bounded by your device. A phone or a low-memory computer may run out of memory or take a very long time, and then the page says so instead of giving a result. If that happens, use certutil, Get-FileHash or shasum on the file instead.',
      },
    ],
  },
  {
    slug: 'json-to-csv',
    icon: 'convert',
    name: 'JSON ↔ CSV',
    title: 'JSON to CSV and CSV to JSON Converter, No Upload | Stayput',
    description:
      'Convert JSON to CSV or CSV to JSON in your browser. Paste text or drop a file, flatten nested data, pick the delimiter. What you paste is not uploaded.',
    heading: 'Convert JSON to CSV, or CSV to JSON',
    tagline: 'Paste or drop your data, choose a direction and get a table or an array back. What you paste stays on this device.',
    sections: [
      {
        heading: 'Related tools',
        paragraphs: [
          'Data exports often arrive zipped and need checking. The [archive opener](/tools/archive-extractor) opens the ZIP an export comes in, [File Checksum](/tools/file-checksum) confirms a download is intact, and [Create ZIP](/tools/create-zip) packs the converted files together.',
        ],
      },
    ],
    category: 'pdf',
    accept: '.json,.csv,.tsv,.txt,application/json,text/csv',
    multiple: false,
    dropLabel: 'Drop a JSON or CSV file',
    action: 'Convert',
    sizeFact: 'No account, no watermark. A file can be up to 200 MB, and phones hold less.',
    keywords: ['json to csv', 'csv to json', 'json to csv converter', 'convert json to csv', 'csv to json format', 'json to csv online'],
    steps: [
      'Paste JSON or CSV into the box, or drop a .json or .csv file. The direction is picked from what you gave it, and you can change it.',
      'Set the options: the delimiter, whether the first row is headers, and how nested data is handled.',
      'Convert, check the preview, then copy the result or download it.',
    ],
    faq: [
      {
        q: 'How do I convert JSON to CSV?',
        a: 'Paste the JSON or drop the file, check that the direction says JSON to CSV, and press Convert. An array of objects becomes a table: each object is a row and each key a column, with the columns taken from every key that appears. Copy it, or download the .csv file.',
      },
      {
        q: 'What happens to nested objects and arrays?',
        a: 'Nested objects are flattened into columns named with a dot, so `{"user":{"name":"Ada"}}` gives a `user.name` column. Arrays go into one cell as JSON text, or joined with a semicolon if you tick that option. Untick Flatten nested objects if you want the whole nested value kept as text in one cell.',
      },
      {
        q: 'Why does my CSV look wrong in Excel?',
        a: 'Excel in many countries expects a semicolon, not a comma, and reads non-English letters wrongly unless the file starts with a byte-order mark. Keep UTF-8 with BOM ticked and choose Semicolon if your columns land in one cell.',
      },
      {
        q: 'How are numbers, true/false and empty values handled going from CSV to JSON?',
        a: 'By default every value stays text, exactly as it is in the CSV, so an id such as 00123 is not changed. Tick Detect types to turn numbers, true and false and null into real JSON values; long digit strings and values with leading zeros stay as text even then.',
      },
      {
        q: 'Is my data uploaded?',
        a: 'No. What you paste, and any file you drop, is converted by code running in this page and is not uploaded; the only thing the site counts is the anonymous usage listed on the privacy page. A file can be up to 200 MB, and the page keeps working offline after one visit and a short wait.',
      },
      {
        q: 'Can it handle a big file?',
        a: 'The conversion runs in the background so the page stays usable. A file over 200 MB is refused as too large for a browser tab, and a phone may run out of memory on a smaller one, in which case the page says so instead of giving a half result. Split the file and convert the pieces if that happens.',
      },
    ],
  },
  {
    slug: 'subtitle-converter',
    name: 'Subtitle converter',
    icon: 'text',
    title: 'SRT to VTT and VTT to SRT Converter, No Upload | Stayput',
    description: 'Convert SRT to VTT, or VTT to SRT, in your browser. The format changes and the words and timing stay. Free, no account, not uploaded.',
    heading: 'Convert SRT to VTT, or VTT to SRT',
    tagline: 'Change a subtitle file between SRT and WebVTT on this device. The format changes; the words and timing stay.',
    category: 'media',
    accept: '.srt,.vtt,text/vtt,application/x-subrip,text/plain',
    multiple: true,
    dropLabel: 'Drop SRT or VTT subtitle files',
    action: 'Convert',
    keywords: ['srt to vtt', 'vtt to srt', 'srt to vtt converter', 'convert srt to vtt', 'convert vtt to srt', 'subtitle converter', 'webvtt to srt'],
    sizeFact: 'No watermark, no sign-up. Subtitle files are plain text and convert in an instant',
    lead: 'Converts a subtitle file from SRT to WebVTT, or from WebVTT to SRT, and keeps every caption’s words and timing. It is free, needs no sign-up and adds no watermark, and your file is not uploaded: it is a plain text file, read and rewritten by code in this tab. It changes the format only. It does not translate the captions.',
    steps: [
      'Drop one or more .srt or .vtt files, or tap to pick them.',
      'Press Convert. An .srt file becomes a .vtt file, and a .vtt file becomes an .srt file.',
      'Download the converted file, or a zip if you dropped several.',
    ],
    sections: [
      {
        heading: 'Worked example: SRT to VTT for a web page',
        paragraphs: [
          'You have lecture.srt, made for a video editor, and now you want the same captions on a web page, where the track element wants WebVTT. This is the start of it:',
          '1\n00:00:01,000 --> 00:00:03,500\nWelcome to the course.\n\n2\n00:00:04,000 --> 00:00:07,200\nToday we start with the basics.',
          'Drop it here and press Convert. You get lecture.vtt:',
          'WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nWelcome to the course.\n\n00:00:04.000 --> 00:00:07.200\nToday we start with the basics.',
          'Three things changed: a WEBVTT line at the top, a full stop where SRT had a comma before the milliseconds, and the caption numbers are gone. The words and the times are as they were. Going from VTT to SRT reverses that: the header goes, the numbers are written from 1, and the full stop becomes a comma.',
        ],
      },
      {
        heading: 'No subtitle file yet?',
        paragraphs: [
          'If you only have the video, [Video to subtitles](/video-to-subtitles) writes an SRT or WebVTT file from the speech, on your device, with the speech model running in your browser. Bring the result back here if you need it in the other format.',
          'If you want the words drawn into the picture, so they show everywhere the video plays, [Burn subtitles into video](/burn-subtitles-into-video) takes an SRT or VTT file you already have, and [Add subtitles to video](/tools/add-subtitles-to-video) can also write the captions from the speech first.',
        ],
      },
    ],
    faq: [
      { q: 'How do I convert SRT to VTT?', a: 'Drop the .srt file on this page and press Convert. The result is a .vtt file with a WEBVTT line at the top and full stops in the times. Load it in a track element on your page, or in any player that wants WebVTT.' },
      { q: 'How do I convert VTT to SRT?', a: 'Drop the .vtt file and press Convert. The WEBVTT header is removed, each caption is numbered from 1 and the times use commas. The same page does both directions, and it picks the one that fits the file you drop.' },
      { q: 'Does it translate the subtitles?', a: 'No. It changes the file format and nothing else, so the words stay in the language they are in. For a translation you need a translator, then convert the result here if the format is wrong. The speech tools are a different job: [Video to subtitles](/video-to-subtitles) can write English captions from foreign-language speech, and it works on the audio, not on a subtitle file.' },
      { q: 'What is lost when I convert VTT to SRT?', a: 'The words and the timing carry over. SRT has nowhere to keep a WebVTT caption’s position and alignment settings, or its notes, style blocks and caption names, so those are left out. If a VTT file places captions at the top of the frame, the SRT will not. Italics and bold inside a caption are not carried over.' },
      { q: 'Why do I need to convert subtitles at all?', a: 'The two formats are read by different programs. SRT is the one that video editors and most desktop players take. WebVTT is the one web pages use with the track element. A file made for one will not load in the other until it is converted.' },
      { q: 'Does my subtitle file stay on my computer?', a: 'Yes. The page opens your file with the browser’s file reader, rewrites the text in memory and offers the new file back to you. Subtitles can be a transcript of a private meeting, so it matters that no part of one goes to a server. Open the network tab while you convert, and your file is not among the requests.' },
    ],
  },
  {
    slug: 'audio-splitter',
    icon: 'scissors',
    name: 'Audio splitter',
    title: 'Audio Splitter: Split an MP3 or WAV into Parts | Stayput',
    description: 'Split an MP3, WAV, M4A or FLAC file into separate parts at times you set or every few minutes, in your browser. Free, no account, not uploaded.',
    heading: 'Split an audio file',
    tagline: 'Cut one long recording into separate files at the times you choose or at equal lengths. Done on this device, and the file is not uploaded.',
    category: 'media',
    accept: 'audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.mp4,.mov,.webm,.mkv',
    multiple: false,
    dropLabel: 'Drop a sound file to split',
    action: 'Split audio',
    sizeFact: 'No watermark. The limit is your device’s memory (phones hold less): a long recording may need a computer.',
    keywords: ['audio splitter', 'split audio', 'split mp3', 'mp3 splitter', 'split audio file', 'split wav file', 'audio splitter online', 'cut audio into parts'],
    lead: 'Splits one audio file into separate parts, either at the times you type or every few minutes, and saves them as MP3 or WAV files. It is free, needs no account and adds no watermark, and your file is not uploaded: your browser decodes the sound and cuts it inside this tab. The size limit is your device’s memory, and phones hold less; after one visit and a short wait the page works offline, and MP3 output needs one MP3 run first.',
    steps: [
      'Drop a sound file (MP3, WAV, M4A, OGG, FLAC) or a video, or tap to pick one.',
      'Choose how to split: type the times where each new part should start, or pick a length such as every 10 minutes. The page lists the parts it will make.',
      'Press Split audio. The parts are saved as MP3 or WAV files, and Download all gives you them in one zip.',
    ],
    sections: [
      {
        heading: 'A worked example',
        paragraphs: [
          'You have rehearsal.wav, a 62-minute recording of a band practice, and you want each song as its own file. The songs start at 11:30, 24:10 and 41:45. Choose At times I type and type 11:30, 24:10, 41:45.',
          'Press Split audio and you get four parts: 0:00 to 11:30, 11:30 to 24:10, 24:10 to 41:45, and 41:45 to the end. They are named rehearsal-part-1 to rehearsal-part-4. Every part starts at the sample where the one before it ended, so no sound falls between two parts.',
          'Prefer equal pieces? Choose Every so often and type 10 minutes: a 25-minute file becomes parts of 10, 10 and 5 minutes. The last part is whatever is left.',
        ],
      },
      {
        heading: 'What this page does and does not do',
        bullets: [
          'It splits where you say. It does not find silences or chapters on its own. To take the long pauses out of a recording, use [Remove silence](/tools/remove-silence).',
          'It works on one file at a time. The whole file is decoded in your browser’s memory, so a long recording takes more memory, and a phone may run out of it sooner than a computer.',
          'It makes up to 100 parts in one run. Parts are saved as MP3 at 192 kbps or as 16-bit WAV at 44.1 kHz. To keep just one stretch of a file, [Trim audio](/tools/trim-audio) is the simpler page.',
        ],
      },
    ],
    faq: [
      { q: 'How do I split an audio file?', a: 'Drop the file, type the times where each new part should begin (for example 12:30 and 31:05), and press Split audio. Each part is a separate file, and a Download all button gives you the lot as one zip.' },
      { q: 'Can I split a file into equal parts?', a: 'Yes. Choose Every so often and give a length in minutes or seconds. A file is cut into parts of that length, and the last part is the remainder, so it can be shorter.' },
      { q: 'How many parts can it make?', a: 'Up to 100 in one run. If your times or length would make more, the page says so and shows how many it would make; use fewer times or a longer length, or run the file again on a part.' },
      { q: 'Does splitting lower the quality?', a: 'WAV parts keep the sound exactly as your browser decoded it, written as 16-bit at 44.1 kHz. MP3 parts are encoded again at 192 kbps, so they lose a little, as any MP3 re-encode does. A file at another sample rate, or with more than two channels, is converted to 44.1 kHz and at most stereo first. If you will edit the parts further, choose WAV.' },
      { q: 'How long a file can I split?', a: 'The size limit is your device’s memory, and phones hold less than computers. The whole file is decoded in the tab before it is cut, so a very long recording needs more memory than a short one. If a phone struggles, a computer will usually manage, or cut the recording down first with [Trim audio](/tools/trim-audio).' },
      { q: 'Will the parts play back to back without a gap?', a: 'WAV parts join exactly. MP3 parts can have a very short gap when played back to back, because MP3 encoders add a little padding at the start and end of each file. If the parts must play back with no gap, choose WAV.' },
      { q: 'Can it split where the silence is?', a: 'Not on this page: you give the times. [Remove silence](/tools/remove-silence) cuts long pauses out of a recording, but it makes one file, not several.' },
      { q: 'Can I split the sound of a video?', a: 'Yes. Drop the video and its sound track is loaded; the parts are saved as audio only.' },
      { q: 'Can I split an audio file without uploading it?', a: 'Yes. Your browser decodes the sound, cuts it and writes each part with code running in this tab. Open the network tab, run a split, and your recording is not among the requests. After one visit and a short wait the page works offline, and MP3 output needs one MP3 run first.' },
    ],
  },
  {
    slug: 'gif-to-animated-png',
    icon: 'film',
    lead:
      'Converts animated GIFs to animated PNG (APNG), keeping every frame, its delay, the loop count and transparent areas, with full colour instead of the GIF’s 256. It is free, and your GIFs are not uploaded: each frame is decoded and written by your browser. The size limit is your device’s memory (phones hold less), and after one visit and a short wait the page works offline.',
    name: 'GIF to APNG',
    title: 'GIF to Animated PNG (APNG) Converter, Free | Stayput',
    description:
      'Convert animated GIFs to animated PNG (APNG) in your browser. Keeps timing, looping and transparency. Free, batch, no watermark, not uploaded.',
    heading: 'Convert GIF to animated PNG',
    tagline: 'Turn animated GIFs into animated PNG (APNG) files with their timing, looping and transparency. Converted on this device, never uploaded.',
    category: 'images',
    accept: 'image/gif,.gif',
    multiple: true,
    dropLabel: 'Drop GIFs to convert to APNG',
    action: 'Convert to APNG',
    keywords: ['gif to apng', 'gif to animated png', 'convert gif to apng', 'gif to apng converter', 'animated gif to apng'],
    steps: [
      'Drop one or more animated GIFs, or tap to pick them.',
      'Convert. Each GIF is decoded and written as an animated PNG in your browser.',
      'Download the .png file, or a zip when you converted several.',
    ],
    faq: [
      {
        q: 'Is my GIF uploaded?',
        a: 'No. The GIF is decoded by code in this page and the animated PNG is written in your browser’s memory. There is no server in the process, and after one visit and a short wait the page works with Wi-Fi off.',
      },
      {
        q: 'Will the APNG be smaller than the GIF?',
        a: 'Not necessarily. An APNG stores full colour for every frame, and for flat-colour animation such as logos and pixel art it is often larger than the GIF. Convert for the quality and the smooth transparency, not for the size. If size is the goal, [GIF to MP4](/tools/gif-to-mp4) is usually far smaller.',
      },
      {
        q: 'Does it keep the timing, the looping and the transparency?',
        a: 'Yes. Each frame keeps its own delay, the loop count from the GIF is written into the file (a GIF with no loop setting plays once), and see-through areas stay see-through, with soft edges where the GIF had hard ones. Frames with a delay of 0 or 1 hundredths of a second are given a tenth of a second, which is what every browser does with them too.',
      },
      {
        q: 'Where does an APNG play?',
        a: 'In Safari, Chrome, Edge and Firefox, and in many image viewers and editors. Some chat apps, social sites and upload forms flatten an APNG to its first frame, or refuse it, and some only accept GIF. Check where you will use it; the file is a normal .png, so a program that does not know APNG shows the first frame.',
      },
      {
        q: 'Why is it a .png file and not .apng?',
        a: 'An APNG is a PNG with extra animation chunks, so the usual extension is .png and programs that do not understand animation still open it as a still picture. The file you get is named after your GIF with .png.',
      },
    ],
  },
  {
    slug: 'animated-png-to-gif',
    icon: 'film',
    lead:
      'Converts animated PNG (APNG) files to animated GIF, keeping every frame, its delay and the loop count, at the same size. GIF has 256 colours per frame and no soft transparency, so gradients dither and soft edges become hard ones. It is free, and your files are not uploaded: each frame is decoded and written by your browser.',
    name: 'APNG to GIF',
    title: 'Animated PNG (APNG) to GIF Converter, Free | Stayput',
    description:
      'Convert animated PNG (APNG) files to GIF in your browser. Keeps timing and looping, 256 colours per frame. Free, batch, no watermark, not uploaded.',
    heading: 'Convert animated PNG to GIF',
    tagline: 'Turn APNG files into animated GIFs that chat apps and upload forms accept. Converted on this device, never uploaded.',
    category: 'images',
    accept: 'image/png,.png,.apng',
    multiple: true,
    dropLabel: 'Drop APNG files to convert to GIF',
    action: 'Convert to GIF',
    keywords: ['apng to gif', 'animated png to gif', 'convert apng to gif', 'apng to gif converter', 'apng to gif online'],
    steps: [
      'Drop one or more animated PNG files (.png or .apng), or tap to pick them.',
      'Convert. Each one is decoded and written as a GIF in your browser.',
      'Download the .gif file, or a zip when you converted several.',
    ],
    faq: [
      {
        q: 'Why does the GIF look worse than the APNG?',
        a: 'GIF holds 256 colours per frame and its transparency is on or off, with no soft edges. An APNG has full colour and 8-bit transparency, so smooth gradients show banding or dithering in the GIF, and a soft shadow or anti-aliased edge becomes a hard edge. Each frame gets its own palette to keep the loss small.',
      },
      {
        q: 'Will the GIF be smaller than the APNG?',
        a: 'Usually only a little, and sometimes it grows. GIF drops colour information, but it stores each frame whole and compresses less well than PNG on photographic frames. For a much smaller file, run it through [Compress GIF](/tools/compress-gif) or turn it into video with [GIF to MP4](/tools/gif-to-mp4).',
      },
      {
        q: 'Why would I want a GIF instead of an APNG?',
        a: 'Many chat apps, social sites and upload forms only accept GIF, or flatten an APNG to its first frame. A GIF plays nearly everywhere.',
      },
      {
        q: 'Does it keep the timing and the looping?',
        a: 'Yes. Each frame keeps its delay (anything under 20 ms is raised to 20 ms, which browsers show at 100 ms anyway), and the loop count is carried over: forever stays forever, and an animation that plays once stays once.',
      },
      {
        q: 'Is my file uploaded?',
        a: 'No. The APNG is decoded by code in this page and the GIF is written in your browser’s memory. There is no server in the process, and after one visit and a short wait the page works with Wi-Fi off.',
      },
    ],
  },
];

export const toolBySlug = (slug: string): Tool | undefined => tools.find((t) => t.slug === slug);

export const categories: { id: Category; label: string; blurb: string }[] = [
  { id: 'images', label: 'Image tools', blurb: 'Convert, shrink and clean photos.' },
  { id: 'pdf', label: 'PDF tools', blurb: 'Merge, split, compress, sign; open archives.' },
  { id: 'media', label: 'Video and audio tools', blurb: 'Trim, compress and convert clips, make GIFs.' },
];
