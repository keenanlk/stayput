import type { Tool } from './tools';
import { toolBySlug } from './tools.ts';

/**
 * Landing pages that are a preset of an existing tool ("JPG to PDF" is the
 * images-to-PDF tool with its copy written for that search). Like format
 * pairs they live at /<slug>, carry their own copy, FAQ and social image, and
 * run the base tool's script with the option defaults below.
 */
export interface Preset {
  slug: string;
  /** Slug of the tool whose options and script the page runs. */
  base: string;
  name: string;
  title: string;
  description: string;
  heading: string;
  tagline: string;
  keywords: string[];
  intro: string[];
  steps: string[];
  faq: { q: string; a: string }[];
  dropLabel?: string;
  action?: string;
  accept?: string;
  /** Option element id (or radio group name) to preselected value. */
  defaults?: Record<string, string>;
}

const noUpload = { q: 'Is the file uploaded anywhere?', a: 'No. There is no server in this process. The page is a static file and the work is done by code running inside your browser tab. You can load the page, turn off Wi-Fi, and it still works.' };

export const presets: Preset[] = [
  {
    slug: 'jpg-to-pdf',
    base: 'image-to-pdf',
    name: 'JPG to PDF',
    title: 'JPG to PDF Converter, Free, No Upload | Stayput',
    description: 'Turn JPG photos into a single PDF in your browser. Choose page size, orientation and margins. Nothing is uploaded, no limits, works offline.',
    heading: 'Convert JPG to PDF',
    tagline: 'One PDF from one or many photos, made on your device, in the order you choose.',
    keywords: ['jpg to pdf', 'jpeg to pdf', 'convert jpg to pdf', 'jpg to pdf converter free', 'photo to pdf', 'combine jpg to pdf'],
    accept: 'image/jpeg,.jpg,.jpeg',
    dropLabel: 'Drop JPG photos here',
    defaults: { 'page-size': 'fit' },
    intro: [
      'Scanned receipts, photographed forms, a set of pictures a client asked for "as one document": JPG to PDF is the conversion people need most often, and it is the one most upload-based sites push through a queue and a sign-up wall. Here the PDF is written by pdf-lib inside your browser. Each JPG is embedded as-is, without re-encoding, so the pages look exactly like the photos and the PDF is barely larger than the JPGs combined.',
      'Drop several photos and they become pages in the order shown; use the arrows to reorder. "Fit to each image" makes every page the size of its photo, which is right for screenshots and scans. Pick A4 or US Letter with a margin when the PDF is going to be printed or attached to a form.',
    ],
    steps: [
      'Drop one or more JPG photos, or tap to pick them. Reorder with the arrows.',
      'Choose a page size (fit to image, A4 or Letter), orientation and margin.',
      'Convert, and the PDF downloads. Reload the page to clear everything from memory.',
    ],
    faq: [
      { q: 'Can I combine several JPGs into one PDF?', a: 'Yes. Every photo you add becomes a page in the same PDF, in the order listed. Drag the arrows to change the order before converting.' },
      { q: 'Does converting to PDF reduce the photo quality?', a: 'No. The JPG data is embedded in the PDF unchanged, byte for byte. If you want a smaller PDF, shrink the photos first with the compress tool and then convert.' },
      { q: 'What page size should I pick?', a: '"Fit to each image" for screenshots, scans and anything viewed on screen; A4 or Letter with a 10 mm margin for anything that will be printed or filed.' },
      noUpload,
    ],
  },
  {
    slug: 'png-to-pdf',
    base: 'image-to-pdf',
    name: 'PNG to PDF',
    title: 'PNG to PDF Converter, Free, No Upload | Stayput',
    description: 'Convert PNG images or screenshots to a PDF in your browser. Several PNGs become one document. No upload, no limits, works offline.',
    heading: 'Convert PNG to PDF',
    tagline: 'Screenshots and graphics into one PDF, on your device, with the sharp edges kept sharp.',
    keywords: ['png to pdf', 'convert png to pdf', 'png to pdf converter', 'screenshot to pdf', 'image to pdf free'],
    accept: 'image/png,.png',
    dropLabel: 'Drop PNG images here',
    defaults: { 'page-size': 'fit' },
    intro: [
      'PNG is what screenshots, diagrams and exported charts arrive as, and PDF is what a manager, a lawyer or a support desk wants back. The conversion is lossless: each PNG is embedded in the PDF as PNG data, so text in a screenshot stays crisp and transparent areas are kept transparent. Nothing is resampled and nothing is uploaded.',
      'Several PNGs become pages of one PDF in the order you set. "Fit to each image" gives every page the exact pixel size of its screenshot; A4 or Letter with a margin centres each image on a printable page.',
    ],
    steps: [
      'Drop one or more PNG files, or tap to pick them. Reorder with the arrows.',
      'Pick a page size, orientation and margin.',
      'Convert. The PDF downloads straight from your browser.',
    ],
    faq: [
      { q: 'Will text in my screenshots stay readable?', a: 'Yes. PNG is embedded losslessly, so the pixels in the PDF are identical to the screenshot. Zoom in and they are still sharp.' },
      { q: 'Is transparency preserved?', a: 'Yes. Transparent regions of the PNG stay transparent in the PDF; the page background shows through, which is white in most viewers.' },
      { q: 'Can I mix PNG and JPG in one PDF?', a: 'Yes. Use the general images to PDF tool, which accepts both together, plus WebP and HEIC.' },
      noUpload,
    ],
  },
  {
    slug: 'heic-to-pdf',
    base: 'image-to-pdf',
    name: 'HEIC to PDF',
    title: 'HEIC to PDF Converter, Free, No Upload | Stayput',
    description: 'Convert iPhone HEIC photos straight to a PDF in your browser, several photos per document. No upload, no limits, works offline.',
    heading: 'Convert HEIC to PDF',
    tagline: 'iPhone photos into a PDF that opens anywhere, decoded and assembled on your device.',
    keywords: ['heic to pdf', 'convert heic to pdf', 'iphone photos to pdf', 'heic to pdf converter free'],
    accept: '.heic,.heif,image/heic,image/heif',
    dropLabel: 'Drop HEIC photos here',
    defaults: { 'page-size': 'fit' },
    intro: [
      'Photograph a document with an iPhone and you get a HEIC file that Windows, many web forms and most email clients cannot show. A PDF sidesteps all of that. This page decodes each HEIC with libheif compiled to WebAssembly, running in your tab, then writes the photos into a PDF as JPG pages at high quality.',
      'Add every page of the document as a separate photo and reorder them with the arrows; the PDF keeps that order. Pick A4 or Letter with a small margin for forms and contracts, or "Fit to each image" to keep every photo at its own size.',
    ],
    steps: [
      'Drop HEIC or HEIF photos from an iPhone or iPad, or tap to pick them.',
      'Choose the page size, orientation and margin. Reorder pages with the arrows.',
      'Convert. The PDF downloads from your browser with nothing sent anywhere.',
    ],
    faq: [
      { q: 'Why can I not attach HEIC photos to a form?', a: 'HEIC is the format iPhones have used since iOS 11. It is compact, but many websites and Windows programs only accept JPG, PNG or PDF. Converting to PDF is the safest option for documents.' },
      { q: 'Is the photo quality kept?', a: 'The HEIC is decoded to pixels and re-encoded as JPG at quality 92 inside the PDF, which is visually identical for photographed documents. For a lossless copy, convert to PNG first and then use the PNG to PDF page.' },
      { q: 'Does the PDF contain the photo location?', a: 'No. Decoding the HEIC discards its EXIF block, including GPS, so the PDF carries no camera or location data.' },
      noUpload,
    ],
  },
  {
    slug: 'pdf-to-jpg',
    base: 'pdf-to-image',
    name: 'PDF to JPG',
    title: 'PDF to JPG Converter, Free, No Upload | Stayput',
    description: 'Convert PDF pages to JPG images in your browser at the resolution you choose. All pages or a range, zip download. Nothing is uploaded.',
    heading: 'Convert PDF to JPG',
    tagline: 'Every page of a PDF as a JPG image, rendered on your device.',
    keywords: ['pdf to jpg', 'pdf to jpeg', 'convert pdf to jpg', 'pdf to jpg converter free', 'pdf page to image'],
    defaults: { format: 'image/jpeg', dpi: '150' },
    intro: [
      'You need a page of a PDF as a picture: to paste into a slide, post a flyer on social media, or attach to a form that refuses PDFs. This page renders each page with pdf.js, the same engine Firefox uses to display PDFs, inside your browser, and saves it as a JPG at the resolution you pick.',
      '150 DPI is a good default for screens; 300 DPI matches print quality and produces larger files. JPG is the right choice for pages with photos or when file size matters. For pages that are mostly text, diagrams or anything with sharp edges, the PDF to PNG page gives a lossless image.',
    ],
    steps: [
      'Drop a PDF, or tap to pick one.',
      'Choose all pages or a range such as 1-3, 5, then the resolution and JPG quality.',
      'Convert. One page downloads directly; several pages download as a zip.',
    ],
    faq: [
      { q: 'What resolution should I use?', a: '150 DPI is sharp on screens and keeps files small. Use 300 DPI for printing or when you will crop into the image. 72 DPI is the smallest and looks like a thumbnail.' },
      { q: 'Can I convert only some pages?', a: 'Yes. Choose "Choose pages" and type a range such as 2-4, 7. Pages are numbered from 1.' },
      { q: 'Why is a JPG page blurrier than the PDF?', a: 'A PDF stores text as vector shapes, which stay sharp at any zoom; a JPG is a grid of pixels. Increase the DPI, or pick PNG, for the crispest result.' },
      noUpload,
    ],
  },
  {
    slug: 'pdf-to-png',
    base: 'pdf-to-image',
    name: 'PDF to PNG',
    title: 'PDF to PNG Converter, Free, No Upload | Stayput',
    description: 'Convert PDF pages to lossless PNG images in your browser. Pick the pages and the resolution. No upload, no limits, works offline.',
    heading: 'Convert PDF to PNG',
    tagline: 'Pixel-perfect PNGs of PDF pages, rendered on your device with no compression artefacts.',
    keywords: ['pdf to png', 'convert pdf to png', 'pdf to png converter', 'pdf page to png', 'pdf to image free'],
    defaults: { format: 'image/png', dpi: '150' },
    intro: [
      'PNG is the right format for PDF pages with text, tables, line drawings or anything that will be edited further, because it is lossless: no blocky artefacts around letters, and the image can be re-saved as many times as you like. This page renders each page with pdf.js inside your browser and saves a PNG at the resolution you choose.',
      'Files are larger than JPG, especially at 300 DPI. If the pages are photographs and size matters, the PDF to JPG page is the smaller option. Either way, the PDF never leaves your device.',
    ],
    steps: [
      'Drop a PDF, or tap to pick one.',
      'Choose all pages or a range, and the resolution.',
      'Convert. One page downloads directly; several pages download as a zip.',
    ],
    faq: [
      { q: 'Is the PNG background transparent?', a: 'No. PDF pages are rendered on a white page as a viewer would show them, so the PNG has a white background.' },
      { q: 'Which resolution should I choose?', a: '150 DPI for screens and slides, 300 DPI for print. A Letter page at 300 DPI is 2550 by 3300 pixels.' },
      { q: 'Can I turn a whole PDF into PNGs at once?', a: 'Yes. Leave "All pages" selected and every page is rendered and delivered as one zip file.' },
      noUpload,
    ],
  },
  {
    slug: 'combine-pdf',
    base: 'merge-pdf',
    name: 'Combine PDF',
    title: 'Combine PDF Files Into One, Free, No Upload | Stayput',
    description: 'Combine several PDF files into a single document in your browser. Reorder before joining. No upload, no file limits, works offline.',
    heading: 'Combine PDF files into one',
    tagline: 'Join contracts, scans and statements into a single PDF without sending any of them anywhere.',
    keywords: ['combine pdf', 'combine pdf files', 'pdf combiner', 'join pdf', 'put pdfs together', 'combine pdf files into one free'],
    dropLabel: 'Drop PDF files here',
    action: 'Combine',
    intro: [
      'The files people combine are the ones they least want on a stranger\'s server: signed contracts, bank statements, medical letters, ID scans for a visa application. This page joins them with pdf-lib inside your browser, copying every page into a new document with its fonts, images and links intact. The combined PDF is written on your device and downloaded from there.',
      'Add the files in any order and use the arrows to arrange them; the result follows the list top to bottom. There is no limit on the number of files or their size beyond your device\'s memory, and there is no daily quota because there is no server keeping count.',
    ],
    steps: [
      'Drop two or more PDF files, or tap to pick them.',
      'Arrange them with the arrows. The combined document follows the list top to bottom.',
      'Combine, and the single PDF downloads.',
    ],
    faq: [
      { q: 'Are bookmarks, links and form fields kept?', a: 'Pages are copied with their content, fonts, images and internal links. Bookmarks (the outline) and form fields are not carried across in the current version.' },
      { q: 'Can I combine only some pages of each file?', a: 'Extract the pages you need first with the split tool, then combine the extracts.' },
      { q: 'Why is the combined file smaller or larger than the sum?', a: 'Slightly smaller is normal, because shared resources are written once. Larger is unusual and means a source file had unused objects the copy kept; the compress tool\'s lossless cleanup will fix it.' },
      noUpload,
    ],
  },
  {
    slug: 'extract-pages-from-pdf',
    base: 'split-pdf',
    name: 'Extract PDF pages',
    title: 'Extract Pages From a PDF, Free, No Upload | Stayput',
    description: 'Pull specific pages out of a PDF into a new file in your browser. Type a page range, download the extract. Nothing is uploaded.',
    heading: 'Extract pages from a PDF',
    tagline: 'Pages 3 to 5 as their own PDF, or every page as a separate file, done on your device.',
    keywords: ['extract pages from pdf', 'save one page of pdf', 'pdf page extractor', 'separate pdf pages', 'take pages out of pdf'],
    action: 'Extract',
    defaults: { 'split-mode': 'range' },
    intro: [
      'Sending the whole 40-page policy when someone asked for the schedule on page 12 is how confidential pages leak. Extracting the pages you mean is quick: type a range, and pdf-lib inside your browser copies just those pages into a new PDF. The original is not modified and neither file is uploaded.',
      'Ranges accept the usual notation: 1-3, 5, 8-10. Switch to "Every page separately" to get one PDF per page as a zip, or "Every N pages" to chop a long document into equal chunks.',
    ],
    steps: [
      'Drop a PDF, or tap to pick one. The page count appears above the options.',
      'Type the pages to keep, such as 2-4, 7. Or pick "Every page separately".',
      'Extract. One file downloads directly; several download as a zip.',
    ],
    faq: [
      { q: 'How do I save just one page of a PDF?', a: 'Type that page number in "Pages to keep" and extract. The download is a one-page PDF.' },
      { q: 'Can I extract pages in a different order?', a: 'Ranges keep the original order. To reorder as well, use the reorder and delete pages tool, which shows thumbnails you can move.' },
      { q: 'Is the original file changed?', a: 'No. A new PDF is written with copies of the chosen pages. The file on your disk is untouched.' },
      noUpload,
    ],
  },
  {
    slug: 'resize-image',
    base: 'compress-image',
    name: 'Resize image',
    title: 'Resize Images Online Without Uploading | Stayput',
    description: 'Resize photos and images to a maximum width, height or percentage in your browser. Batch resize, keep the format or change it. Nothing is uploaded.',
    heading: 'Resize an image',
    tagline: 'Set a maximum width or height, or a percentage, and every photo is scaled on your device.',
    keywords: ['resize image', 'resize photo', 'image resizer', 'reduce image dimensions', 'resize image to 1920x1080', 'batch resize images', 'resize image without losing quality'],
    dropLabel: 'Drop images here',
    action: 'Resize',
    defaults: { 'resize-mode': 'max', 'max-width': '1920', 'max-height': '1920', quality: '90', format: 'keep' },
    intro: [
      'Most resize jobs are the same job: a 4000-pixel photo needs to be 1920 wide for a website, 1080 for a profile picture, or 800 for an email. Set the maximum width and height and every image you drop is scaled to fit inside that box with its proportions kept. Nothing is enlarged and nothing is cropped.',
      'Scaling uses stepped downsampling on a canvas, so text and edges stay clean instead of going jagged. The format is kept by default; switch to JPG or WebP when you also want a smaller file. Resizing happens in your tab and the images never leave your device.',
    ],
    steps: [
      'Drop one or many images (JPG, PNG, WebP, HEIC), or tap to pick them.',
      'Set a maximum width and height in pixels, or switch to a percentage.',
      'Resize. Download each image, or all of them as a zip.',
    ],
    faq: [
      { q: 'Does resizing lose quality?', a: 'Making an image smaller discards pixels, which is the point, but the result stays sharp because the scaling is done in steps. Set quality to 90 or higher for JPG output to avoid any visible compression.' },
      { q: 'Can I resize to exact dimensions like 1920 by 1080?', a: 'The tool fits the image inside the box you give while keeping its proportions, so a 4:3 photo limited to 1920 by 1080 becomes 1440 by 1080. Exact cropping to a shape is on the roadmap.' },
      { q: 'Can I make an image bigger?', a: 'No. Upscaling invents pixels and looks soft, so this tool only scales down. Images already inside the limit are re-encoded at their current size.' },
      noUpload,
    ],
  },
  {
    slug: 'compress-jpg',
    base: 'compress-image',
    name: 'Compress JPG',
    title: 'Compress JPG Images, Free, No Upload | Stayput',
    description: 'Shrink JPG and JPEG photos in your browser with a quality slider and optional resize. See the size before and after. Nothing is uploaded, no limits.',
    heading: 'Compress JPG images',
    tagline: 'Smaller JPGs for email, uploads and websites, encoded on your device.',
    keywords: ['compress jpg', 'compress jpeg', 'reduce jpg file size', 'jpeg compressor', 'make jpg smaller', 'compress jpg to 200kb'],
    accept: 'image/jpeg,.jpg,.jpeg',
    dropLabel: 'Drop JPG photos here',
    action: 'Compress',
    defaults: { 'resize-mode': 'max', 'max-width': '2000', 'max-height': '2000', quality: '75', format: 'keep' },
    intro: [
      'A phone photo is 3 to 6 MB because it is 12 megapixels at a high quality setting. Nobody viewing it on a screen needs either. Two changes get a JPG under a few hundred kilobytes: a modest quality setting, and a limit on its dimensions. This page does both with your browser\'s own JPG encoder, and shows the size before and after so you can adjust.',
      'Quality 75 is the sweet spot for photos: about a quarter of the original size with no visible difference at normal viewing sizes. Limiting the longest side to 2000 pixels keeps it sharp on any screen. Batches are fine, and nothing is uploaded.',
    ],
    steps: [
      'Drop one or many JPG photos, or tap to pick them.',
      'Adjust the quality slider and, optionally, the maximum dimensions.',
      'Compress. Each result shows its new size next to the original.',
    ],
    faq: [
      { q: 'How do I compress a JPG to under 200 KB?', a: 'Set the maximum width and height to 1600 and quality to 70, then compress. Check the size shown on the result; lower either number a little if it is still over.' },
      { q: 'Will people see the difference?', a: 'At quality 75 and above, not at normal viewing sizes. Below 60, fine textures and gradients start to show blocks.' },
      { q: 'Does compressing remove the EXIF data?', a: 'Yes. Re-encoding through the browser drops the EXIF block, including GPS location. If you want the metadata kept, use the image converter with "Keep EXIF metadata" ticked.' },
      noUpload,
    ],
  },
  {
    slug: 'remove-location-from-photos',
    base: 'strip-exif',
    name: 'Remove photo location',
    title: 'Remove Location Data From Photos, Free, No Upload | Stayput',
    description: 'Delete the GPS location, camera and date metadata from JPG, PNG and WebP photos in your browser, without re-encoding. Nothing is uploaded.',
    heading: 'Remove location data from photos',
    tagline: 'See what a photo reveals, then delete the GPS and camera metadata on your device. The pixels are untouched.',
    keywords: ['remove location from photo', 'remove gps from photo', 'remove location data from photos', 'photo metadata remover', 'remove geotag from photo', 'delete exif location'],
    dropLabel: 'Drop photos here',
    action: 'Remove metadata',
    intro: [
      'Phones write the exact GPS coordinates of where a photo was taken into the file, along with the date, the phone model and sometimes the owner\'s name. Messaging apps usually strip this; email, cloud folders, marketplaces and many forums do not. Drop a photo here and the panel shows exactly what it contains, GPS included, before anything is changed.',
      'Removing it is lossless. The tool deletes only the metadata segments of the JPG, PNG or WebP container and writes the untouched image data back, so the picture is pixel-identical and the file gets slightly smaller. Because this runs in your browser, the location never travels anywhere, which is the point of removing it.',
    ],
    steps: [
      'Drop one or many photos, or tap to pick them. The panel lists what each one contains.',
      'Keep the colour profile ticked (recommended) so colours do not shift.',
      'Remove metadata. Download each cleaned photo, or all of them as a zip.',
    ],
    faq: [
      { q: 'Which apps already remove location data?', a: 'WhatsApp, Signal, Messenger, Instagram, Facebook and X strip metadata from photos you post or send. Email attachments, Google Drive and Dropbox links, iMessage in full quality, marketplaces like Craigslist, and most forums keep it.' },
      { q: 'How can I check that the location is gone?', a: 'Drop the cleaned photo back onto this page. The panel reads the file and reports "GPS location: no" and no removable metadata.' },
      { q: 'Does it work for HEIC photos from an iPhone?', a: 'Use the HEIC to JPG converter with "Keep EXIF metadata" unticked, which is the default: the converted JPG has no metadata at all.' },
      { q: 'Is the image re-compressed?', a: 'No. Only the metadata blocks are removed. The image data is copied byte for byte, so there is zero quality loss.' },
    ],
  },
  {
    slug: 'pdf-to-text',
    base: 'pdf-to-word',
    name: 'PDF to text',
    title: 'PDF to Text Converter, Free, No Upload | Stayput',
    description: 'Extract the text of a PDF into a plain .txt file in your browser, paragraphs rebuilt, reading order kept. Nothing is uploaded, works offline.',
    heading: 'Extract text from a PDF',
    tagline: 'Every word of a PDF as a plain text file, pulled out on your device.',
    keywords: ['pdf to text', 'extract text from pdf', 'pdf to txt', 'copy text from pdf', 'get text out of pdf', 'pdf text extractor'],
    defaults: { format: 'txt' },
    intro: [
      'Copying text out of a PDF by hand gives you one line per paragraph, broken hyphens and page headers in the middle of sentences. This page reads the text layer with pdf.js inside your browser, groups the runs back into lines and paragraphs, mends words split across lines, and saves a clean .txt file. A preview appears before you download.',
      'Plain text is the right output when the words are going into another program: a note-taking app, a script, a search index, a language model, a translation tool. If you want an editable document with headings, switch the format to Word.',
    ],
    steps: [
      'Drop a PDF, or tap to pick one. The page count appears next to the format.',
      'Leave plain text selected, or switch to Word. Tick page breaks if you want a form feed between pages.',
      'Convert. The preview shows the start of the text and the .txt file downloads.',
    ],
    faq: [
      { q: 'Does it work on scanned PDFs?', a: 'No. A scan is a picture of text with no text layer, so there is nothing to extract without OCR. The tool says so when it finds no text.' },
      { q: 'Does it keep reading order for two-column pages?', a: 'Lines are ordered top to bottom and left to right within a line. Simple two-column layouts usually come out column by column; complex ones can interleave. Check the preview.' },
      { q: 'Can I extract text from many PDFs at once?', a: 'One file at a time for now. Batch extraction is on the roadmap.' },
      noUpload,
    ],
  },
];

export const presetBySlug = (slug: string): Preset | undefined => presets.find((p) => p.slug === slug);

/** A Preset expressed as a Tool so it can use the shared tool layout. */
export function presetAsTool(p: Preset): Tool {
  const base = toolBySlug(p.base);
  if (!base) throw new Error(`Preset ${p.slug} names unknown tool ${p.base}`);
  return {
    ...base,
    slug: p.slug,
    path: `/${p.slug}`,
    name: p.name,
    title: p.title,
    description: p.description,
    heading: p.heading,
    tagline: p.tagline,
    accept: p.accept ?? base.accept,
    dropLabel: p.dropLabel ?? base.dropLabel,
    action: p.action ?? base.action,
    keywords: p.keywords,
    steps: p.steps,
    faq: p.faq,
  };
}
