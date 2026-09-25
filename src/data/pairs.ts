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
      'Every current browser decodes AVIF natively, so this page needs no extra download. The image is decoded in your tab and re-encoded as JPG at the quality you set. Transparent AVIF areas are filled with the background colour you choose.',
    ],
    faq: [
      { q: 'My browser says it cannot decode the AVIF file. Why?', a: 'AVIF decoding arrived in Chrome 85, Firefox 93 and Safari 16. If you are on an older browser, update it or use another current browser; the converter relies on the browser’s decoder.' },
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
