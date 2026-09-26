import type { Tool } from './tools';

/**
 * Format-pair landing pages ("WebP to PNG"). Each is a real page with its own
 * copy and FAQ, served at /<from>-to-<to>, and runs the image converter with
 * the output format preset. They exist because people search for the pair,
 * not for "image converter".
 */
export interface Pair {
  slug: string;
  from: string;
  to: string;
  /** Output MIME type preset in the converter. */
  outputType: 'image/jpeg' | 'image/png' | 'image/webp';
  accept: string;
  title: string;
  description: string;
  heading: string;
  tagline: string;
  keywords: string[];
  /** Two or three short paragraphs of real explanation. */
  intro: string[];
  faq: { q: string; a: string }[];
}

const jpgSteps = (from: string) => [
  `Drop your ${from} files onto the page, or tap to pick them. Batches are fine.`,
  'Adjust the quality slider if you want a smaller file, or leave it at 90.',
  'Download each JPG, or all of them as one zip.',
];
const pngSteps = (from: string) => [
  `Drop your ${from} files onto the page, or tap to pick them. Batches are fine.`,
  'There are no quality settings: PNG is lossless, so the output matches the decoded image exactly.',
  'Download each PNG, or all of them as one zip.',
];
const webpSteps = (from: string) => [
  `Drop your ${from} files onto the page, or tap to pick them. Batches are fine.`,
  'Pick a quality. 80 to 90 is a good range for photos; go higher for screenshots with text.',
  'Download each WebP, or all of them as one zip.',
];

export const pairs: Pair[] = [
  {
    slug: 'heic-to-png',
    from: 'HEIC',
    to: 'PNG',
    outputType: 'image/png',
    accept: '.heic,.heif,image/heic,image/heif',
    title: 'HEIC to PNG Converter, Free, No Upload | Stayput',
    description: 'Convert iPhone HEIC photos to lossless PNG in your browser. No upload, no limits, batches welcome, works offline.',
    heading: 'Convert HEIC to PNG',
    tagline: 'A lossless PNG copy of every iPhone photo, made on your device.',
    keywords: ['heic to png', 'heic to png converter', 'convert heic to png free', 'iphone photo to png'],
    intro: [
      'HEIC is the format iPhones and iPads have used since iOS 11. It packs a photo into about half the space of a JPG, but a lot of software still refuses to open it. PNG is the safe choice when you need the picture to open everywhere and you do not want a second round of lossy compression, for example when the photo is going into a design tool, a document, or an archive.',
      'The decoder is libheif compiled to WebAssembly, running inside this tab. Your photo is decoded to pixels in memory and the browser writes the PNG. Expect the PNG to be much larger than the HEIC, often five to ten times, because PNG stores every pixel without loss.',
    ],
    faq: [
      { q: 'Why is the PNG so much bigger than the HEIC?', a: 'HEIC uses lossy video-style compression; PNG is lossless. A 2 MB HEIC from a 12-megapixel camera typically becomes a 15 to 25 MB PNG. If size matters more than a lossless copy, use the HEIC to JPG tool instead.' },
      { q: 'Does the PNG keep the photo’s date and location?', a: 'No. PNG has no standard place for camera EXIF data, and browsers do not write it. If you need the metadata, convert to JPG and tick "Keep EXIF metadata".' },
      { q: 'Are my photos uploaded?', a: 'No. There is no server in this process at all. You can load the page, switch your device to airplane mode, and convert.' },
    ],
  },
  {
    slug: 'png-to-jpg',
    from: 'PNG',
    to: 'JPG',
    outputType: 'image/jpeg',
    accept: 'image/png,.png',
    title: 'PNG to JPG Converter, Free, No Upload | Stayput',
    description: 'Convert PNG images to JPG in your browser with a quality slider and a background colour for transparent areas. No upload, no limits.',
    heading: 'Convert PNG to JPG',
    tagline: 'Turn large PNG files into compact JPGs without sending them anywhere.',
    keywords: ['png to jpg', 'png to jpeg', 'convert png to jpg free', 'png to jpg converter'],
    intro: [
      'PNG is the right format for screenshots, logos and anything with sharp edges or transparency, but for photos and web uploads it is often ten times larger than it needs to be. Converting to JPG trades a little precision for a much smaller file, which is usually the right trade for a photo you are about to email or post.',
      'JPG cannot store transparency, so you choose what colour fills the transparent areas. White is the default; pick the background colour of wherever the image will sit for a seamless result. The quality slider at 90 is visually identical to the original for photos; 75 to 80 is a good choice for web use.',
    ],
    faq: [
      { q: 'What happens to transparent parts of the PNG?', a: 'They are filled with the background colour you choose in the options. JPG has no transparency, so this step is unavoidable in any converter.' },
      { q: 'Should I convert a screenshot to JPG?', a: 'Usually not. Text and thin lines pick up visible artefacts in JPG. Keep screenshots as PNG, or use the compress tool to shrink the PNG losslessly. Convert to JPG when the image is a photo.' },
      { q: 'Is anything uploaded?', a: 'No. The conversion is done by your browser’s own image encoder on your device. Check the network panel: no request carries your image.' },
    ],
  },
  {
    slug: 'jpg-to-png',
    from: 'JPG',
    to: 'PNG',
    outputType: 'image/png',
    accept: 'image/jpeg,.jpg,.jpeg',
    title: 'JPG to PNG Converter, Free, No Upload | Stayput',
    description: 'Convert JPG or JPEG images to PNG in your browser. Lossless output, batch conversion, no upload, no limits.',
    heading: 'Convert JPG to PNG',
    tagline: 'For when a tool, a form or a template insists on PNG.',
    keywords: ['jpg to png', 'jpeg to png', 'convert jpg to png', 'jpg to png converter free'],
    intro: [
      'You do not convert JPG to PNG to gain quality: the detail JPG compression discarded is gone, and the PNG will only be a faithful copy of the JPG as it is now. You convert because something requires PNG, such as an upload form, a presentation template, or an image editor that will be layering the picture and re-saving it many times, where PNG stops the quality getting worse with each save.',
      'The output is a lossless PNG of the decoded JPG. Files get bigger, typically three to eight times, because PNG stores every pixel. If you need a transparent background, that is an editing job rather than a conversion; PNG output here has no transparency because the JPG had none.',
    ],
    faq: [
      { q: 'Will converting to PNG improve the quality?', a: 'No. It preserves the quality exactly as it is, which is the point: further edits and saves will not degrade it the way re-saving a JPG does.' },
      { q: 'Why is the PNG so large?', a: 'PNG is lossless. A 2 MB JPG can become a 10 MB PNG. That is normal, and it is the reason to convert only when PNG is actually required.' },
      { q: 'Does the PNG keep the EXIF data?', a: 'No. Browsers do not write EXIF into PNG. If you need the camera and location data preserved, keep the original JPG alongside the PNG.' },
    ],
  },
  {
    slug: 'webp-to-png',
    from: 'WebP',
    to: 'PNG',
    outputType: 'image/png',
    accept: 'image/webp,.webp',
    title: 'WebP to PNG Converter, Free, No Upload | Stayput',
    description: 'Convert WebP images to PNG in your browser, transparency preserved. No upload, no limits, batch conversion, works offline.',
    heading: 'Convert WebP to PNG',
    tagline: 'Open WebP images anywhere by saving them as PNG, on your device.',
    keywords: ['webp to png', 'convert webp to png', 'webp to png converter', 'save webp as png'],
    intro: [
      'Most images you save from websites today arrive as WebP, and plenty of software still cannot open them: older image editors, some office suites, many upload forms. PNG is the fix when you need the image to open everywhere and keep its transparency.',
      'Your browser decodes WebP natively, so this conversion needs no extra download. Transparent areas in the WebP stay transparent in the PNG. Because PNG is lossless the file will be larger than the WebP, sometimes considerably; if size matters and there is no transparency, WebP to JPG is the smaller option.',
    ],
    faq: [
      { q: 'Is transparency kept?', a: 'Yes. PNG supports alpha transparency, and the converter copies it through unchanged.' },
      { q: 'Why can’t I open WebP files in the first place?', a: 'WebP was created by Google in 2010 and every current browser supports it, but a lot of desktop software added support late or not at all. Converting to PNG sidesteps the problem without losing anything.' },
      { q: 'Are the images uploaded to a server?', a: 'No. The decode and encode happen inside your browser tab. Nothing about your image leaves the device.' },
    ],
  },
  {
    slug: 'webp-to-jpg',
    from: 'WebP',
    to: 'JPG',
    outputType: 'image/jpeg',
    accept: 'image/webp,.webp',
    title: 'WebP to JPG Converter, Free, No Upload | Stayput',
    description: 'Convert WebP images to JPG in your browser. Quality slider, background colour for transparency, batch conversion, nothing uploaded.',
    heading: 'Convert WebP to JPG',
    tagline: 'The compact option for WebP photos that need to open everywhere.',
    keywords: ['webp to jpg', 'webp to jpeg', 'convert webp to jpg', 'webp to jpg converter free'],
    intro: [
      'JPG is the format every device, every website and every printer understands. Converting a WebP photo to JPG keeps the file small while making it universally openable, which is why it is the most common conversion people need after saving a picture from the web.',
      'WebP can hold transparency and JPG cannot, so the options include a background colour to fill transparent areas. The quality slider controls the size of the JPG; 85 to 90 looks identical to the source for photos. Your browser decodes and encodes the image itself; nothing is uploaded.',
    ],
    faq: [
      { q: 'Does converting WebP to JPG lose quality?', a: 'Both are lossy formats, so each conversion discards a little. At quality 90 the difference is not visible. Avoid converting back and forth repeatedly.' },
      { q: 'What about transparent WebP images?', a: 'JPG has no transparency. Transparent areas are filled with the background colour you pick. If you need the transparency, convert to PNG instead.' },
      { q: 'Is there a file limit?', a: 'No. There is no server counting your conversions. Drop as many as your device can hold in memory.' },
    ],
  },
  {
    slug: 'png-to-webp',
    from: 'PNG',
    to: 'WebP',
    outputType: 'image/webp',
    accept: 'image/png,.png',
    title: 'PNG to WebP Converter, Free, No Upload | Stayput',
    description: 'Convert PNG images to WebP in your browser to shrink them for the web. Transparency kept, quality slider, nothing uploaded.',
    heading: 'Convert PNG to WebP',
    tagline: 'Smaller images for your website, transparency included.',
    keywords: ['png to webp', 'convert png to webp', 'png to webp converter', 'webp converter'],
    intro: [
      'WebP is what you serve on a website when you want a PNG’s transparency at a fraction of its size. A 400 KB PNG logo or illustration often becomes a 40 KB WebP with no visible difference, which is a real page-speed win. All current browsers display WebP.',
      'The converter uses your browser’s own WebP encoder. Quality 80 to 90 is the sweet spot for graphics; for images with fine text, push it to 95. Transparency is preserved. If your browser cannot encode WebP (older Safari), the option is greyed out and the page says so.',
    ],
    faq: [
      { q: 'Is WebP transparency preserved?', a: 'Yes. WebP supports an alpha channel, and transparent PNG areas stay transparent.' },
      { q: 'Is WebP lossy or lossless?', a: 'It can be either. Browsers encode lossy WebP through this tool, controlled by the quality slider. At quality 100 the result is very close to lossless but still slightly compressed.' },
      { q: 'Why is WebP greyed out?', a: 'Some browsers, notably older versions of Safari, can display WebP but not create it. Try a current version of Chrome, Firefox, Edge or Safari 16 or later.' },
    ],
  },
  {
    slug: 'jpg-to-webp',
    from: 'JPG',
    to: 'WebP',
    outputType: 'image/webp',
    accept: 'image/jpeg,.jpg,.jpeg',
    title: 'JPG to WebP Converter, Free, No Upload | Stayput',
    description: 'Convert JPG photos to WebP in your browser for smaller web images. Quality slider, batch conversion, nothing uploaded.',
    heading: 'Convert JPG to WebP',
    tagline: 'Around 30% smaller photos for the web, converted on your device.',
    keywords: ['jpg to webp', 'jpeg to webp', 'convert jpg to webp', 'jpg to webp converter'],
    intro: [
      'WebP photos are typically 25 to 35 percent smaller than JPGs of the same visual quality, which is why image-heavy sites serve WebP. If you are preparing photos for a website or an online shop, converting from JPG is the standard step.',
      'Because both formats are lossy, do the conversion once, from the best JPG you have, rather than converting a WebP back to JPG and then to WebP again. Quality 80 to 85 is a good default for photos on the web. The whole batch is encoded by your browser in your tab.',
    ],
    faq: [
      { q: 'Does JPG to WebP lose quality?', a: 'A little, as any lossy re-encode does. At quality 85 it is not visible in normal viewing. Keep the original JPG if you will need to edit later.' },
      { q: 'Is the EXIF data kept?', a: 'No. Browsers strip EXIF when encoding WebP. Location data is therefore removed, which is usually what you want for images going onto a website.' },
      { q: 'How many photos can I convert at once?', a: 'As many as your device can hold in memory. They are processed one at a time so the page stays responsive.' },
    ],
  },
  {
    slug: 'avif-to-jpg',
    from: 'AVIF',
    to: 'JPG',
    outputType: 'image/jpeg',
    accept: 'image/avif,.avif',
    title: 'AVIF to JPG Converter, Free, No Upload | Stayput',
    description: 'Convert AVIF images to JPG in your browser so they open anywhere. Batch conversion, quality slider, nothing uploaded.',
    heading: 'Convert AVIF to JPG',
    tagline: 'For the newest image format that most software still cannot open.',
    keywords: ['avif to jpg', 'avif to jpeg', 'convert avif to jpg', 'avif converter', 'open avif file'],
    intro: [
      'AVIF is the image format built on the AV1 video codec. Websites use it because it is even smaller than WebP, but if you save an AVIF from a site you will find that many editors, viewers and upload forms do not know what to do with it. Converting to JPG makes it universally usable.',
      'Every current browser decodes AVIF natively, so this page usually needs no extra download; older browsers get a WebAssembly decoder instead. The image is decoded in your tab and re-encoded as JPG at the quality you set. Transparent AVIF areas are filled with the background colour you choose.',
    ],
    faq: [
      { q: 'What if my browser cannot decode AVIF?', a: 'AVIF decoding arrived in Chrome 85, Firefox 93 and Safari 16. In an older browser the page fetches a WebAssembly AVIF decoder (about 1 MB of program code, cached after the first use) and decodes the image in the tab instead. Either way the image itself is never sent anywhere.' },
      { q: 'Is quality lost?', a: 'AVIF and JPG are both lossy, so a small amount of detail is discarded in the re-encode. At quality 90 it is not visible. There is no way to convert AVIF to JPG without this step.' },
      { q: 'Is the image uploaded anywhere?', a: 'No. The conversion runs entirely inside your browser tab. The page works with the network disconnected.' },
    ],
  },
  {
    slug: 'avif-to-png',
    from: 'AVIF',
    to: 'PNG',
    outputType: 'image/png',
    accept: 'image/avif,.avif',
    title: 'AVIF to PNG Converter, Free, No Upload | Stayput',
    description: 'Convert AVIF images to lossless PNG in your browser, transparency preserved. Batch conversion, nothing uploaded.',
    heading: 'Convert AVIF to PNG',
    tagline: 'A lossless, transparent-capable copy of an AVIF image, made on your device.',
    keywords: ['avif to png', 'convert avif to png', 'avif to png converter', 'avif transparency'],
    intro: [
      'Pick PNG over JPG when the AVIF has transparency, or when the image will be edited further and you do not want another lossy step. PNG is the lossless container everything can open.',
      'Your browser decodes the AVIF and the converter writes a PNG with the alpha channel intact. The file will be much larger than the AVIF, because AVIF is one of the most efficient lossy formats and PNG stores every pixel.',
    ],
    faq: [
      { q: 'Is transparency preserved?', a: 'Yes. Transparent areas of the AVIF come through as transparent PNG.' },
      { q: 'Why is the PNG so big?', a: 'AVIF compresses very aggressively; PNG does not compress lossily at all. A 100 KB AVIF can become a multi-megabyte PNG. Use AVIF to JPG when size matters and transparency does not.' },
      { q: 'Which browsers can do this?', a: 'Any current version of Chrome, Edge, Firefox or Safari 16 and later. Decoding happens in the browser, so an old browser without AVIF support will show an error rather than upload the file anywhere.' },
    ],
  },
  {
    slug: 'svg-to-png',
    from: 'SVG',
    to: 'PNG',
    outputType: 'image/png',
    accept: 'image/svg+xml,.svg',
    title: 'SVG to PNG Converter, Free, No Upload | Stayput',
    description: 'Convert SVG vector graphics to PNG in your browser. Transparent background kept, batch conversion, nothing uploaded.',
    heading: 'Convert SVG to PNG',
    tagline: 'Rasterise logos and icons on your device, transparency intact.',
    keywords: ['svg to png', 'convert svg to png', 'svg to png converter', 'rasterize svg'],
    intro: [
      'SVG is a vector format: a set of drawing instructions rather than pixels. Many places still require a pixel image (PNG), including social profile uploads, some presentation tools, and app store listings. This page renders the SVG with your browser’s own vector engine and saves the pixels as PNG.',
      'The output size follows the width and height declared inside the SVG. If your SVG has only a viewBox and no size, the browser picks a default that may be small; set explicit dimensions in the file for a large export. Transparency is preserved. SVGs that load external fonts or images may render without them, because the converter does not fetch anything on your behalf.',
    ],
    faq: [
      { q: 'How do I get a bigger PNG?', a: 'The export size comes from the SVG’s own width and height attributes. Edit the file to set, for example, width="2048" height="2048" and convert again. Because it is vector, there is no loss in doing so.' },
      { q: 'Is the background transparent?', a: 'Yes, unless the SVG itself draws a background. PNG keeps the transparency.' },
      { q: 'Can the SVG run scripts or load remote files?', a: 'No. The SVG is rendered as an image, which disables scripts and external resources. That is also why an SVG relying on a web font may render with a fallback font.' },
    ],
  },
  {
    slug: 'jxl-to-png',
    from: 'JXL',
    to: 'PNG',
    outputType: 'image/png',
    accept: 'image/jxl,.jxl',
    title: 'JXL to PNG Converter (JPEG XL), Free, No Upload | Stayput',
    description: 'Convert JPEG XL (.jxl) images to PNG in your browser. The JXL decoder runs as WebAssembly in your tab; nothing is uploaded.',
    heading: 'Convert JXL to PNG',
    tagline: 'Open JPEG XL files anywhere by turning them into lossless PNGs, decoded on your device.',
    keywords: ['jxl to png', 'jpeg xl to png', 'convert jxl', 'open jxl file', 'jxl converter'],
    intro: [
      'JPEG XL (.jxl) is the successor to JPEG designed by the JPEG committee: smaller files, lossless mode, HDR, and a way to recompress old JPEGs without loss. Safari supports it, but Chrome and Firefox do not, and neither do most image editors yet, so a .jxl file you were sent or downloaded is often stuck. PNG is the safe destination: lossless, and opened by everything.',
      'Because most browsers cannot decode JXL, this page loads the reference decoder (libjxl) compiled to WebAssembly by the Squoosh project. The decoder is about 850 KB, fetched once as a program file and cached. Your image is decoded to pixels in memory and the browser writes the PNG. If you are in Safari, its native decoder is used and nothing extra is downloaded.',
    ],
    faq: [
      { q: 'Why is the decoder downloaded but my image is not uploaded?', a: 'The download is the decoding program, the same for everyone, fetched from a public CDN. Your image never leaves your device: it is read from disk into memory, decoded by that program inside your tab, and saved back to disk. The network panel on this page counts the requests so you can check.' },
      { q: 'Will the PNG be larger than the JXL?', a: 'Almost always, often many times larger. JXL is a highly efficient format and PNG stores every pixel. If you need a small file, convert to JPG or WebP instead.' },
      { q: 'Does it keep HDR or animation?', a: 'No. The output is a standard 8-bit PNG of the first frame. HDR content is tone-mapped by the decoder to standard range.' },
    ],
  },
  {
    slug: 'jxl-to-jpg',
    from: 'JXL',
    to: 'JPG',
    outputType: 'image/jpeg',
    accept: 'image/jxl,.jxl',
    title: 'JXL to JPG Converter (JPEG XL), Free, No Upload | Stayput',
    description: 'Convert JPEG XL (.jxl) images to JPG in your browser with a quality slider. WebAssembly decoder, batch conversion, nothing uploaded.',
    heading: 'Convert JXL to JPG',
    tagline: 'Turn JPEG XL files into ordinary JPGs that open in every app, without sending them anywhere.',
    keywords: ['jxl to jpg', 'jpeg xl to jpeg', 'convert jxl to jpg', 'jxl file converter'],
    intro: [
      'JPEG XL promises to replace JPEG one day, but today a .jxl file will not open in Chrome, Firefox, Windows Photos or most editors. Converting to JPG gives you a file that works everywhere, at a size close to the original.',
      'The decoding happens in this tab with libjxl compiled to WebAssembly (Safari uses its built-in decoder). The pixels are then encoded as JPG by your browser at the quality you pick. Transparent areas, which JPG cannot store, are filled with the background colour you choose.',
    ],
    faq: [
      { q: 'Is the conversion lossless?', a: 'No. JPG is lossy, so a little detail is discarded when the pixels are re-encoded. At quality 90 the difference is invisible for photos. Use the JXL to PNG page for a lossless copy.' },
      { q: 'Are my files uploaded?', a: 'No. The decoder is a program file fetched once from a CDN and cached; your images are decoded and re-encoded inside your browser tab and never travel anywhere.' },
      { q: 'Can I convert many files at once?', a: 'Yes. Drop a folder’s worth of .jxl files and download them one by one or as a single zip.' },
    ],
  },
  {
    slug: 'jfif-to-jpg',
    from: 'JFIF',
    to: 'JPG',
    outputType: 'image/jpeg',
    accept: 'image/jpeg,image/pjpeg,.jfif,.jpe,.jpg,.jpeg',
    title: 'JFIF to JPG Converter, Free, No Upload | Stayput',
    description: 'Turn .jfif images saved from the web into ordinary .jpg files in your browser. Batches welcome, nothing uploaded, works offline.',
    heading: 'Convert JFIF to JPG',
    tagline: 'Fix the pictures Windows saved as .jfif so every app and upload form accepts them.',
    keywords: ['jfif to jpg', 'convert jfif to jpg', 'jfif to jpg converter', 'change jfif to jpg', 'jfif to jpeg', 'what is a jfif file'],
    intro: [
      'A .jfif file is a JPEG. JFIF (JPEG File Interchange Format) is the name of the wrapper almost every JPEG has used since 1992, and Windows labels some downloaded images with that extension instead of .jpg, usually pictures saved from Chrome or Edge. The picture is fine; the problem is that upload forms, older editors and some phones look at the extension and refuse the file.',
      'This page reads each .jfif file, decodes it in your browser and writes it back out as a standard .jpg. Drop a whole folder of them and download a zip. If you only have one file on a computer, renaming it from .jfif to .jpg also works, because the bytes inside are already JPEG; the converter is for batches, for phones where renaming is awkward, and for files that are not quite what their extension says.',
    ],
    faq: [
      { q: 'Is JFIF the same as JPG?', a: 'Yes, in practice. JFIF is the standard container for JPEG data, and .jfif, .jpg, .jpeg and .jpe files are all the same kind of image. Only the name at the end differs, and some software checks the name.' },
      { q: 'Why do my downloaded images save as .jfif?', a: 'Windows maps the image/jpeg type to the .jfif extension in its registry on some machines, so browsers on those machines offer .jfif when you save a picture. Converting the files, or renaming them, fixes it for the files you already have.' },
      { q: 'Does converting lose quality?', a: 'The image is re-encoded as JPG at the quality you choose, 90 by default, which is visually identical for photos. If you want the original bytes untouched, rename the file instead of converting it. Tick "Keep EXIF metadata" to carry the camera data over.' },
      { q: 'Are the images uploaded?', a: 'No. Your browser decodes and encodes each image inside this tab. There is no server in the process; you can go offline after the page loads.' },
    ],
  },
  {
    slug: 'jfif-to-png',
    from: 'JFIF',
    to: 'PNG',
    outputType: 'image/png',
    accept: 'image/jpeg,image/pjpeg,.jfif,.jpe,.jpg,.jpeg',
    title: 'JFIF to PNG Converter, Free, No Upload | Stayput',
    description: 'Convert .jfif images to lossless PNG in your browser. Batch conversion, no upload, no limits, works offline.',
    heading: 'Convert JFIF to PNG',
    tagline: 'A lossless PNG copy of every .jfif picture, made on your device.',
    keywords: ['jfif to png', 'convert jfif to png', 'jfif to png converter', 'change jfif to png'],
    intro: [
      'A .jfif file is an ordinary JPEG with an unusual extension, typically a picture saved from the web on Windows. PNG is the right destination when the image is going into a design tool, a slide deck or an edit you will save several times: PNG is lossless, so every later save keeps exactly the pixels you have now instead of adding another round of JPEG artefacts.',
      'Your browser decodes each .jfif file inside this tab and writes a PNG. Expect the PNG to be several times larger than the JFIF, because PNG stores every pixel without loss. A PNG made from a JPEG has no transparency to begin with; converting does not add any.',
    ],
    faq: [
      { q: 'Will the PNG look better than the JFIF?', a: 'No. Converting cannot bring back detail the JPEG compression already removed. What PNG gives you is a copy that loses nothing more when you edit and save it again.' },
      { q: 'Why is the PNG so much bigger?', a: 'JPEG, and so JFIF, discards detail to stay small. PNG keeps every pixel. A 300 KB photo commonly becomes a 2 to 4 MB PNG. If size matters, convert to JPG instead.' },
      { q: 'Can I convert many at once?', a: 'Yes. Drop as many files as you like; download them one by one or as a single zip.' },
      { q: 'Are the images uploaded?', a: 'No. Decoding and encoding happen in your browser tab and the files never leave your device.' },
    ],
  },
  {
    slug: 'svg-to-jpg',
    from: 'SVG',
    to: 'JPG',
    outputType: 'image/jpeg',
    accept: 'image/svg+xml,.svg',
    title: 'SVG to JPG Converter, Free, No Upload | Stayput',
    description: 'Convert SVG vector graphics to JPG in your browser, with a background colour for transparent areas. Batch conversion, nothing uploaded.',
    heading: 'Convert SVG to JPG',
    tagline: 'Rasterise logos, icons and charts into JPGs that upload anywhere, on your device.',
    keywords: ['svg to jpg', 'svg to jpeg', 'convert svg to jpg', 'svg to jpg converter', 'change svg to jpg'],
    intro: [
      'SVG is a set of drawing instructions rather than pixels, and plenty of places will not take one: job portals, email clients, marketplace listings, older Office versions. JPG is accepted everywhere. This page draws each SVG with your browser’s own vector engine and saves the pixels as a JPG.',
      'Most SVGs have a transparent background and JPG cannot store transparency, so pick the colour that should show behind the drawing; white is the default. The output size follows the width and height written inside the SVG. For a logo with sharp edges and flat colour, PNG is usually the better choice, and the SVG to PNG page keeps the transparency.',
    ],
    faq: [
      { q: 'Why did the background turn white (or black)?', a: 'JPG has no transparency, so the transparent parts of the SVG are filled with the background colour in the options. Change it before converting, or convert to PNG to keep the transparency.' },
      { q: 'How do I get a bigger JPG?', a: 'The pixel size comes from the width and height attributes inside the SVG. Set them larger, for example width="3000" height="3000", and convert again. The drawing is vector, so nothing is lost by scaling it up.' },
      { q: 'Why does the text look different?', a: 'An SVG that loads a web font from the internet is rendered without it, because the converter never fetches anything on your behalf. Convert the text to outlines in your design tool, or embed the font in the SVG.' },
      { q: 'Are the files uploaded?', a: 'No. The SVG is rendered as an image inside your browser tab, with scripts and external resources disabled, and the JPG is written on your device.' },
    ],
  },
  {
    slug: 'gif-to-png',
    from: 'GIF',
    to: 'PNG',
    outputType: 'image/png',
    accept: 'image/gif,.gif',
    title: 'GIF to PNG Converter, Free, No Upload | Stayput',
    description: 'Convert GIF images to PNG in your browser. Lossless, transparency kept, batch conversion. Animated GIFs give their first frame. Nothing uploaded.',
    heading: 'Convert GIF to PNG',
    tagline: 'Lossless PNGs from old GIF graphics, transparency intact, made on your device.',
    keywords: ['gif to png', 'convert gif to png', 'gif to png converter', 'change gif to png', 'gif to png transparent'],
    intro: [
      'GIF is limited to 256 colours and a single on-or-off level of transparency, which is why old logos, icons and diagrams are often still GIFs. PNG does everything a still GIF does, with better compression, full colour and smooth transparency, and every editor and upload form takes it. The conversion is lossless: the PNG holds exactly the pixels of the GIF.',
      'Your browser decodes the GIF inside this tab and writes the PNG. Transparent areas stay transparent. An animated GIF becomes a PNG of its first frame; this page does not split animations into separate frames, so use it for still images or when the first frame is the one you want.',
    ],
    faq: [
      { q: 'What happens to an animated GIF?', a: 'You get a PNG of the first frame only. Splitting an animation into one PNG per frame is not something this tool does yet.' },
      { q: 'Is the transparency kept?', a: 'Yes. A transparent GIF becomes a PNG with the same transparent areas.' },
      { q: 'Will the PNG be smaller than the GIF?', a: 'Often slightly smaller for flat graphics, sometimes a little larger. PNG compression is usually better than GIF’s, but the browser does not reduce the palette the way an optimiser would.' },
      { q: 'Are my files uploaded?', a: 'No. Everything happens in your browser tab; the GIF never leaves your device.' },
    ],
  },
  {
    slug: 'gif-to-jpg',
    from: 'GIF',
    to: 'JPG',
    outputType: 'image/jpeg',
    accept: 'image/gif,.gif',
    title: 'GIF to JPG Converter, Free, No Upload | Stayput',
    description: 'Convert GIF images to JPG in your browser with a quality slider and a background colour for transparent areas. Nothing uploaded, no limits.',
    heading: 'Convert GIF to JPG',
    tagline: 'Turn GIFs into JPGs for forms and apps that will not take a GIF, on your device.',
    keywords: ['gif to jpg', 'gif to jpeg', 'convert gif to jpg', 'gif to jpg converter', 'change gif to jpg'],
    intro: [
      'Some upload forms, profile pages and print services accept only JPG, and a GIF is turned away even when it is a still picture. Converting gives you a JPG of the same image. Your browser decodes the GIF in this tab and encodes the JPG at the quality you choose.',
      'JPG has no transparency, so transparent parts of the GIF are filled with the background colour in the options. An animated GIF becomes a JPG of its first frame. For logos and graphics with flat colour, the GIF to PNG page gives a sharper result; JPG is best when the GIF is really a photo.',
    ],
    faq: [
      { q: 'What happens to an animated GIF?', a: 'The JPG shows the first frame. JPG cannot hold animation, and this page does not export every frame.' },
      { q: 'Why does my graphic look slightly blurry?', a: 'JPG compression is designed for photos and softens sharp edges and flat colour. Raise the quality slider to 95 or 100, or convert to PNG instead.' },
      { q: 'Can I convert several GIFs at once?', a: 'Yes. Drop them all and download each JPG or one zip.' },
      { q: 'Are the files uploaded?', a: 'No. There is no server in this process; the conversion runs in your browser tab.' },
    ],
  },
];

export const pairBySlug = (slug: string): Pair | undefined => pairs.find((p) => p.slug === slug);

/** A Pair expressed as a Tool so it can use the shared tool layout. */
export function pairAsTool(p: Pair): Tool {
  const steps = p.outputType === 'image/png' ? pngSteps(p.from) : p.outputType === 'image/webp' ? webpSteps(p.from) : jpgSteps(p.from);
  return {
    slug: p.slug,
    path: `/${p.slug}`,
    name: `${p.from} to ${p.to}`,
    title: p.title,
    description: p.description,
    heading: p.heading,
    tagline: p.tagline,
    category: 'images',
    accept: p.accept,
    multiple: true,
    dropLabel: `Drop ${p.from} files here`,
    action: 'Convert',
    keywords: p.keywords,
    steps,
    faq: p.faq,
  };
}
