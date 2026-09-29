/**
 * Guide pages: long-form answers to the questions people search before they
 * look for a tool ("is it safe to merge PDFs online", "how do I remove the
 * location from a photo"). Each links to the tools that do the job. Copy
 * supports [text](/path) links and **bold**; see src/lib/inline.ts.
 */
export interface GuideSection {
  h: string;
  p: string[];
  /** Optional bullet list after the paragraphs. */
  list?: string[];
  /** Optional code excerpt after the paragraphs (and list), shown verbatim. */
  code?: string;
  /** Optional paragraphs after the code excerpt. */
  after?: string[];
}

export interface Guide {
  slug: string;
  title: string;
  description: string;
  heading: string;
  /** One-line summary under the heading and on cards. */
  dek: string;
  keywords: string[];
  /** ISO date of the last substantive edit, shown on the page and in structured data. */
  updated: string;
  /** Tool slugs (or landing slugs) this guide points to; the first is the main call to action. */
  tools: string[];
  sections: GuideSection[];
  faq: { q: string; a: string }[];
}

export const guides: Guide[] = [
  {
    slug: 'is-it-safe-to-merge-pdfs-online',
    title: 'Is It Safe to Merge PDFs Online? What Actually Happens to Your File',
    description: 'Most online PDF mergers upload your files to a server. Here is what that means, how to tell whether a tool uploads, and how to merge PDFs without uploading at all.',
    heading: 'Is it safe to merge PDFs online?',
    dek: 'It depends on one thing: whether the file leaves your computer. Here is how to tell, and how to merge without it leaving.',
    keywords: ['is it safe to merge pdfs online', 'online pdf merger safe', 'merge pdf privacy', 'merge pdf without uploading', 'secure pdf merge'],
    updated: '2026-09-25',
    tools: ['merge-pdf', 'combine-pdf', 'split-pdf'],
    sections: [
      {
        h: 'What "online" usually means',
        p: [
          'When you drop two PDFs on a typical merge site, your browser sends both files to the company\'s server. A program there joins them, the result is stored for a while, and you download it. For the seconds or hours in between, complete copies of your documents sit on a machine you cannot see, under a privacy policy you probably did not read.',
          'That is fine for a public brochure. It is a poor default for a signed lease, a bank statement, a medical letter, a passport scan or anything covered by a confidentiality clause. The most common merge job is exactly that kind of document.',
        ],
      },
      {
        h: 'The three risks, honestly stated',
        p: ['None of this requires the company to be malicious. It only requires the file to be on their server.'],
        list: [
          '**Retention.** "Deleted after one hour" describes the file you downloaded. It rarely covers server logs, error reports, backups, or the copy a CDN cached. You are trusting an operational detail you cannot audit.',
          '**Breach.** A server that holds thousands of uploaded documents is a target. Your file is exposed during the window it is there, and a breach disclosed a year later will not name you.',
          '**Jurisdiction and terms.** The server may be in a country with different privacy law, and many free tools\' terms grant themselves a licence to process the content. Regulated documents (HIPAA, GDPR, legal privilege) can make an upload a compliance failure by itself.',
        ],
      },
      {
        h: 'How to tell whether a tool uploads your file',
        p: [
          'You do not have to take anyone\'s word for it. Open the tool in your browser, press **F12** (or Cmd-Option-I on a Mac), pick the **Network** tab, then add your PDFs and run the merge. Every request the page makes appears in that list. An upload shows up as a **POST** or **PUT** request whose size matches your files. If the list stays empty after you add files, apart from small analytics pings, nothing left your computer. The [full walkthrough](/guides/does-this-website-upload-my-files) has screenshots of what each case looks like.',
          'A second test is cruder and just as convincing: load the page, switch to airplane mode, and try to merge. A tool that needs a server fails immediately.',
        ],
      },
      {
        h: 'Merging without uploading',
        p: [
          'PDF merging does not need a server. A PDF is a container of pages, and copying pages from several containers into a new one is something a browser can do in JavaScript with a library such as pdf-lib. Stayput\'s [merge tool](/tools/merge-pdf) does exactly that: your files are read from disk into your tab\'s memory, the combined document is written there, and the download comes from your own browser. The page works with the network switched off, and its own request counter shows you the list.',
          'The same goes for [splitting](/tools/split-pdf), [compressing](/tools/compress-pdf), [rotating](/tools/rotate-pdf) and [signing](/tools/sign-pdf). None of these need anything a browser cannot do.',
        ],
      },
      {
        h: 'When an upload-based tool is fine',
        p: [
          'If the document is public, or you would happily email it to a stranger, the convenience is worth it. Some jobs also genuinely need a server: OCR of large scans, or conversions that rely on licensed software. For those, prefer a company with a clear retention statement and a data-processing agreement, and never upload anything you are contractually bound to protect.',
        ],
      },
    ],
    faq: [
      { q: 'Are big-name PDF sites safe?', a: 'They are professionally run and encrypt the transfer, which protects you from eavesdropping, not from the file being on their server. Read the retention section of the privacy policy and decide per document.' },
      { q: 'Does HTTPS mean my PDF is private?', a: 'HTTPS protects the file in transit between you and the server. Once it arrives it is stored and processed in the clear. It says nothing about what happens next.' },
      { q: 'Is a browser-only tool really safer?', a: 'The file never leaves your device, so there is nothing to retain, breach or subpoena. You can verify that in the network tab rather than trusting a policy.' },
      { q: 'Can I merge PDFs offline on my phone?', a: 'Yes. Open the merge tool once, and it is cached; afterwards it works in airplane mode and can be installed as an app from the browser menu.' },
    ],
  },
  {
    slug: 'remove-location-data-from-photos',
    title: 'How to Remove Location Data From Photos (iPhone, Android, Windows, Mac)',
    description: 'Your photos carry GPS coordinates. Here is how to remove location data on every platform, which apps strip it for you, and how to check that it is gone.',
    heading: 'How to remove location data from photos',
    dek: 'Every phone photo stores where it was taken. Here is how to remove it on each platform, and how to check.',
    keywords: ['remove location data from photos', 'remove gps from photos', 'how to remove location from photo iphone', 'remove geotag from photos', 'photo location metadata'],
    updated: '2026-09-25',
    tools: ['remove-location-from-photos', 'strip-exif', 'heic-to-jpg'],
    sections: [
      {
        h: 'What your photo knows',
        p: [
          'A photo from a phone contains an EXIF block: the date and time to the second, the phone model, the camera settings, and, if location services are on for the camera, the GPS latitude and longitude, often to within a few metres. Paste those coordinates into a map and you have the street. For a photo of a child in a garden, a listing for a bike, or a picture posted while travelling, that is more than you meant to share. The [guide to EXIF data](/guides/what-is-exif-data) explains the full contents.',
        ],
      },
      {
        h: 'The quick way: any device, no app',
        p: [
          'Open the [location remover](/remove-location-from-photos) in your browser, drop the photos in, and it shows you what each one contains, GPS coordinates included. One click removes the location, camera and date metadata and gives you a clean copy. The image itself is not re-compressed, so the quality is identical, and the photo never leaves your device: the removal runs inside the browser tab. It works on iPhone, Android, Windows, Mac and Linux, and offline after the first visit.',
          'For HEIC photos straight from an iPhone, use the [HEIC to JPG converter](/tools/heic-to-jpg); the JPG it produces has no metadata unless you tick the box to keep it.',
        ],
      },
      {
        h: 'On an iPhone or iPad',
        p: [
          'To stop location being recorded in the first place: Settings, Privacy & Security, Location Services, Camera, and choose **Never**. To remove it from a photo you already took: open it in Photos, tap the info button (the circled i), tap **Adjust** under the map, then **No Location**. This edits the photo in your library. When sharing, tap **Options** at the top of the share sheet and turn **Location** off; that strips it from the shared copy only.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'In the Camera app settings, turn off **Location tags** (Samsung) or **Save location** (Pixel). For an existing photo in Google Photos, open it, swipe up or tap the info button, tap the pencil next to the location, and choose **Remove location**. Some manufacturers\' gallery apps have the same option under Details.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'Right-click the file, choose **Properties**, open the **Details** tab and click **Remove Properties and Personal Information**. Choose "Create a copy with all possible properties removed". This handles JPG well; it leaves some XMP data behind and does nothing for HEIC or WebP.',
        ],
      },
      {
        h: 'On a Mac',
        p: [
          'Photos: select the pictures, choose Image, **Location**, **Hide Location**. When exporting, untick "Location Information" in the export dialog. Preview: open the image, press Cmd-I, open the GPS tab and click **Remove Location Info**. Preview writes only the removal, without re-compressing the picture.',
        ],
      },
      {
        h: 'Which apps strip it for you',
        p: [
          'WhatsApp, Signal, Telegram, Instagram, Facebook, X and Reddit remove EXIF from photos you post or send. Email, AirDrop, iMessage, Google Drive, Dropbox, OneDrive, Slack, Discord file uploads, Craigslist, eBay listings and most forum software keep it. When in doubt, clean the photo first.',
        ],
      },
      {
        h: 'Checking that it worked',
        p: [
          'Drop the cleaned photo back onto the [remover page](/remove-location-from-photos). It reads the file and reports "GPS location: no". On a computer you can also check the Details or Get Info panel, but those panels sometimes hide fields they cannot edit, so the tool\'s report is the more reliable test.',
        ],
      },
    ],
    faq: [
      { q: 'Does removing location data lower the photo quality?', a: 'Not if the tool only deletes metadata. Stayput\'s remover copies the image data byte for byte. Tools that re-save the image as a new JPG do lose a little quality each time.' },
      { q: 'Do screenshots have location data?', a: 'No. Screenshots record the device and time but not GPS. Photos taken with the camera do.' },
      { q: 'Does a photo\'s location survive being sent by email?', a: 'Yes. Email attaches the file unchanged, metadata included. Remove it first.' },
      { q: 'Can someone find my home from one photo?', a: 'If it was taken at home with location on and shared with the metadata intact, the coordinates point to your house. That is why the messaging apps strip it, and why it is worth checking anything you post elsewhere.' },
    ],
  },
  {
    slug: 'what-is-exif-data',
    title: 'What Is EXIF Data? What Your Photos Reveal and How to Remove It',
    description: 'EXIF data is the hidden information inside every photo: camera, date, settings, GPS and sometimes your name. What it contains, who can read it, and how to strip it.',
    heading: 'What is EXIF data, and what does a photo reveal?',
    dek: 'The information stored inside a photo file, what it can give away, and how to see and remove it.',
    keywords: ['what is exif data', 'exif metadata', 'photo metadata', 'what information is in a photo', 'exif viewer', 'remove exif data'],
    updated: '2026-09-29',
    tools: ['strip-exif', 'exif-viewer', 'remove-location-from-photos'],
    sections: [
      {
        h: 'The short version',
        p: [
          'EXIF (Exchangeable Image File Format) is a block of labelled fields that cameras and phones write into JPG and HEIC files alongside the picture. It was designed so photo software could show shooting details and rotate images correctly. It has since become the most common way people accidentally share where they were.',
        ],
      },
      {
        h: 'What is in it',
        p: ['A typical phone photo contains most of these:'],
        list: [
          '**Date and time** the photo was taken, to the second, plus the time zone on newer phones.',
          '**Device**: make and model ("Apple iPhone 15 Pro"), and often the lens.',
          '**Settings**: exposure, aperture, ISO, focal length, flash, white balance.',
          '**Orientation**: which way up the camera was held. Software uses this to display the photo upright.',
          '**GPS**: latitude, longitude, altitude, sometimes heading and speed, when location is enabled for the camera.',
          '**Software**: the app or editor that last saved the file, and for edited photos, the original date.',
          '**Thumbnail**: a small embedded preview, which in badly written editors can still show the uncropped picture.',
          'Alongside EXIF, files often carry **XMP** (editing history, keywords, sometimes the photographer\'s name and copyright) and **IPTC** (captions and credits used by news agencies). Camera RAW files and professional workflows can put a full name and contact details there.',
        ],
      },
      {
        h: 'Who can read it',
        p: [
          'Anyone with the file. Windows shows it under Properties, macOS under Get Info, and every image viewer has an info panel. Browsers expose it to any script on a page you upload to. Marketplaces, forums and cloud links pass the file through unchanged. Investigators, journalists and stalkers all use it; so do photo apps that group your pictures by place.',
          'The big social and messaging apps strip it on upload, mostly for their own reasons (bandwidth and consistency), which has made people assume it is always removed. It is not: email, cloud drives, direct file transfers and most smaller websites keep it.',
        ],
      },
      {
        h: 'How to see what a photo contains',
        p: [
          'Drop it on the [EXIF viewer](/tools/exif-viewer). It shows where the photo was taken, when, on which device, any serial number or owner name, and every other field, grouped and in plain words. The file is read inside your browser and is not uploaded, so checking a sensitive photo does not itself leak it. The [guide to viewing photo metadata](/guides/how-to-view-photo-metadata) covers the built-in panels on each phone and computer too.',
        ],
      },
      {
        h: 'How to remove it',
        p: [
          'Two approaches. **Re-saving** the image through any editor or converter drops EXIF as a side effect, but it also re-compresses the picture, losing a little quality each time. **Stripping** removes only the metadata segments from the file and leaves the image data untouched, which is what the [remover](/tools/strip-exif) does for JPG, PNG and WebP: the output is pixel-identical and a little smaller. Keep the colour profile (ICC) ticked; it contains no personal data and removing it can shift colours.',
          'For HEIC photos, convert with the [HEIC to JPG tool](/tools/heic-to-jpg) and leave "Keep EXIF metadata" unticked. The [step-by-step guide](/guides/remove-location-data-from-photos) covers the built-in options on every phone and computer.',
        ],
      },
      {
        h: 'When to keep it',
        p: [
          'Photographers keep EXIF for licensing and for sorting by lens and settings. Insurance claims and legal evidence are stronger with the original date and device intact. Archives want it. Keep the original file with its metadata, and share a stripped copy.',
        ],
      },
    ],
    faq: [
      { q: 'Do PNG files have EXIF data?', a: 'Usually not from cameras, but PNG can carry EXIF and text chunks, and screenshots from some tools include the device and software. The remover cleans those too.' },
      { q: 'Does cropping a photo remove the metadata?', a: 'Not necessarily. Many editors keep the EXIF block, and some keep the embedded thumbnail of the uncropped image. Strip after editing.' },
      { q: 'Can EXIF data contain my name?', a: 'Yes, in the artist, copyright or XMP creator fields, if a camera or editor was configured with it. Phones do not add names by default.' },
      { q: 'Is removing EXIF the same as removing the location?', a: 'Location is one part of EXIF. Removing the whole block removes location, date, device and settings together. If you only want location gone, the phone-level options in the guide do that alone.' },
    ],
  },
  {
    slug: 'open-heic-files-on-windows',
    title: 'How to Open HEIC Files on Windows 10 and 11 (and Convert Them to JPG)',
    description: 'Windows cannot open iPhone HEIC photos out of the box. Three ways to open them, the free way to convert them to JPG in bulk, and how to stop your iPhone making them.',
    heading: 'How to open HEIC files on Windows',
    dek: 'Why iPhone photos will not open, the three fixes, and the fastest free way to convert a whole batch to JPG.',
    keywords: ['open heic files windows', 'heic to jpg windows', 'how to open heic on windows 11', 'windows cannot open heic', 'heic viewer windows', 'convert heic to jpg windows 10'],
    updated: '2026-09-25',
    tools: ['heic-to-jpg', 'heic-to-png', 'heic-to-pdf'],
    sections: [
      {
        h: 'Why the photos will not open',
        p: [
          'Since iOS 11, iPhones save photos as HEIC (High Efficiency Image Container), which stores the same picture in about half the space of a JPG. Windows did not ship a decoder for it. On Windows 10 and many Windows 11 machines, Photos shows a broken thumbnail or asks you to buy an extension, Paint refuses the file, and web forms reject it as an unsupported type.',
        ],
      },
      {
        h: 'Fix 1: convert them to JPG in your browser',
        p: [
          'If what you actually want is to use the photos, attach them or send them, converting is the direct answer. Open the [HEIC to JPG converter](/tools/heic-to-jpg) in Edge, Chrome or Firefox, drop the whole folder of photos, and download them as JPGs or as one zip. The decoder (libheif, the same open-source library Linux desktops use) runs inside the browser tab, so the photos are not uploaded and there is no cap on how many you convert. Choose PNG on the [HEIC to PNG page](/heic-to-png) for a lossless copy, or [HEIC to PDF](/heic-to-pdf) for photographed documents.',
          'The conversion drops the location and camera metadata unless you tick "Keep EXIF metadata", which is worth knowing before you upload the results anywhere.',
        ],
      },
      {
        h: 'Fix 2: install the Windows HEIF extension',
        p: [
          'Microsoft sells "HEVC Video Extensions" in the Store for a small fee, and the "HEIF Image Extensions" package is free but usually needs the paid HEVC one to decode photos. Some PC makers preinstall a free "from Device Manufacturer" version; searching the Store for it is worth a try. Once installed, Photos, Explorer thumbnails and Paint open HEIC natively. It does not help with websites that reject the format.',
        ],
      },
      {
        h: 'Fix 3: a viewer that decodes HEIC itself',
        p: [
          'IrfanView and XnView open HEIC with their plugin packs, and can batch-convert. GIMP opens HEIC directly. These are the right choice if you want to edit the photos on the PC rather than convert them.',
        ],
      },
      {
        h: 'Stop the iPhone making HEIC files',
        p: [
          'On the iPhone: Settings, Camera, Formats, choose **Most Compatible**. New photos are saved as JPG at the cost of roughly twice the storage. Separately, Settings, Photos, scroll to Transfer to Mac or PC, and choose **Automatic**: the phone converts HEIC to JPG when you copy photos over a cable, without changing what is stored on the phone.',
        ],
      },
    ],
    faq: [
      { q: 'Is HEIC better than JPG?', a: 'For storage, yes: about half the size at the same quality, with support for 16-bit colour and live photos. For compatibility, no. Convert when the file has to open somewhere you do not control.' },
      { q: 'Does converting HEIC to JPG lose quality?', a: 'A little, because JPG is lossy, but at quality 90 or above the difference is invisible. Choose PNG for a lossless copy at a much larger size.' },
      { q: 'Can I convert hundreds of HEIC files at once?', a: 'Yes. The browser converter has no file limit; a few hundred photos take a minute or two on a laptop and download as a single zip.' },
      { q: 'Why does Windows say the photo needs a codec?', a: 'Because the built-in Photos app relies on the HEIF and HEVC extensions to decode the format. Install them, or convert the photos.' },
    ],
  },
  {
    slug: 'compress-pdf-without-losing-quality',
    title: 'How to Compress a PDF Without Losing Quality',
    description: 'Why PDFs are big, which compression is lossless, when image recompression is safe, and how to shrink a PDF in your browser without uploading it.',
    heading: 'How to compress a PDF without losing quality',
    dek: 'Where the size comes from, which reductions are free, and where the quality trade-off actually starts.',
    keywords: ['compress pdf without losing quality', 'reduce pdf size', 'shrink pdf', 'pdf too large to email', 'compress pdf offline', 'make pdf smaller'],
    updated: '2026-09-25',
    tools: ['compress-pdf', 'split-pdf', 'pdf-to-image'],
    sections: [
      {
        h: 'Where the size comes from',
        p: [
          'A PDF of text alone is tiny: a 300-page novel is a few hundred kilobytes. What makes PDFs large is pictures. A scanned page is a full-page image; a report with a dozen photos embeds them at whatever resolution the author\'s camera produced; a slide deck exported to PDF carries every screenshot at retina size. Fonts add a little, and a poorly written PDF can drag along unused objects, old versions of pages and duplicate resources.',
          'So "compress a PDF" means one of three different things, with very different effects on quality.',
        ],
      },
      {
        h: 'Lossless: cleanup and re-compression of streams',
        p: [
          'The free win. A PDF\'s internal streams can be deflate-compressed, unused objects dropped, duplicate images and fonts shared, and the file structure rewritten compactly. Nothing visible changes. Gains range from 5 percent on a tidy file to 50 percent or more on one that was edited many times or exported by careless software. Stayput\'s [compress tool](/tools/compress-pdf) does this in "lossless" mode; it is the mode to try first.',
        ],
      },
      {
        h: 'Lossy but usually invisible: recompress the images',
        p: [
          'If the file is still too large, the images inside it are the reason. Recompressing them means decoding each image, optionally reducing its resolution, and re-encoding it as JPG at a chosen quality. At 150 DPI and quality 80 the pages look the same on a screen, and a scanned document drops from 20 MB to 2 MB. The quality loss only becomes visible when printing large or zooming far in. Text, vector drawings and fonts are untouched by this step; only pictures change.',
        ],
      },
      {
        h: 'The last resort: flatten to images',
        p: [
          'Some PDFs resist both steps: heavy vector maps, CAD exports, or files where every page is a complicated overlay of transparent layers. Rendering each page to a single image and rebuilding the PDF from those images makes the size predictable, at the cost of text being no longer selectable or searchable. Use it when nothing else works, and keep the original.',
        ],
      },
      {
        h: 'Doing it without uploading',
        p: [
          'All three steps are routine work for a browser: pdf-lib rewrites the structure, and pdf.js and the canvas API decode and re-encode the images. The [compress tool](/tools/compress-pdf) runs all three modes inside your tab, shows the size before and after, and never sends the document anywhere; that matters for exactly the contracts, statements and medical records that tend to need compressing. A 40 MB file compresses in the time an upload would still be showing a progress bar.',
        ],
      },
      {
        h: 'Other ways to get under a limit',
        p: [
          'If only a few pages matter, [extract them](/extract-pages-from-pdf) instead of shrinking the whole file. If the recipient needs a picture of one page rather than the document, [convert that page to JPG](/pdf-to-jpg). And if you are producing the PDF yourself, export at "reduced size" or with images at 150 DPI from the source application, which beats compressing afterwards.',
        ],
      },
    ],
    faq: [
      { q: 'What is the maximum email attachment size?', a: 'Gmail and Outlook.com accept 25 MB per message; corporate mail servers often stop at 10 MB. Aim below 10 MB to be safe.' },
      { q: 'Does compressing a PDF remove the text layer?', a: 'Lossless cleanup and image recompression keep text selectable and searchable. Only the flatten mode turns pages into images.' },
      { q: 'Why did lossless compression barely change the size?', a: 'The file was already compact. Its size is in its images, so the next step is image recompression at a lower DPI.' },
      { q: 'Is compressing the same as reducing resolution?', a: 'Reducing resolution is one part of image recompression. Lossless mode changes no resolution at all.' },
    ],
  },
  {
    slug: 'reduce-image-size-for-email-and-uploads',
    title: 'How to Reduce Image File Size for Email, Forms and Websites',
    description: 'The two settings that make a photo small, typical size targets for email, job applications and listings, and how to shrink one in your browser.',
    heading: 'How to reduce an image\'s file size',
    dek: 'Two settings do almost all the work. Here are the numbers to use for email, forms, listings and websites.',
    keywords: ['reduce image file size', 'make image smaller for email', 'compress image for upload', 'image too large to upload', 'reduce photo size to 1mb', 'shrink photo size'],
    updated: '2026-09-25',
    tools: ['compress-image', 'compress-jpg', 'resize-image', 'convert-image'],
    sections: [
      {
        h: 'Why the photo is 5 MB',
        p: [
          'A modern phone photo is around 4000 by 3000 pixels, saved at a quality setting near the maximum. That is right for printing a poster and wasteful for everything else. A screen shows at most about 2000 pixels across; an email preview shows 600. The file is big because it stores far more than anyone will see.',
        ],
      },
      {
        h: 'Setting 1: dimensions',
        p: [
          'Halving the width and height quarters the file size before any compression. Limit the longest side to **2000 pixels** for a website or a screen, **1600** for an attachment, **1200** for a listing photo or a form upload, **800** for an avatar. The [resize page](/resize-image) does this for a batch at once and keeps the proportions.',
        ],
      },
      {
        h: 'Setting 2: JPG quality',
        p: [
          'JPG quality runs from 1 to 100. Phones save at about 95. At **80** the file is roughly a third of the size and nobody can tell the difference at normal viewing size; at **70** it is a quarter and still fine for photos; below 60, gradients and skin start to show blocks. The [compress page](/compress-jpg) has a slider and shows the size before and after, so you can go as low as looks acceptable.',
        ],
      },
      {
        h: 'Setting 3: the format',
        p: [
          'Screenshots and graphics are usually PNG, which is lossless and often large. A screenshot of a web page converted to JPG at quality 85 is a fifth of the size and looks the same; the [PNG to JPG page](/png-to-jpg) does that. WebP is smaller than both at the same quality and is accepted by every current browser, but not by every form or email client. The [format guide](/guides/which-image-format-to-use) has the details.',
        ],
      },
      {
        h: 'Targets that come up',
        p: ['These settings hit common limits with room to spare:'],
        list: [
          '**Under 1 MB** (most forms, job portals): longest side 1600, quality 80.',
          '**Under 500 KB** (marketplaces, forums): longest side 1200, quality 75.',
          '**Under 200 KB** (avatars, ID photos, some government forms): longest side 800, quality 70.',
          '**Email with ten photos**: longest side 1600, quality 75, then send the zip the tool offers.',
        ],
      },
      {
        h: 'Doing it without uploading',
        p: [
          'Resizing and re-encoding are things a browser does natively, so there is no reason to send the photo to a compression website first, wait for the upload, and be told the third file needs a subscription. Stayput\'s [image compressor](/tools/compress-image) uses the browser\'s own encoder on your device, handles hundreds of files in one go, and shows the size of each result. Re-encoding drops the EXIF block, including the GPS location, which is usually what you want for anything going online.',
        ],
      },
    ],
    faq: [
      { q: 'Does reducing file size reduce quality?', a: 'Reducing dimensions discards pixels you would not have seen; lowering JPG quality discards fine detail. Both are invisible at sensible settings, and both are irreversible, so keep the original.' },
      { q: 'How do I make a photo smaller on my phone?', a: 'Open the compress page in the phone\'s browser, pick the photos, set the size, and save the results. It works on iPhone and Android without an app, and offline once loaded.' },
      { q: 'Why is my PNG so big?', a: 'PNG is lossless, so a photo saved as PNG is several times the size of the same photo as JPG. Convert photos to JPG; keep PNG for screenshots with text and for transparency.' },
      { q: 'Can I compress without changing the dimensions?', a: 'Yes. Choose "Keep size" in the resize options and only the quality slider applies.' },
    ],
  },
  {
    slug: 'does-this-website-upload-my-files',
    title: 'How to Tell Whether a Website Uploads Your Files: A Network Tab Guide',
    description: 'A five-minute check anyone can do: open the browser\'s network panel, add a file to a tool, and see whether it leaves your computer.',
    heading: 'Does this website upload my files? How to check',
    dek: 'A five-minute check with tools already in your browser. No trust required.',
    keywords: ['does this website upload my files', 'check if website uploads files', 'browser network tab file upload', 'client side processing verify', 'is this online tool private'],
    updated: '2026-09-25',
    tools: ['strip-exif', 'merge-pdf', 'heic-to-jpg'],
    sections: [
      {
        h: 'The claim and the check',
        p: [
          'Plenty of file tools now say "your files never leave your browser". Some mean it. The good news is that you do not need to trust any of them, including this site: every browser has a panel that lists each request a page makes, and an uploaded file is a request. Here is how to read it.',
        ],
      },
      {
        h: 'Step 1: open the network panel',
        p: [
          'Open the tool\'s page. Press **F12** on Windows or Linux, **Cmd-Option-I** on a Mac, or right-click the page and choose Inspect. A panel opens; pick the tab labelled **Network**. Reload the page so the list starts fresh. You will see the page\'s own files load: HTML, scripts, styles, maybe a font, maybe a large file for a decoder. That is the site delivering its program to you, and it is expected.',
        ],
      },
      {
        h: 'Step 2: clear the list, then add a file',
        p: [
          'Click the clear button (a circle with a line through it) so the list is empty. Now drop your file onto the tool and run it. Watch the list.',
        ],
      },
      {
        h: 'Step 3: read what appears',
        p: ['Three outcomes cover almost every tool:'],
        list: [
          '**An upload.** A row appears with method **POST** or **PUT**, often to a path like /upload or /api/convert, and its size (the Size column, or the request\'s Payload tab) matches your file. The file left your computer. Everything the site says about deletion applies from here.',
          '**Nothing, or only small pings.** The list stays empty, or shows a few requests of under a couple of kilobytes to an analytics host. Your file did not leave. A row can also appear for a decoder or library the tool fetches on demand; that is a **GET** with no payload, and you can confirm it by clicking it: the request has no body.',
          '**Chunks.** Some uploaders split large files into many POST requests of a few megabytes each. The pattern is the same: outgoing requests with bodies that add up to your file.',
        ],
      },
      {
        h: 'Step 4: the airplane-mode test',
        p: [
          'For a second opinion that needs no panel at all: load the tool, switch on airplane mode or unplug the network, and run it. A tool that processes locally keeps working. A tool that uploads fails at once. This also catches the case where a site processes locally but "phones home" with the result.',
        ],
      },
      {
        h: 'What Stayput looks like in the panel',
        p: [
          'On any Stayput tool you will see the page and its scripts load, on the HEIC and JPEG XL pages one larger GET for the decoder program, and one small anonymous page-count request. After you add files: nothing, apart from that same small count when a tool finishes, which names the tool and a size bucket and never a file name. Each tool page also runs this count for you and lists the requests under "Open the network tab. It stays empty." The site is [open source](https://github.com/keenanlk/stayput), so the third check is reading the code.',
        ],
      },
      {
        h: 'What popular upload-based services say they do',
        p: ['The check tells you whether a file leaves; a service’s own policy tells you what happens to it after. We have summarised the published policies of the most searched-for converters, with deletion times, storage location and ads, from their own pages:'],
        list: [
          '[CloudConvert](/guides/is-cloudconvert-safe), [FreeConvert](/guides/is-freeconvert-safe), [Convertio](/guides/is-convertio-safe) and [Zamzar](/guides/is-zamzar-safe) for general file conversion.',
          '[iLovePDF](/guides/is-ilovepdf-safe), [Smallpdf](/guides/is-smallpdf-safe) and [PDF24](/guides/is-pdf24-safe) for PDFs.',
          '[Ezgif](/guides/is-ezgif-safe) for GIFs and short video edits.',
          '[remove.bg](/guides/is-remove-bg-safe) for background removal.',
        ],
      },
    ],
    faq: [
      { q: 'What if the site uses a web worker or WebAssembly?', a: 'Both run inside your browser and show nothing in the network list except the one-time download of their code. They are how local processing is done, not a way to hide an upload.' },
      { q: 'Can a site upload my file in a way the panel does not show?', a: 'No. Every request from the page goes through the browser and appears in the panel, including ones from workers and service workers. What the panel cannot show is what a server does after an upload.' },
      { q: 'Does "encrypted" mean not uploaded?', a: 'No. Encryption protects the file in transit. If a POST with your file\'s size appears, the file was sent, encrypted or not.' },
      { q: 'Do I need to be technical to do this?', a: 'No. Open the panel, clear it, drop a file, and look for rows with a size close to your file. That is the whole check.' },
    ],
  },
  {
    slug: 'sign-a-pdf-without-adobe',
    title: 'How to Sign a PDF Without Adobe Acrobat (Free, No Upload)',
    description: 'Draw or type a signature and place it on a PDF in your browser, without Acrobat, an account, or uploading the contract. Plus built-in options on each device.',
    heading: 'How to sign a PDF without Adobe Acrobat',
    dek: 'Sign a contract in your browser in a minute, with nothing uploaded, and the built-in options on every platform.',
    keywords: ['sign pdf without adobe', 'how to sign a pdf', 'sign pdf free', 'add signature to pdf', 'sign pdf online safe', 'electronic signature pdf free'],
    updated: '2026-09-25',
    tools: ['sign-pdf', 'merge-pdf', 'pdf-page-numbers'],
    sections: [
      {
        h: 'What "signing a PDF" usually means',
        p: [
          'For a lease, a consent form, an offer letter or a freelance contract, signing means placing an image of your signature on the signature line and sending the file back. It is the electronic version of print, sign, scan. It does not need Acrobat, a subscription, or an e-signature service that stores your document and emails you about it for a year.',
          'This is different from a **digital signature**, which is a cryptographic certificate embedded in the PDF and verified by the reader. Some regulated or high-value documents require that; if a counterparty needs it, they will use a platform that provides it and say so.',
        ],
      },
      {
        h: 'Signing in your browser, without uploading',
        p: [
          'Open the [sign PDF tool](/tools/sign-pdf) and drop the document. Draw your signature with a mouse, finger or stylus, or type your name in a handwriting font. Click where it should go on the page, resize it, and add the date if the form wants one. Save, and the signed PDF downloads. The signature is drawn into the PDF by pdf-lib inside the tab; the contract is never uploaded, which is the right property for a document that contains your address, salary or bank details.',
          'Sign once and reuse: the signature stays in the tool for the session, so multi-page forms with several signature lines take a few clicks.',
        ],
      },
      {
        h: 'Built-in options by platform',
        p: ['Every major platform has a way to do the same thing, with a bit more friction:'],
        list: [
          '**Mac**: open the PDF in Preview, click the Markup toolbar, then the signature button. Create a signature with the trackpad or by holding a signed paper up to the camera. Drag it onto the page.',
          '**iPhone and iPad**: open the PDF in Files or Mail, tap the Markup pen, tap the plus button, choose Signature.',
          '**Android**: Google Drive\'s PDF viewer has an annotate mode with a freehand pen; a drawn signature works, though it is less tidy. Many phone makers\' file apps include a Sign option.',
          '**Windows**: Edge opens PDFs and has a Draw tool for a freehand signature. There is no typed-signature option. Acrobat Reader\'s free Fill & Sign also works but requires the Adobe app and, by default, an account.',
        ],
      },
      {
        h: 'Before you send it',
        p: [
          'If the form has a "sign here" box on every page, use the tool\'s place-on-every-page option. If you are returning several documents, [merge them](/tools/merge-pdf) into one file so nothing gets lost. And if the recipient insists on a "certified" or "digital" signature, ask which platform they use rather than guessing; a drawn signature is legally fine for most everyday contracts but is not what they mean.',
        ],
      },
    ],
    faq: [
      { q: 'Is a drawn or typed signature legally valid?', a: 'In the United States (ESIGN Act), the United Kingdom, the European Union (eIDAS "simple electronic signature") and most other jurisdictions, a signature you intend as your signature is valid for ordinary contracts. Certain documents, such as wills and some property deeds, have stricter rules.' },
      { q: 'Can the recipient remove the signature?', a: 'It is drawn into the page content like any other graphic. Editing it out is as hard, or as easy, as editing any part of a PDF, which is the same as for a scanned signature.' },
      { q: 'Does it work on a phone?', a: 'Yes. Drawing with a finger on a phone screen works well, and the tool is installable as an app that works offline.' },
      { q: 'Is my document uploaded when I sign it here?', a: 'No. The signature is placed by code running in your browser; you can verify it in the network tab or by signing with the network switched off.' },
    ],
  },
  {
    slug: 'which-image-format-to-use',
    title: 'JPG vs PNG vs WebP vs HEIC: Which Image Format Should You Use?',
    description: 'A practical guide to picking an image format: photos, screenshots, logos, transparency, web pages, email and archives, with the conversions to do it.',
    heading: 'JPG, PNG, WebP or HEIC: which image format to use',
    dek: 'A practical rule for each job, and the conversion to get there.',
    keywords: ['jpg vs png', 'webp vs png', 'which image format to use', 'heic vs jpg', 'best image format for web', 'png or jpg for screenshots', 'what is a jfif file'],
    updated: '2026-09-26',
    tools: ['convert-image', 'png-to-jpg', 'jpg-to-webp', 'heic-to-jpg', 'jfif-to-jpg', 'gif-to-png', 'svg-to-jpg'],
    sections: [
      {
        h: 'The one-line rules',
        p: ['If you only read this section:'],
        list: [
          '**Photos** you will share or upload: **JPG** at quality 80 to 90.',
          '**Screenshots, diagrams, text, logos**: **PNG**. Sharp edges stay sharp.',
          '**Anything with a transparent background**: **PNG** (or WebP on a website).',
          '**Images on a website you control**: **WebP**. Smaller than both, supported everywhere.',
          '**Photos staying on your iPhone**: leave them as **HEIC**. Convert when they need to go somewhere else.',
        ],
      },
      {
        h: 'JPG: the photo format',
        p: [
          'JPG compresses by discarding detail the eye does not notice, which works wonderfully for photographs and badly for text and flat colour, where it produces visible smudges around edges. Every device, site and printer opens it. It has no transparency. Each re-save loses a little more, so edit from an original and export once. Convert with [PNG to JPG](/png-to-jpg), [WebP to JPG](/webp-to-jpg) or [HEIC to JPG](/tools/heic-to-jpg).',
        ],
      },
      {
        h: 'PNG: the lossless format',
        p: [
          'PNG stores every pixel exactly and supports transparency. That makes it right for screenshots, interface graphics, charts, logos and anything you will keep editing. It makes it wrong for photos, where the file is five to ten times the size of a JPG that looks the same. Convert with [JPG to PNG](/jpg-to-png) when a form or template insists on PNG, or [WebP to PNG](/webp-to-png) for an image saved from a website.',
        ],
      },
      {
        h: 'WebP: the web format',
        p: [
          'WebP does both jobs, lossy and lossless, at 25 to 35 percent smaller than JPG or PNG, with transparency. Every current browser displays it, which is why images saved from websites now arrive as WebP. Older desktop software and some upload forms still reject it, so it is a format for web pages you publish, not for files you hand to other people. Convert to it with [JPG to WebP](/jpg-to-webp) or [PNG to WebP](/png-to-webp), and away from it with [WebP to PNG](/webp-to-png).',
        ],
      },
      {
        h: 'HEIC: the iPhone format',
        p: [
          'HEIC is what iPhones have saved photos as since 2017: about half the size of JPG at the same quality, with support for wide colour and live photos. Outside Apple devices it is poorly supported; Windows needs a paid extension and most web forms refuse it. Keep photos as HEIC on the phone and convert copies with [HEIC to JPG](/tools/heic-to-jpg) or [HEIC to PNG](/heic-to-png) when they need to go elsewhere. The [Windows guide](/guides/open-heic-files-on-windows) covers the options there.',
        ],
      },
      {
        h: 'AVIF and JPEG XL',
        p: [
          'AVIF is a newer web format, smaller again than WebP, supported by all current browsers and few other programs. JPEG XL is technically the best of the lot and supported almost nowhere except Safari. Both are formats you might receive, not ones to send: [AVIF to JPG](/avif-to-jpg), [AVIF to PNG](/avif-to-png), [JXL to JPG](/jxl-to-jpg) and [JXL to PNG](/jxl-to-png) turn them into something that opens.',
        ],
      },
      {
        h: 'JFIF, GIF and SVG',
        p: [
          'A **.jfif** file is a JPG with a different name, usually a picture saved from the web on Windows. Renaming it to .jpg works; for a batch use [JFIF to JPG](/jfif-to-jpg), or [JFIF to PNG](/jfif-to-png) for a copy you will keep editing. **GIF** is an old 256-colour format that survives in logos and animations; still GIFs are better as PNG ([GIF to PNG](/gif-to-png)), or as JPG when a form insists ([GIF to JPG](/gif-to-jpg)). **SVG** is a vector drawing, not pixels: keep it for websites and design tools, and export a copy with [SVG to PNG](/svg-to-png) or [SVG to JPG](/svg-to-jpg) when somewhere will only take an image.',
        ],
      },
    ],
    faq: [
      { q: 'Should I convert JPG to PNG for better quality?', a: 'No. The detail JPG discarded is gone; the PNG will be a large, exact copy of the JPG as it is. Convert only when PNG is required.' },
      { q: 'Which format for a logo on a website?', a: 'SVG if you have it, since it scales perfectly. Otherwise PNG with transparency, or WebP lossless for a smaller file.' },
      { q: 'What format do I send a photo for printing?', a: 'JPG at quality 95 or a lossless PNG or TIFF, at the original resolution. Do not resize down for printing.' },
      { q: 'Do these conversions keep the photo\'s metadata?', a: 'By default the browser drops EXIF, including location, when it re-encodes. The converter has a "Keep EXIF metadata" option for JPG output when you want it preserved.' },
    ],
  },
  {
    slug: 'convert-files-without-uploading',
    title: 'How to Convert and Edit Files Without Uploading Them Anywhere',
    description: 'Everyday file jobs like HEIC to JPG, merging PDFs and compressing images can run entirely in your browser. How that works, and tools that do it.',
    heading: 'How to convert and edit files without uploading them',
    dek: 'Browsers can do most file jobs themselves. What runs locally, why it is enough, and which tools to use.',
    keywords: ['convert files without uploading', 'offline file converter', 'browser based file tools', 'local file conversion', 'privacy file converter', 'no upload pdf tools'],
    updated: '2026-09-25',
    tools: ['heic-to-jpg', 'merge-pdf', 'compress-image', 'strip-exif'],
    sections: [
      {
        h: 'The default is upload, and it does not need to be',
        p: [
          'Search for any file chore and the first page of results is sites that take your file, process it on their server, and return a download with an ad and a limit. That model made sense in 2010, when browsers could not decode a HEIC photo or rewrite a PDF. They can now. JavaScript and WebAssembly let a web page run the same open-source libraries a desktop program would use, on your device, at desktop speed.',
        ],
      },
      {
        h: 'What runs locally',
        p: ['On Stayput, all of it. Specifically:'],
        list: [
          '[HEIC to JPG or PNG](/tools/heic-to-jpg): libheif, the decoder used by Linux desktops, compiled to WebAssembly.',
          '[Image conversion](/tools/convert-image), [resizing](/resize-image) and [compression](/tools/compress-image): the browser\'s own decoders and encoders through the canvas API; JPEG XL and AVIF via the Squoosh decoders.',
          '[Removing EXIF and location data](/tools/strip-exif): a lossless byte-level editor for JPG, PNG and WebP.',
          '[Merge](/tools/merge-pdf), [split](/tools/split-pdf), [rotate](/tools/rotate-pdf), [reorder](/tools/reorder-pdf), [sign](/tools/sign-pdf), [page numbers](/tools/pdf-page-numbers) and [compress](/tools/compress-pdf) for PDFs: pdf-lib for editing and pdf.js, Firefox\'s PDF engine, for rendering.',
          '[Images to PDF](/tools/image-to-pdf) and [PDF to images](/tools/pdf-to-image): the same two libraries.',
        ],
      },
      {
        h: 'Why local is enough',
        p: [
          'A laptop or phone from the last several years converts a hundred HEIC photos in under a minute and merges a 200-page PDF in a second. The upload to a server would take longer than the work. There is no quota because nothing costs the site money per file; there is no queue because there is no shared server. And the privacy property is not a promise: the file is never in a request, which you can [check in the network tab](/guides/does-this-website-upload-my-files).',
        ],
      },
      {
        h: 'What still needs a server',
        p: [
          'A few jobs do: OCR of long scanned documents (possible locally but slow), format conversions that depend on proprietary software (Word to PDF with perfect fidelity, some CAD formats), and anything involving another person\'s system, like an e-signature workflow. For those, choose a provider whose retention policy you have read, and send only what you would send by email.',
        ],
      },
      {
        h: 'Working offline and installing it',
        p: [
          'Because every tool is a static page and a script, the site caches itself after the first visit and works with the network off. In Chrome, Edge and Safari you can install it as an app from the browser menu; it takes no space worth mentioning and opens like any other program.',
        ],
      },
    ],
    faq: [
      { q: 'Is a browser tool slower than a desktop app?', a: 'For these jobs, not noticeably. WebAssembly runs the same code at close to native speed, and the work happens on your own processor.' },
      { q: 'Do I need to install anything?', a: 'No. Open the page. Optionally install it as an app from the browser menu for offline use.' },
      { q: 'What about very large files?', a: 'The limit is your device\'s memory. A few hundred megabytes of PDF or a few hundred photos are fine on a laptop; a phone manages less at once.' },
      { q: 'How do I know the code does what it says?', a: 'It is open source under the MIT licence. The repository is linked in the footer of every page, and the network tab shows what the page does while you use it.' },
    ],
  },
  {
    slug: "how-to-view-photo-metadata",
    title: "How to View Photo Metadata (EXIF) on iPhone, Android, Windows and Mac",
    description: "See a photo's hidden location, date and camera data. The built-in way on every phone and computer, what each hides, and how to check any photo without uploading it.",
    heading: "How to view photo metadata on any device",
    dek: "Every phone and computer can show some of a photo's EXIF data. Here is where to look, what each one leaves out, and how to see all of it.",
    keywords: ["how to view photo metadata", "view photo metadata", "view photo metadata iphone", "how to view photo metadata on android", "exif viewer", "check photo location"],
    updated: "2026-09-29",
    tools: ["exif-viewer", "strip-exif", "remove-location-from-photos"],
    sections: [
      {
        h: "The quickest way, on any device",
        p: ["Open the [EXIF viewer](/tools/exif-viewer) in any browser and drop the photo on it. It reads the file on your device and shows where the photo was taken, when, on which phone or camera, any serial number or owner name, and every other EXIF field in plain words. It reads JPG, PNG, WebP, HEIC from iPhones and TIFF or DNG files, and nothing is uploaded, which matters when the reason you are checking is that the photo might be private.", "The built-in panels below are fine for a quick look. They each show a subset, and none of them tells you about the embedded thumbnail, the camera serial number or the XMP and IPTC blocks that editors add."],
      },
      {
        h: "iPhone and iPad",
        p: ["Open the photo in **Photos** and swipe up, or tap the **ⓘ** button. You get the date and time, the camera and lens, the resolution and file size, the exposure settings and, if the photo has a location, a small map. Tap **Adjust** next to the date or the map to change or remove them for that photo.", "This view is of the photo in your library, not necessarily the file someone receives. When you share, the **Options** link at the top of the share sheet has a **Location** switch; turned off, the copy you send has no GPS. Photos saved from a website or AirDropped to you show whatever the file itself carries."],
      },
      {
        h: "Android",
        p: ["In **Google Photos**, open the photo and swipe up (or tap the three-dot menu, then **Details**). You see the date, the device, the file name and size, the camera settings and a map if a location is stored. Samsung **Gallery** shows the same under the **ⓘ** button or **Details**.", "Google Photos can also estimate a location from your Location History when the file has none. That estimate lives in your Google account, not in the file, so the photo you send may carry less than the panel suggests. The only reliable check of the file is to read the file."],
      },
      {
        h: "Windows",
        p: ["Right-click the photo in File Explorer, choose **Properties** and open the **Details** tab. It lists the date taken, camera maker and model, exposure settings, and a **GPS** section with latitude and longitude when present. The **Remove Properties and Personal Information** link at the bottom can clear some of them.", "Explorer only lists fields it knows how to edit. Maker notes, serial numbers, XMP history and the embedded thumbnail are not shown, and for HEIC files you need the HEIF extension installed before any of it appears."],
      },
      {
        h: "Mac",
        p: ["In **Preview**, open the photo and choose **Tools → Show Inspector** (Cmd-I), then the **ⓘ** tab. The **EXIF** and **GPS** sub-tabs show most fields, and the GPS tab has a **Remove Location Info** button. In **Finder**, **Get Info** (Cmd-I) shows the dimensions, the device and the date under **More Info**, but no location. In the **Photos** app, the ⓘ button shows the same summary as on an iPhone.", "For everything, the terminal command `mdls photo.jpg` lists what Spotlight indexed, and `sips -g all photo.jpg` prints the basic properties."],
      },
      {
        h: "What to look for",
        p: ["When you check a photo before sharing it, these are the fields that identify someone or somewhere:"],
        list: ["**Latitude and longitude.** Paste them into a map and you have the street, often the house.", "**Date and time taken**, with the time zone on newer phones. Combined with location, it is a timeline.", "**Camera serial number, camera owner, artist and unique image ID.** Serial numbers link photos taken with the same camera across sites; owner and artist are often a full name.", "**Embedded thumbnail.** A small preview written when the photo was taken. Some editors crop the picture and leave the old thumbnail behind.", "**Software and host computer.** Which app edited it, sometimes the name of the computer."],
      },
      {
        h: "Check again after you remove it",
        p: ["To remove all of it without changing the picture, use the [EXIF remover](/tools/strip-exif): it deletes the metadata blocks and copies the image data byte for byte, so the photo looks exactly the same. Then drop the cleaned copy on the [viewer](/tools/exif-viewer); it should say \"None stored\" for location and list no fields. The [location guide](/guides/remove-location-data-from-photos) covers the phone settings that stop new photos from recording location in the first place."],
      },
    ],
    faq: [
      { q: "Is it safe to use an online EXIF viewer?", a: "Only if it reads the photo in your browser. Most EXIF viewer sites upload the photo to their server and read it there, which gives them the location and everything else you were checking for. The [Stayput viewer](/tools/exif-viewer) reads it in the tab; you can confirm by watching the network tab while you drop a photo." },
      { q: "Why does the photo I received show no location?", a: "Messaging apps like WhatsApp, Signal, iMessage for some settings, and most social networks remove EXIF when a photo is sent or posted. Email, cloud links, AirDrop and file transfers usually do not." },
      { q: "Can I see photo metadata from a link or a website?", a: "Only after downloading the file. Most sites that host images strip the metadata on upload, so a downloaded image from a social network is usually empty. Images on smaller sites, forums and cloud shares often keep it." },
      { q: "Do screenshots have metadata?", a: "Some. A screenshot has no GPS or camera data, but it can carry the device model, the software and the date. PNG screenshots from some tools add a text block too." },
    ],
  },
  {
    slug: "strip-exif-without-re-encoding",
    title: "Stripping EXIF Without Re-encoding the Image: How a Lossless Remover Works",
    description: "Remove EXIF, GPS and other metadata from JPEG, PNG and WebP by editing the file structure instead of re-saving the pixels: the segments, chunks, gotchas and code.",
    heading: "Stripping EXIF without re-encoding the JPEG",
    dek: "How Stayput removes location and camera data from photos in the browser, byte for byte, in about 600 lines of TypeScript and no library.",
    keywords: ["strip exif without re-encoding", "lossless exif removal", "remove exif javascript", "jpeg app1 segment", "remove metadata without losing quality", "exif remover how it works"],
    updated: "2026-09-29",
    tools: ["strip-exif", "exif-viewer", "heic-to-jpg"],
    sections: [
      {
        h: "The problem with the usual answers",
        p: ["There are two common ways to remove EXIF data from a photo, and both have a cost. The first is to re-save it: open it in an editor or pass it through a canvas, then export a new JPEG. The metadata is gone because the encoder never writes it, but the picture has been decoded and compressed again, so it loses a little quality and often grows in size. The second is to upload it to a website that does the same on a server, which removes the location from the file by handing it to someone else first.", "There is a third way. A photo file is a container: a sequence of labelled blocks, one of which holds the compressed picture and others that hold metadata. If you can read the container, you can copy every block except the metadata ones. The picture bytes are never decoded, so the result is pixel-identical and slightly smaller. That is how the [Stayput EXIF remover](/tools/strip-exif) works, entirely in the browser, and this page walks through it."],
      },
      {
        h: "What is actually in the file",
        p: ["Each of the three common web formats is a different container, but the idea is the same in all of them:"],
        list: ["**JPEG** is a list of segments, each starting with a 0xFF marker byte. APP1 (0xFFE1) holds EXIF when its payload starts with \"Exif\\0\\0\", or XMP when it starts with Adobe's namespace URL. APP2 holds the ICC colour profile, APP13 holds IPTC, and 0xFFFE is a comment. The picture itself follows the start-of-scan marker (0xFFDA) and runs to the end of the file.", "**PNG** is an eight-byte signature followed by chunks, each with a length, a four-letter type, the data and a CRC. Metadata lives in eXIf, tEXt, zTXt, iTXt (where XMP goes) and tIME; the colour profile is iCCP; the picture is in IDAT.", "**WebP** is a RIFF file: \"RIFF\", a total size, \"WEBP\", then chunks. EXIF, \"XMP \" and ICCP chunks hold metadata. An extended VP8X header chunk carries flag bits announcing which of them are present."],
      },
      {
        h: "The approach, for JPEG",
        p: ["Walk the segments from the start of the file until the start-of-scan marker. For each one, read its two-byte big-endian length, classify it by marker and the first bytes of its payload, and decide whether to keep it. Then copy the kept segments and everything from the scan onward into a new file."],
        after: ["JFIF and Adobe segments stay because decoders use them to interpret colour. The ICC profile stays by default for the same reason: it holds no personal data, and dropping it can make a wide-gamut phone photo look washed out. The test suite checks the last 2,000 bytes of the output against the input to prove the scan data is byte-identical."],
        code: "for (const s of segments) {\n  const kind = segKind(b, s); // 'EXIF', 'XMP', 'ICC', 'IPTC', 'Comment', 'JFIF'...\n  const isMeta = kind !== undefined && kind !== 'JFIF' && kind !== 'Adobe';\n  const drop = isMeta && (kind !== 'ICC' || !keepIcc);\n  if (drop) {\n    removed += s.end - s.start;\n    continue;\n  }\n  parts.push(b.subarray(s.start, s.end));\n}\nparts.push(b.subarray(scanStart)); // the compressed picture, untouched",
      },
      {
        h: "PNG and WebP",
        p: ["PNG is simpler still: every chunk carries its own length and CRC, so dropping a chunk needs no fix-ups anywhere else. Copy the signature, then every chunk that is not eXIf, tEXt, zTXt, iTXt or tIME (and iCCP, if you asked for the profile to go).", "WebP needs two fix-ups. The RIFF header at the start stores the size of everything after it, so it has to be rewritten once the chunks are dropped. And if the file has a VP8X header, its flags byte still claims the EXIF and XMP chunks exist, which some decoders reject. Clear those bits:"],
        code: "if (c.fourcc === 'VP8X') {\n  const chunk = b.slice(c.start, c.end);\n  let flags = chunk[8]!;\n  flags &= ~0x08 & ~0x04;          // EXIF and XMP present\n  if (!keepIcc) flags &= ~0x20;    // ICC present\n  chunk[8] = flags;\n  body.push(chunk);\n}\n// ...then a new header: \"RIFF\", payload.length + 4, \"WEBP\"",
      },
      {
        h: "The gotchas",
        p: ["Most of the work is in the cases that break the simple version:"],
        list: ["**Orientation.** Phones usually store a portrait photo sideways and set an EXIF orientation tag telling viewers to rotate it. Delete EXIF and the photo displays on its side. The remover reads the tag first and offers a choice: bake the rotation into the pixels (the one path that does re-encode) or keep the file lossless and accept the sideways display.", "**Padding and fill bytes.** JPEG allows any number of 0xFF fill bytes between segments, and standalone markers (restart markers, SOI) have no length field. Treat them as lengths and you walk off into the image data.", "**RIFF padding.** WebP chunks with an odd length are followed by a zero pad byte that is not counted in the chunk's length. Miss it and the next chunk header is read one byte early.", "**XMP in PNG.** XMP arrives as an iTXt chunk with the keyword \"XML:com.adobe.xmp\", so it is dropped along with the other text chunks rather than needing its own rule.", "**Thumbnails.** The EXIF block can embed a small JPEG preview in its second directory. Editors that crop the photo sometimes leave the old thumbnail, so a \"cropped\" photo still carries the uncropped picture. Dropping the whole EXIF segment takes the thumbnail with it."],
      },
      {
        h: "Reading EXIF, for the report and the viewer",
        p: ["Before removing anything, the tool shows what the photo carries, which means parsing the EXIF block itself. It is a small TIFF file: a byte-order mark (\"II\" for little-endian, \"MM\" for big), the number 42, and the offset of the first directory. Each directory is a count followed by 12-byte entries: tag, type, count, and either the value or an offset to it. Tag 0x8769 points to the camera settings directory and 0x8825 to the GPS one, whose latitude and longitude are three rationals each for degrees, minutes and seconds."],
        after: ["The same walker, extended to name about 80 tags, powers the [EXIF viewer](/tools/exif-viewer). It guards every offset against the block length and remembers which directories it has visited, because a malformed or hostile file can point a directory at itself."],
        code: "const lat = d + m / 60 + s / 3600;\nreturn ref === 'S' ? -lat : lat; // same for longitude with 'W'",
      },
      {
        h: "The HEIC twist",
        p: ["iPhone photos are HEIC, an ISOBMFF container of nested boxes rather than segments. The EXIF block is an item listed in the meta box's iinf and located by iloc, which gives its offset and length in the file. The remover cannot rewrite HEIC losslessly yet, but reading the EXIF item out lets the [HEIC to JPG converter](/tools/heic-to-jpg) either drop the metadata or carry it over into the JPEG's APP1 segment, with the orientation tag reset because the decoder has already rotated the pixels."],
      },
      {
        h: "Testing it",
        p: ["The Playwright suite generates fixture photos with known EXIF, GPS, comments and orientation using Pillow, drops them into the page, and parses the outputs: no metadata kinds left, no GPS, a smaller file, identical scan bytes. Another check records every request the tab makes after files are added and fails if any carries a body or goes anywhere but the site itself and the anonymous usage counter. That second check is the one that matters for a privacy tool, because it is the claim users cannot see."],
      },
      {
        h: "Code and tool",
        p: ["The whole thing is in `src/lib/exif.ts` (the stripper) and `src/lib/exif-read.ts` (the viewer's field reader) in the [Stayput repository](https://github.com/keenanlk/stayput), MIT licensed. To try it on your own photos, open the [EXIF remover](/tools/strip-exif), then drop the cleaned copy on the [EXIF viewer](/tools/exif-viewer) to see that nothing is left."],
      },
    ],
    faq: [
      { q: "Does removing EXIF this way reduce quality?", a: "No. The compressed picture data is copied byte for byte and never decoded. The only exception is when you ask the tool to apply the orientation tag to a sideways photo, which has to re-encode." },
      { q: "Why not just draw the image on a canvas and export it?", a: "That works and is simpler, but it re-compresses the photo, loses some quality, discards the colour profile and usually makes a phone photo larger. It also takes more memory for big images." },
      { q: "Is this safe to run in the browser?", a: "Yes. The file is read with the File API into memory in your tab and the cleaned copy is handed to your browser's download. No request carries the file, which you can verify in the network tab." },
    ],
  },

  {
    slug: 'is-cloudconvert-safe',
    title: 'Is CloudConvert Safe? What Happens to Your Files, and When to Keep Them Local',
    description: 'CloudConvert is a reputable German service with ISO 27001 certification and 24-hour deletion. What that covers, and how to convert without uploading.',
    heading: 'Is CloudConvert safe?',
    dek: 'For most files, yes: it is an established, certified service. The real question is whether a given file should leave your computer at all.',
    keywords: ['is cloudconvert safe', 'cloudconvert safe', 'cloudconvert privacy', 'is cloudconvert legit', 'cloudconvert security', 'cloudconvert alternative no upload'],
    updated: '2026-09-29',
    tools: ['convert-image', 'video-to-mp3', 'heic-to-jpg', 'video-to-gif'],
    sections: [
      {
        h: 'The short answer',
        p: [
          'CloudConvert is a long-running file conversion service from Lunaweb GmbH in Munich, Germany, and it is legitimate. By the standards of upload-based converters its published practices are strong. If you are converting a holiday video or a logo, it is a reasonable choice.',
          'What no upload service can change is the basic fact of an upload: for a while, a complete copy of your file is on someone else’s computer. For a contract, a scanned passport, medical records or anything under a confidentiality agreement, the safest converter is one where the file never leaves your device. That is the question this page helps you answer.',
        ],
      },
      {
        h: 'What CloudConvert says it does with your files',
        p: ['From CloudConvert’s own security page and privacy policy, as checked on 29 September 2026:'],
        list: [
          '**Deletion.** Files are deleted when you press the delete (×) button, and automatically after 24 hours at the latest. It offers no permanent storage.',
          '**Isolation.** Each conversion runs in its own isolated container, and the company says its staff cannot technically access your files.',
          '**Encryption.** Transfers to and from the service use SSL/TLS.',
          '**Location and law.** Processing happens in the region you select, on ISO 27001 certified cloud providers including AWS, and the company is bound by German and EU data protection law (GDPR).',
          '**Certification.** Its own information security management system is ISO 27001 certified by TÜV Süd.',
        ],
        after: ['Those are good practices. They describe how a well-run server handles your file, which is the part you have to take on trust.'],
      },
      {
        h: 'What any upload still means',
        p: [
          'None of the following is specific to CloudConvert; it applies to every service that converts on a server. Your file travels over the internet, sits on a machine you cannot inspect for up to a day, and is covered by the company’s policies and the law where it is processed. Deletion promises are about the file store; you cannot audit logs, backups or the conversion workers yourself.',
          'For many people and most files, that trade is fine. It becomes a problem when a rule says the file must not leave your control: an employer’s data policy, a client NDA, legal privilege, patient data under HIPAA, or simply a document you would not email to a stranger.',
        ],
      },
      {
        h: 'Converting the same files without uploading',
        p: [
          'Browsers can now do much of this work themselves. Stayput runs conversions in the page, on your own device, so there is no upload to trust: images between JPG, PNG, WebP, HEIC, AVIF, TIFF and more with the [image converter](/tools/convert-image), iPhone photos with [HEIC to JPG](/tools/heic-to-jpg), sound out of videos with [Video to MP3](/tools/video-to-mp3), and clips to animations with [Video to GIF](/tools/video-to-gif).',
          'CloudConvert handles far more formats than a browser can, including office documents, e-books, CAD files and professional video codecs, so it remains the right tool for many jobs. A good rule of thumb: private file in a common format, convert it locally; unusual format and nothing sensitive, an established service like CloudConvert is fine.',
        ],
      },
      {
        h: 'How to check any converter yourself',
        p: [
          'Whatever a site says, you can see whether it uploads. Open your browser’s network panel, add a file and watch for an outgoing request the size of your file; or load the page, switch on airplane mode and try it. Our guide [Does this website upload my files?](/guides/does-this-website-upload-my-files) walks through both checks in five minutes.',
        ],
      },
    ],
    faq: [
      { q: 'Is CloudConvert legit?', a: 'Yes. It is run by Lunaweb GmbH in Munich, Germany, has been operating for years, publishes its security practices and holds ISO 27001 certification.' },
      { q: 'How long does CloudConvert keep my files?', a: 'According to its privacy policy, until you delete them with the × button, and automatically after 24 hours at the latest.' },
      { q: 'Can CloudConvert staff see my files?', a: 'Its security page says conversions run in isolated containers and that staff cannot technically access your files; for support cases it asks you to send files manually.' },
      { q: 'Is there a way to convert without uploading anything?', a: 'Yes, for common formats. Tools that run in the browser, such as Stayput’s image, audio and video converters, process the file on your device. You can confirm it with airplane mode: they keep working offline.' },
    ],
  },
  {
    slug: 'is-freeconvert-safe',
    title: 'Is FreeConvert Safe? Its File Policy Explained, and a No-Upload Option',
    description: 'FreeConvert stores uploads on AWS in Ireland and deletes them after 8 hours. What that means for private files, and how to convert common formats without uploading.',
    heading: 'Is FreeConvert safe?',
    dek: 'FreeConvert is a legitimate service with a clear deletion policy. Whether it is safe for a particular file depends on whether that file should be uploaded anywhere.',
    keywords: ['is freeconvert safe', 'freeconvert safe', 'is freeconvert.com safe', 'freeconvert privacy', 'is freeconvert legit', 'freeconvert virus'],
    updated: '2026-09-29',
    tools: ['convert-image', 'compress-image', 'video-to-gif', 'video-to-mp3'],
    sections: [
      {
        h: 'The short answer',
        p: [
          'FreeConvert.com is a real, widely used converter, owned by TRMedia Inc., a Canadian software company. Files you convert there are not malware by virtue of passing through it, and its privacy policy sets out a clear retention period. For everyday files it is a reasonable choice.',
          'Like every upload-based converter, it works by sending your file to its servers. So the practical question is not whether FreeConvert is trustworthy in general, but whether the file in front of you is one you are comfortable storing on a third party’s cloud for a few hours.',
        ],
      },
      {
        h: 'What FreeConvert’s policy says',
        p: ['From FreeConvert’s privacy policy and about page, as checked on 29 September 2026:'],
        list: [
          '**Deletion.** Uploaded files are automatically and permanently deleted after 8 hours, and you can delete them yourself sooner.',
          '**Storage.** Files are stored with Amazon Web Services in Ireland.',
          '**Access.** The company says it does not access or view your files without your written consent, unless legally required, and does not sell or share them. You keep ownership of your files.',
          '**Encryption.** Communication between your device and its systems is encrypted with SSL/TLS.',
          '**Analytics.** The site uses Google Analytics, Sentry and similar services to measure use and errors; the policy says these do not collect your file contents.',
        ],
      },
      {
        h: 'Where the risk actually sits',
        p: [
          'An eight-hour window on a major cloud provider is a normal design for a free converter. The exposure is not a secret flaw; it is the upload itself. During that window your document exists outside your control, under Canadian and EU-hosted terms, and deletion is something you trust rather than verify.',
          'FreeConvert is also an ad-supported site. Ads are not a file risk, but they are where people sometimes click the wrong download button. Use the button inside the conversion result, not a large button in an ad slot.',
        ],
      },
      {
        h: 'Converting without uploading',
        p: [
          'For the formats people convert most, a browser can do the work locally. Stayput’s tools run inside the page: [convert images](/tools/convert-image) between JPG, PNG, WebP, HEIC, AVIF, TIFF and GIF, [compress images](/tools/compress-image), turn clips into GIFs with [Video to GIF](/tools/video-to-gif), and pull audio out of video with [Video to MP3](/tools/video-to-mp3). Nothing is sent to a server, there are no file size caps from a pricing plan, and the pages keep working with the network switched off.',
          'FreeConvert covers many more formats, such as documents, e-books and archives, and adds features like cloud imports. Choose by the file: sensitive and common, stay local; obscure and harmless, an upload service is the practical option.',
        ],
      },
      {
        h: 'Verify, don’t trust',
        p: [
          'Any site can say “your files are safe”. Only a network check shows where a file goes. Our guide [Does this website upload my files?](/guides/does-this-website-upload-my-files) shows how to confirm it in your browser in a few minutes, on FreeConvert, on Stayput, or anywhere else.',
        ],
      },
    ],
    faq: [
      { q: 'Is FreeConvert legit?', a: 'Yes. It is operated by TRMedia Inc., a Canadian company, and publishes a privacy policy with a fixed deletion period.' },
      { q: 'How long does FreeConvert keep my files?', a: 'Its privacy policy says uploaded files are deleted automatically after 8 hours, and you can delete them manually before then.' },
      { q: 'Where are FreeConvert files stored?', a: 'On Amazon Web Services in Ireland, according to its privacy policy.' },
      { q: 'Can I convert a file without uploading it?', a: 'Yes, for common image, audio and video formats. Browser-based tools like Stayput process the file on your own device; switch on airplane mode after the page loads and they still work.' },
    ],
  },
  {
    slug: 'is-ilovepdf-safe',
    title: 'Is iLovePDF Safe? How It Handles Your PDFs, and How to Keep Them Local',
    description: 'iLovePDF is a Barcelona-based, ISO 27001 certified PDF service that deletes files within two hours. What that covers, and how to edit PDFs without uploading.',
    heading: 'Is iLovePDF safe?',
    dek: 'iLovePDF is an established European service with good published practices. For confidential PDFs, the safer question is whether they need to be uploaded at all.',
    keywords: ['is ilovepdf safe', 'ilovepdf safe', 'is ilovepdf legit', 'ilovepdf privacy', 'ilovepdf security', 'ilovepdf alternative'],
    updated: '2026-09-29',
    tools: ['merge-pdf', 'split-pdf', 'compress-pdf', 'sign-pdf'],
    sections: [
      {
        h: 'The short answer',
        p: [
          'iLovePDF is one of the most popular PDF websites, run by a company based in Barcelona, Spain. It is legitimate, holds ISO/IEC 27001 certification and operates under the EU’s GDPR. For ordinary PDFs it is a sensible choice.',
          'Its tools work by uploading your PDF to its servers, processing it there and handing the result back. That means the document spends up to two hours outside your control. For payslips, bank statements, identity documents, medical or legal files, you may prefer tools that never send the file anywhere.',
        ],
      },
      {
        h: 'What iLovePDF says it does with your PDFs',
        p: ['From iLovePDF’s security policy and FAQ, as checked on 29 September 2026:'],
        list: [
          '**Deletion.** Processed files are automatically and permanently deleted within two hours; you can also delete them from the download screen straight away.',
          '**Signatures.** Documents signed through its e-signature service are kept for up to five years, for legal compliance.',
          '**Encryption.** Data is protected with HTTPS in transit, and the company says it is also encrypted at rest.',
          '**Certification and law.** ISO/IEC 27001 certified, GDPR compliant, and a Europe-based company.',
          '**Offline option.** iLovePDF Desktop for Windows and Mac can process files offline, on your own computer.',
        ],
      },
      {
        h: 'What that means in practice',
        p: [
          'Two-hour deletion and a certified security programme are good practice for a web PDF service. The limit is that deletion and access controls are promises about a server you cannot inspect. That is true of every upload-based tool, not a criticism of iLovePDF in particular.',
          'Many workplaces and professions set the rule for you: client files, HR records and patient data may not be uploaded to unapproved third-party services, however reputable. If that applies to you, an offline or in-browser tool is the way to stay within policy.',
        ],
      },
      {
        h: 'Merge, split and compress PDFs without uploading',
        p: [
          'Stayput’s PDF tools run entirely in your browser tab. [Merge PDF](/tools/merge-pdf) joins files in the order you choose, [Split PDF](/tools/split-pdf) extracts pages or splits every page, [Compress PDF](/tools/compress-pdf) shrinks scanned documents, and [Sign PDF](/tools/sign-pdf) places a drawn or typed signature. The PDF is read from your disk and the result is written back; there is no upload, no account and no daily limit.',
          'iLovePDF offers a wider set of tools, such as Office conversion, OCR, and legally binding e-signature workflows. If you need those, its desktop app keeps files on your machine; for the common jobs, a browser tool does the same without installing anything.',
        ],
      },
      {
        h: 'Check it yourself',
        p: [
          'You can verify where your PDF goes on any site with the browser’s network panel or a quick airplane-mode test. [Our five-minute guide](/guides/does-this-website-upload-my-files) shows how, and [Is it safe to merge PDFs online?](/guides/is-it-safe-to-merge-pdfs-online) covers the general risks of uploading documents.',
        ],
      },
    ],
    faq: [
      { q: 'Is iLovePDF legit?', a: 'Yes. It is an established service run from Barcelona, Spain, with ISO/IEC 27001 certification and GDPR compliance.' },
      { q: 'How long does iLovePDF keep my files?', a: 'Its security policy says processed files are deleted automatically within two hours. Documents signed with its e-signature service are kept for up to five years.' },
      { q: 'Does iLovePDF have an offline version?', a: 'Yes. iLovePDF Desktop for Windows and Mac works offline. Browser tools like Stayput’s are another option that needs no installation.' },
      { q: 'How can I merge PDFs without uploading them?', a: 'Use a tool that runs in the browser. Stayput’s Merge PDF joins files inside the page; after it loads, it keeps working with the network switched off.' },
    ],
  },
  {
    slug: 'is-smallpdf-safe',
    title: 'Is Smallpdf Safe? File Retention, Storage and a No-Upload Option',
    description: 'Smallpdf deletes uploads after one hour and keeps shared files for 14 days. What that means for private files, and how to edit PDFs without uploading.',
    heading: 'Is Smallpdf safe?',
    dek: 'Smallpdf is a reputable Swiss company with ISO 27001 certification. What changes the answer for you is which of its storage rules applies to your file.',
    keywords: ['is smallpdf safe', 'smallpdf safe', 'is smallpdf legit', 'smallpdf privacy', 'smallpdf security', 'smallpdf alternative'],
    updated: '2026-09-29',
    tools: ['compress-pdf', 'merge-pdf', 'pdf-to-word', 'sign-pdf'],
    sections: [
      {
        h: 'The short answer',
        p: [
          'Smallpdf is a large, established PDF service run by Smallpdf AG in Zurich, Switzerland. It holds ISO 27001 certification and publishes clear retention rules. For everyday PDFs, it is a legitimate and reasonable choice.',
          'Like other web PDF services it processes files on its servers, and how long your file stays there depends on what you do with it. Knowing those rules, and knowing that you can avoid the upload entirely for common tasks, is what makes the answer useful.',
        ],
      },
      {
        h: 'Smallpdf’s three retention rules',
        p: ['From Smallpdf’s own help and trust pages, as checked on 29 September 2026:'],
        list: [
          '**One hour** for ordinary processing: an uploaded file is deleted automatically an hour after processing.',
          '**14 days** if you share the result by email or link, or send it for signature with its e-sign feature.',
          '**Until you delete it** if you have an account and use document storage, which can be turned off in your settings.',
        ],
        after: ['Transfers use TLS encryption, and the company is ISO 27001 certified.'],
      },
      {
        h: 'Reading those rules for your file',
        p: [
          'The one-hour window is short, and that is a well-designed default. The account storage option is the one to watch: it is convenient, but it means your documents live in a cloud account, protected by your password, until you remove them. If you signed up to try a feature, check whether storage is on.',
          'The general caveat is the same for every upload service: deletion and access controls are commitments about a server you cannot see. For files your job, a client agreement or health privacy law says must stay under your control, choose a tool that does not upload.',
        ],
      },
      {
        h: 'Common PDF jobs without uploading',
        p: [
          'Stayput’s PDF tools run in your browser, so the PDF stays on your device: [Compress PDF](/tools/compress-pdf) for oversized scans, [Merge PDF](/tools/merge-pdf) to combine documents, [PDF to Word](/tools/pdf-to-word) to get editable text into a .docx, and [Sign PDF](/tools/sign-pdf) to add a signature and date. There is no account and no storage to switch off, because nothing is ever stored.',
          'Smallpdf does things a browser tool cannot, including OCR-heavy conversions, team workspaces and e-signature requests with audit trails. If you rely on those, its retention settings are worth a two-minute review; for one-off edits of private documents, local tools avoid the question.',
        ],
      },
      {
        h: 'How to see where a file goes',
        p: [
          'You do not have to take any site’s word, including ours. [This guide](/guides/does-this-website-upload-my-files) shows how to watch the browser’s network panel for an upload, and how the airplane-mode test tells you in seconds whether a tool works locally.',
        ],
      },
    ],
    faq: [
      { q: 'Is Smallpdf legit?', a: 'Yes. It is operated by Smallpdf AG in Zurich, Switzerland, is ISO 27001 certified, and is one of the most widely used PDF services.' },
      { q: 'How long does Smallpdf keep my files?', a: 'One hour after processing by default; 14 days if you share the file or send it for e-signature; and indefinitely if you store it in an account, until you delete it or turn storage off.' },
      { q: 'How do I stop Smallpdf storing my documents?', a: 'Signed-in users can turn off document storage in their Smallpdf settings, and delete files already stored there.' },
      { q: 'Can I compress a PDF without uploading it?', a: 'Yes. Stayput’s Compress PDF runs inside your browser tab, so the PDF never leaves your device. It keeps working with the network off once the page has loaded.' },
    ],
  },
  {
    slug: 'is-ezgif-safe',
    title: 'Is Ezgif Safe? What Happens to Your Uploads, and a No-Upload GIF Maker',
    description: 'Ezgif is a long-running GIF editor from Latvia that deletes uploads an hour after last use. What its policy covers, and how to make GIFs without uploading.',
    heading: 'Is ezgif safe?',
    dek: 'Ezgif is a legitimate, popular GIF tool with a short deletion window. The file you are about to drop in decides whether uploading it is fine.',
    keywords: ['is ezgif safe', 'ezgif safe', 'is ezgif legit', 'is ezgif.com safe', 'ezgif privacy', 'ezgif virus', 'ezgif alternative'],
    updated: '2026-09-29',
    tools: ['video-to-gif', 'gif-to-mp4', 'crop-image', 'compress-image'],
    sections: [
      {
        h: 'The short answer',
        p: [
          'Yes, in the ordinary sense. Ezgif.com has been one of the go-to GIF editors for years, and its about page says it is developed and hosted by Open Idea, a small company in Latvia. Using it does not put malware on your computer, and it states a short retention period for the files you give it.',
          'Every ezgif tool works on its servers: the video or image you choose is uploaded, edited there, and the result is shown back to you. So for a meme or a game clip there is little to think about. For a screen recording that shows your inbox, a video of your children, or anything from work, the useful question is whether that file should be uploaded at all.',
        ],
      },
      {
        h: 'What ezgif’s privacy page says',
        p: ['From ezgif’s privacy and about pages, as checked on 29 September 2026:'],
        list: [
          '**Deletion.** Uploaded files stay on its servers for up to one hour after they were last used with its tools, then are deleted automatically.',
          '**Visibility.** File names are not listed publicly.',
          '**Cookies and ads.** The site uses cookies to analyse traffic with anonymised, aggregated data, to remember preferences and to serve advertisements.',
          '**Operator.** Developed and hosted by Open Idea, Latvia. The site is served over HTTPS.',
        ],
        after: ['The privacy page does not describe certifications, encryption at rest or who else can reach the servers, which is typical for a small free tool rather than a warning sign.'],
      },
      {
        h: 'The two real risks',
        p: [
          'The first is the upload itself. A screen capture or phone video can hold more than you notice: notifications, names, addresses on envelopes, a location in the background. Once uploaded, it sits on a server you cannot inspect until the hour-after-last-use timer runs out, and each edit you make restarts that clock.',
          'The second is the ads. Ezgif is free because it shows advertising, and on any ad-supported download site the risk is clicking a large advert styled as a download button. Save your result with the link under the output image, or by right-clicking the image itself.',
        ],
      },
      {
        h: 'Making GIFs without uploading',
        p: [
          'Modern browsers can decode video and encode GIFs on your own device. Stayput’s [Video to GIF](/tools/video-to-gif) turns MP4, MOV and WebM clips into GIFs inside the page, with trimming, size and frame-rate settings. [GIF to MP4](/tools/gif-to-mp4) goes the other way for a much smaller file, [Crop image](/tools/crop-image) trims a still, and [Compress image](/tools/compress-image) shrinks one. Nothing is sent anywhere, there are no ads next to the download, and once loaded the pages work in airplane mode.',
          'Ezgif still does more GIF-specific editing than these tools, such as frame-by-frame editing, effects and text overlays on animations. For a harmless clip it is a fine choice; for a private recording, convert it locally.',
        ],
      },
      {
        h: 'Check any GIF site yourself',
        p: [
          'Open the browser’s network panel, add your video, and watch for a request about the size of the file. Or load the page, turn off Wi-Fi and try it. [Does this website upload my files?](/guides/does-this-website-upload-my-files) walks through both tests.',
        ],
      },
    ],
    faq: [
      { q: 'Is ezgif legit?', a: 'Yes. It is a long-established free GIF editor, developed and hosted by Open Idea in Latvia according to its about page.' },
      { q: 'How long does ezgif keep my files?', a: 'Its privacy page says uploads are kept up to one hour after they were last used with its tools and then deleted automatically.' },
      { q: 'Can ezgif give my computer a virus?', a: 'Converting a file there does not. The usual risk on ad-supported sites is clicking an advert that looks like a download button, so save the result from the output itself.' },
      { q: 'How do I make a GIF without uploading the video?', a: 'Use a converter that runs in the browser. Stayput’s Video to GIF encodes the GIF on your device; switch off the network after the page loads and it still works.' },
    ],
  },
  {
    slug: 'is-pdf24-safe',
    title: 'Is PDF24 Safe? Online Tools vs PDF24 Creator, and a No-Install Option',
    description: 'PDF24 is run by Geek Software GmbH in Germany and deletes online uploads after one hour. How its versions differ, and how to edit PDFs without uploading.',
    heading: 'Is PDF24 safe?',
    dek: 'PDF24 is a long-standing German project, and it tells you itself that its offline app is the more private option. Here is how to choose between the two, and a third way.',
    keywords: ['is pdf24 safe', 'pdf24 safe', 'is pdf24 legit', 'is pdf24 tools safe', 'pdf24 privacy', 'pdf24 creator safe'],
    updated: '2026-09-29',
    tools: ['merge-pdf', 'compress-pdf', 'split-pdf', 'unlock-pdf'],
    sections: [
      {
        h: 'The short answer',
        p: [
          'PDF24 is legitimate. It is operated by Geek Software GmbH, a German company, which says it has been developing the PDF24 tools since 2006. Both its online tools and its PDF24 Creator desktop app are free.',
          'What makes PDF24 unusual is that it answers the privacy question on its own homepage: the online tools process files on its servers, and if you want to be more secure, it recommends PDF24 Creator, where files stay on your PC. So which PDF24 you use matters more than whether PDF24 is safe.',
        ],
      },
      {
        h: 'What PDF24 says about the online tools',
        p: ['From tools.pdf24.org and the Geek Software privacy policy, as checked on 29 September 2026:'],
        list: [
          '**Processing.** The online tools run on PDF24’s own servers, not in your browser.',
          '**Deletion.** Uploaded files are deleted from the server automatically after one hour, and you can remove them sooner yourself.',
          '**Encryption.** File transfers to its servers are encrypted.',
          '**Law.** As a German company it processes data under the GDPR.',
          '**Offline option.** PDF24 Creator for Windows provides the same tools offline, with files kept on your computer.',
        ],
      },
      {
        h: 'Choosing between online, desktop and in-browser',
        p: [
          'The online tools are convenient and, for ordinary PDFs, the one-hour deletion rule is a sensible design. The trade-off is the same as any upload service: for that hour your document sits on a server you cannot see into.',
          'PDF24 Creator removes the upload, but it is Windows software you install and keep updated, which is not an option on a Mac, a Chromebook, a phone or a locked-down work laptop. Tools that run inside a web page sit between the two: nothing to install, and nothing uploaded.',
        ],
      },
      {
        h: 'PDF jobs in the browser, without uploading',
        p: [
          'Stayput’s PDF tools read the file from your disk into the page and write the result straight back. [Merge PDF](/tools/merge-pdf) and [Split PDF](/tools/split-pdf) rearrange documents, [Compress PDF](/tools/compress-pdf) shrinks scans for email, and [Unlock PDF](/tools/unlock-pdf) removes a password you already know. They work on any device with a modern browser and keep working with the network switched off.',
          'PDF24 has a far larger toolbox, including Office conversions, OCR and a virtual PDF printer in Creator. If you are on Windows and need those, Creator is a good private choice; for quick jobs on any other device, a browser tool avoids both the upload and the install.',
        ],
      },
      {
        h: 'See for yourself where the file goes',
        p: [
          'You can confirm PDF24’s own description, or ours, in a minute: watch the network panel while adding a PDF, or try the page in airplane mode. [This guide](/guides/does-this-website-upload-my-files) shows how, and [Is it safe to merge PDFs online?](/guides/is-it-safe-to-merge-pdfs-online) covers the wider risks.',
        ],
      },
    ],
    faq: [
      { q: 'Is PDF24 legit?', a: 'Yes. PDF24 is operated by Geek Software GmbH, a German company, and has been developed since 2006.' },
      { q: 'How long does PDF24 keep uploaded files?', a: 'Its site says files uploaded to the online tools are deleted automatically after one hour, and can be removed manually before then.' },
      { q: 'Is PDF24 Creator safer than the online tools?', a: 'PDF24 itself says so: Creator processes files on your own PC, so nothing is uploaded. It is Windows software, though.' },
      { q: 'How can I edit a PDF privately on a Mac or phone?', a: 'Use a tool that works in the browser without uploading, such as Stayput’s PDF tools. After the page loads, they keep working offline.' },
    ],
  },
  {
    slug: 'is-convertio-safe',
    title: 'Is Convertio Safe? Its File Deletion Rules, and Converting Without Uploading',
    description: 'Convertio is run from Cyprus, keeps files in the EU and deletes outputs within 24 hours. What that covers, and how to convert common formats locally.',
    heading: 'Is Convertio safe?',
    dek: 'Convertio is a well-known converter with a published deletion policy. For private files, the safer choice is a converter that never receives them.',
    keywords: ['is convertio safe', 'convertio safe', 'is convertio legit', 'is convertio.co safe', 'convertio privacy', 'convertio virus'],
    updated: '2026-09-29',
    tools: ['convert-image', 'heic-to-jpg', 'video-to-mp3', 'image-to-pdf'],
    sections: [
      {
        h: 'The short answer',
        p: [
          'Convertio.co is a legitimate and widely used converter. Its terms name the operator as Convertio Limited, a company registered in Limassol, Cyprus, and its privacy page sets out how quickly files are removed. For a font, an e-book or an unusual audio format with nothing personal in it, it is a practical option.',
          'It converts on its servers, which means uploading. Whether that is safe for you depends on the file, not the brand: a vacation photo and a scanned tax return deserve different answers.',
        ],
      },
      {
        h: 'Convertio’s stated practices',
        p: ['From Convertio’s privacy page and terms, as checked on 29 September 2026:'],
        list: [
          '**Input files** are removed right after conversion.',
          '**Converted files** are deleted when you click the × next to them, or automatically after 24 hours.',
          '**Access.** The company says it does not read, look into or copy your files.',
          '**Location.** Files are kept in the European Union.',
          '**Transport.** Connections use a secure channel with HSTS enabled.',
          '**Ads and analytics.** The site uses cookies, Google Analytics and Google AdSense, and third-party advertisers may use their own tracking.',
        ],
      },
      {
        h: 'Putting that in context',
        p: [
          'Deleting inputs immediately and outputs within a day is a reasonable policy for a free converter, and keeping data in the EU brings GDPR protections. What the policy cannot remove is the period in which the converted copy exists on its servers, or the need to take deletion on trust.',
          'The advertising matters for a different reason. On ad-supported file sites, the thing to avoid is a banner designed to look like a download button. Use the Download button next to your converted file, and ignore anything asking you to install a browser extension or app to finish.',
        ],
      },
      {
        h: 'Common conversions that never leave your device',
        p: [
          'For the formats most people convert, the browser can do the job locally. Stayput’s [image converter](/tools/convert-image) handles JPG, PNG, WebP, HEIC, AVIF, TIFF and GIF; [HEIC to JPG](/tools/heic-to-jpg) fixes iPhone photos; [Image to PDF](/tools/image-to-pdf) turns photos or scans into a PDF; and [Video to MP3](/tools/video-to-mp3) extracts a soundtrack. The file is processed in the page, there are no ads, and airplane mode proves it.',
          'Convertio supports hundreds of formats that browsers cannot read, so for those a server is the only practical route. Keep it for files that would not matter if a stranger saw them.',
        ],
      },
      {
        h: 'A quick test for any converter',
        p: [
          'The network panel in your browser shows every request a page makes; an upload looks like one request roughly the size of your file. [Does this website upload my files?](/guides/does-this-website-upload-my-files) explains that check and the faster airplane-mode test.',
        ],
      },
    ],
    faq: [
      { q: 'Is Convertio legit?', a: 'Yes. It is operated by Convertio Limited, registered in Cyprus, and is one of the most used online converters.' },
      { q: 'How long does Convertio keep my files?', a: 'Its privacy page says input files are removed right after conversion and converted files are deleted when you click ×, or after 24 hours automatically.' },
      { q: 'Where does Convertio store files?', a: 'In the European Union, according to its privacy page.' },
      { q: 'How do I convert HEIC to JPG without uploading?', a: 'Use a converter that runs in the browser, such as Stayput’s HEIC to JPG. The photo is decoded and re-encoded on your device.' },
    ],
  },
  {
    slug: 'is-zamzar-safe',
    title: 'Is Zamzar Safe? Seven-Day Storage, Email Links and a Local Alternative',
    description: 'Zamzar is a UK converter that keeps free conversions for up to seven days. What that means for private files, and how to convert without uploading.',
    heading: 'Is Zamzar safe?',
    dek: 'Zamzar is one of the oldest online converters and runs without third-party ads. Its storage window is longer than most, which is the detail worth knowing.',
    keywords: ['is zamzar safe', 'zamzar safe', 'is zamzar legit', 'is zamzar.com safe', 'zamzar privacy', 'zamzar virus'],
    updated: '2026-09-29',
    tools: ['convert-image', 'compress-image', 'video-to-mp3', 'pdf-to-image'],
    sections: [
      {
        h: 'The short answer',
        p: [
          'Zamzar is legitimate. It is run by Zamzar Limited, a company registered in England, and has been converting files online since 2006. Its privacy policy was last updated in August 2026, and the site says it hosts no third-party advertising, which removes the fake-download-button problem common on free converters.',
          'The point to understand before uploading something personal is retention. Free conversions can stay on Zamzar’s systems for up to seven days, noticeably longer than services that delete within hours.',
        ],
      },
      {
        h: 'What Zamzar’s policy says',
        p: ['From Zamzar’s privacy policy, last modified 14 August 2026, as checked on 29 September 2026:'],
        list: [
          '**Free conversions.** Files you submit and their converted outputs are stored for no longer than 7 days.',
          '**Accounts.** For account holders, data is kept while the account is active; files are permanently removed 35 days after an account is deactivated.',
          '**Email.** If you give an email address, Zamzar sends links to download your converted files there.',
          '**Encryption.** Traffic to and from its servers uses TLS.',
          '**Ads and analytics.** No third-party advertising on zamzar.com; it uses Google Analytics.',
          '**Service providers.** Data is shared with vendors for server hosting and content delivery.',
        ],
      },
      {
        h: 'What a seven-day window means',
        p: [
          'A week is a design choice that makes email delivery work: the link has to stay valid until you open it. The consequence is that a copy of your file, and the converted result, may sit on a server for days, reachable by anyone who gets the download link from your inbox.',
          'For a song or a slide deck that is rarely a concern. For an ID scan, payslip or medical letter it is worth avoiding, and some workplaces forbid sending such files to unapproved services at all.',
        ],
      },
      {
        h: 'Converting on your own device instead',
        p: [
          'Stayput’s tools do the most common conversions inside your browser, so there is no copy on a server and no link to expire. Use the [image converter](/tools/convert-image) for JPG, PNG, WebP, HEIC and more, [Compress image](/tools/compress-image) to shrink photos for upload forms, [PDF to image](/tools/pdf-to-image) to turn pages into JPG or PNG, and [Video to MP3](/tools/video-to-mp3) for audio. The result downloads straight from the page.',
          'Zamzar covers many more formats and offers an API and account features. For obscure formats with nothing private inside, it remains a solid choice.',
        ],
      },
      {
        h: 'How to tell whether a site uploads',
        p: [
          'Load the converter, switch on airplane mode and try a file: server-based tools fail, local ones keep working. [Our guide](/guides/does-this-website-upload-my-files) also shows the network-panel check.',
        ],
      },
    ],
    faq: [
      { q: 'Is Zamzar legit?', a: 'Yes. It is operated by Zamzar Limited, a company registered in England, and has run online conversions since 2006.' },
      { q: 'How long does Zamzar keep my files?', a: 'Its privacy policy says free conversions are stored for no longer than 7 days. Account files are removed 35 days after the account is deactivated.' },
      { q: 'Does Zamzar have ads?', a: 'Its privacy policy says it does not host third-party advertising on zamzar.com. It does use Google Analytics.' },
      { q: 'Can I convert files without uploading them?', a: 'Yes, for common image, PDF and audio formats. Browser-based tools like Stayput’s process files on your device and work offline once loaded.' },
    ],
  },
  {
    slug: 'is-remove-bg-safe',
    title: 'Is remove.bg Safe? Uploads, AI Training and a No-Upload Option',
    description: 'remove.bg deletes uploads shortly after processing, but its policy lets account uploads train AI. What that means, and how to cut out photos locally.',
    heading: 'Is remove.bg safe?',
    dek: 'remove.bg is a legitimate Canva-owned service. Two details in its privacy policy matter more than the usual deletion promise: training and preview-only free downloads.',
    keywords: ['is remove.bg safe', 'remove.bg safe', 'is remove bg safe', 'is remove.bg legit', 'remove.bg privacy', 'remove.bg alternative no upload'],
    updated: '2026-09-29',
    tools: ['remove-background', 'make-background-transparent', 'white-background', 'blur-image'],
    sections: [
      {
        h: 'The short answer',
        p: [
          'Yes, remove.bg is legitimate and widely used. It belongs to Canva: its privacy policy names the operator as Canva Austria GmbH in Vienna, the company behind Kaleido, remove.bg, Unscreen and Designify. Using it will not harm your computer, and the policy says uploads are deleted shortly after processing.',
          'On the website every cut-out is made on its servers, so each photo is uploaded. For a product shot that is rarely a concern. For a picture of your children, a selfie or anyone who did not agree to it, two parts of the policy are worth reading before you drop the file in.',
        ],
      },
      {
        h: 'What remove.bg’s policy says',
        p: ['From the remove.bg privacy policy (last updated 16 July 2025) and pricing page, as checked on 29 September 2026:'],
        list: [
          '**Deletion.** Files are uploaded, processed, offered for download and then deleted “shortly after”. The policy gives no exact time.',
          '**AI training.** The company may analyse media uploads and related data in your account to train its algorithms, models and AI products. Separately, the site asks some users to opt in with “Contribute this image & help us make remove.bg better”.',
          '**Location.** Data is stored and processed in Europe and in any other country where the company, its affiliates or service providers have facilities. Server logs are kept for up to three months.',
          '**Analytics.** Google Analytics collects usage data through cookies.',
          '**Free vs paid.** Preview images are free on the website; each full-resolution result costs a credit.',
        ],
      },
      {
        h: 'What that means for your photos',
        p: [
          'Short-lived storage is the norm for upload tools. The training clause is the part to weigh: it covers uploads tied to an account, which is exactly where people who buy credits end up. If you would rather your family photos or client work did not feed a model, that is a reason to avoid signing in or to use a different tool.',
          'The preview limit changes the calculation too. To get a full-size cut-out for free, many people end up uploading the same photo to several sites in turn, multiplying the copies on other people’s servers.',
        ],
      },
      {
        h: 'Cutting out a photo without uploading it',
        p: [
          'Stayput’s [background remover](/tools/remove-background) runs an open segmentation model inside your browser tab. The photo is never sent anywhere, the result is at your photo’s full resolution, and there are no credits or watermark. Use [Make background transparent](/make-background-transparent) for a PNG with a see-through background, or [White background](/white-background) for marketplace-ready product shots. To hide a face instead of cutting it out, use [Blur image](/tools/blur-image).',
          'remove.bg’s own model is very good at difficult hair and busy scenes, and it offers an API, desktop apps and a Photoshop plug-in for bulk work. For a quick cut-out of a private photo, a local tool avoids the upload, the training question and the preview limit in one go.',
        ],
      },
      {
        h: 'How to check where a photo goes',
        p: [
          'Open your browser’s network panel, drop a photo into any background remover and look for an upload about the size of the file; or load the page, turn on airplane mode and try again. [Does this website upload my files?](/guides/does-this-website-upload-my-files) walks through both checks.',
        ],
      },
    ],
    faq: [
      { q: 'Is remove.bg legit?', a: 'Yes. It is a Canva brand, operated by Canva Austria GmbH in Vienna, Austria, and is one of the best-known background removers.' },
      { q: 'Does remove.bg keep my photos?', a: 'Its privacy policy says uploaded files are deleted shortly after processing, without giving an exact time. Server logs are kept for up to three months.' },
      { q: 'Does remove.bg use my photos to train AI?', a: 'Its privacy policy says it may analyse media uploads and related data in your account to train its algorithms and AI products. It also asks some users to contribute images voluntarily.' },
      { q: 'How can I remove a background without uploading the photo?', a: 'Use a tool that runs the model in your browser, such as Stayput’s background remover. After the model has downloaded once, it works with the network switched off.' },
    ],
  },
  {
    slug: 'remove-background-from-a-photo',
    title: 'How to Remove the Background From a Photo (iPhone, Android, Windows, Mac)',
    description: 'Every recent phone and computer can lift a subject out of a photo without installing anything. Here is how on iPhone, Android, Windows and Mac, and a free browser tool for full-resolution PNGs and batches.',
    heading: 'How to remove the background from a photo',
    dek: 'iPhone, Android, Windows and Mac can all do this without an app. Here is how on each, and where they fall short.',
    keywords: ['how to remove background from a photo', 'remove background from image', 'cut out background iphone', 'remove background from photo android', 'transparent background photo', 'background eraser'],
    updated: '2026-09-29',
    tools: ['remove-background', 'make-background-transparent', 'white-background', 'blur-background'],
    sections: [
      {
        h: 'What "removing the background" means',
        p: [
          'A background cutout needs two things: a mask that says which pixels are the subject and which are not, and something to put behind the subject once the rest is gone, usually nothing (transparency), white, or a blur. The masking step used to need Photoshop\'s selection tools. Phones and computers now do it with an on-device model, in one tap, for a single photo, and the browser tool below does the same for a full-size file or a batch.',
        ],
      },
      {
        h: 'On an iPhone or iPad',
        p: [
          'Open the photo, then touch and hold the subject until a glowing outline appears around it (this needs iOS 16 or later). Once the outline appears, either tap **Copy** to put just the subject, with a transparent background, on the clipboard, or drag it straight out into Messages, Notes or Mail. There is no button to save it as a PNG file directly from Photos; the fastest way to get a file is to paste the copied subject into a blank Notes page, then export or screenshot it, or use the browser tool below for a proper PNG.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'Most Pixel phones (Pixel 6 and later) and many recent Samsung Galaxy phones support the same idea: press and hold on the subject in a photo, in Google Photos or the Gallery app, until it is outlined, then tap **Copy**. On a Pixel this is also reachable through Circle to Search: hold the home gesture, circle the subject, and tap **Copy**. The result pastes as a transparent cutout, not a downloadable file, so if you need a PNG, paste it into an image editor or use the browser tool.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'Windows 11\'s Paint app has a one-click **Remove background** button: open the photo in Paint, click the button in the toolbar (it appears once your image is loaded), and Paint replaces the background with a checkered transparent pattern automatically. Save as PNG to keep the transparency; saving as JPG fills it in with white. If your version of Paint does not show the button, it needs to be updated from the Microsoft Store.',
        ],
      },
      {
        h: 'On a Mac',
        p: [
          'macOS Ventura and later can lift a subject system-wide: open the photo in Preview or Photos, right-click (or Control-click) the subject, and choose **Copy Subject**. Paste it anywhere to get a transparent cutout. In Preview you can also click and hold on the subject until it is outlined, then drag it onto the desktop to save it as a standalone PNG file, which is the quickest way to get an actual file without a third-party app.',
        ],
      },
      {
        h: 'When the built-in tools fall short',
        p: [
          'These features are made for quick, single-photo edits: they can struggle with busy backgrounds, fine hair or fur, and low-contrast edges, and none of them let you process many photos at once or choose a plain white or blurred background instead of transparency. Stayput\'s [background remover](/tools/remove-background) runs an open-source segmentation model (ISNet) inside your browser tab, so it works offline after the model loads once, keeps your photo at full resolution, and never uploads anything. Use [Make background transparent](/make-background-transparent) for a PNG, [White background](/white-background) for product photos and headshots, or [Blur background](/blur-background) for a portrait-mode look.',
        ],
      },
    ],
    faq: [
      { q: 'Which is better, my phone\'s built-in cutout or a background remover tool?', a: 'The phone feature is faster for a quick share, but it copies the subject to your clipboard rather than saving a file, and it does not offer a white or blurred background. A dedicated tool gives you a real PNG at full resolution and more background options.' },
      { q: 'Do I need Photoshop to remove a background?', a: 'No. iPhone, Android, Windows and Mac all have a built-in way to lift a subject, and a browser-based tool can produce a full PNG without any software installed.' },
      { q: 'Why does the cutout have rough edges around hair?', a: 'Fine hair and fur are the hardest case for any segmentation model, phone or browser. Zooming in and using a tool with a higher-resolution model, or manually touching up the edge afterward, usually helps.' },
      { q: 'Can I remove the background from several photos at once?', a: 'Phone features work one photo at a time. A browser tool that processes files locally can be run on each photo in a batch without waiting on uploads or per-image limits.' },
    ],
  },
  {
    slug: 'how-to-make-a-gif-from-a-video',
    title: 'How to Make a GIF From a Video (iPhone, Android, Windows, Mac)',
    description: 'A short clip is often more useful as a GIF than a video: it loops, plays without a tap, and works where video does not. Here is how to make one on each platform, and a browser tool with no upload or size cap.',
    heading: 'How to make a GIF from a video',
    dek: 'A GIF loops and plays anywhere without a tap. Here is how to make one on each platform, and a browser tool for when there is no built-in way.',
    keywords: ['how to make a gif from a video', 'convert video to gif', 'mp4 to gif', 'turn video into gif iphone', 'make a gif from a video clip'],
    updated: '2026-09-29',
    tools: ['video-to-gif', 'mp4-to-gif', 'mov-to-gif'],
    sections: [
      {
        h: 'Why a GIF instead of the video',
        p: [
          'A GIF has no play button, no sound and no controls: it loads and loops immediately in a chat, a forum post, a README or a slide, even on sites that block autoplaying video. The trade-off is file size and quality, since a GIF stores far less information per frame than a video codec does. Trim the clip to the part that matters first, since every extra second adds to the size before you even convert it.',
        ],
      },
      {
        h: 'On an iPhone or iPad',
        p: [
          'The Shortcuts app can do this without any other software: open Shortcuts, tap the **+** to create a new shortcut, add the **Select Photos** action followed by the **Convert Media** action, set its format to **GIF**, then tap the play button and pick your video. The result saves to Photos as an actual GIF file. It is a few steps to set up once, but after that it is a one-tap shortcut you can reuse or add to the share sheet.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'Android and Google Photos do not have a built-in video-to-GIF export. Google Photos can trim a clip and make a looping "Cinemagraph" style Motion Photo, but that stays inside Google Photos and is not a standalone GIF file you can post elsewhere. For an actual GIF file, use a browser tool or a dedicated GIF-maker app.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'Windows has no built-in converter for turning an existing video file into a GIF. The free, open-source **ScreenToGif** app can do it (its "Video to GIF" import handles this even though the app is mainly built for screen recording), but it is a separate download and install. For a one-off conversion, a browser tool avoids installing anything.',
        ],
      },
      {
        h: 'On a Mac',
        p: [
          'macOS can export a **Live Photo** as a GIF (right-click it in Photos and choose "Save as GIF"), but that only works for Live Photos, not for a regular MOV or MP4 you already have. Converting an arbitrary video file to GIF on a Mac otherwise needs QuickTime Player plus a command-line tool such as ffmpeg, or a browser tool.',
        ],
      },
      {
        h: 'Converting without installing anything',
        p: [
          'Stayput\'s [video to GIF](/tools/video-to-gif) converter reads the video and writes the GIF entirely in your browser tab, so there is no upload and no file-size cap. It handles [MP4](/mp4-to-gif), [MOV](/mov-to-gif) straight from an iPhone, and WebM. For a smaller file, lower the frame rate and the output width before converting; a GIF at 10-12 fps and 480px wide is usually plenty for chat and forum posts, and cuts the size dramatically compared to the source resolution and frame rate.',
        ],
      },
    ],
    faq: [
      { q: 'Why is my GIF so much bigger than the video it came from?', a: 'GIF compresses far less efficiently than video codecs like H.264. Trimming the clip, lowering the frame rate, and reducing the width before converting are the three levers that bring the size down.' },
      { q: 'Can I make a GIF without sound?', a: 'Yes, and you have to: the GIF format has no audio track at all, so any conversion drops the sound automatically.' },
      { q: 'What is the best frame rate for a GIF?', a: '10-15 frames per second looks smooth enough for most clips and keeps the file much smaller than matching the video\'s original 24-60 fps.' },
      { q: 'Does converting a video to GIF upload it anywhere?', a: 'Not with a browser-based converter. Stayput\'s reads and writes the file in your tab using WebCodecs, so the video never leaves your device.' },
    ],
  },
  {
    slug: 'how-to-compress-a-video-without-losing-quality',
    title: 'How to Compress a Video Without Losing Quality',
    description: 'Phone video is bitrate, not just resolution, and most of that bitrate is bigger than it needs to be. Here is what actually controls the size-to-quality trade-off, how to compress on each platform, and a browser tool with size targets.',
    heading: 'How to compress a video without losing quality',
    dek: 'Most phone video is recorded at a far higher bitrate than the screen needs. Here is what to change, and what actually loses quality.',
    keywords: ['how to compress a video without losing quality', 'compress video', 'reduce video file size', 'shrink video file', 'video compressor'],
    updated: '2026-09-29',
    tools: ['compress-video', 'compress-video-for-discord', 'compress-video-for-email'],
    sections: [
      {
        h: 'Why phone video files are so big',
        p: [
          'A phone records 1080p video at roughly 16 megabits per second and 4K at far more, because it is optimized to look good straight out of the camera, not to be small. A one-minute clip easily passes 100 MB at that rate. Almost none of that bitrate is visible on a phone or laptop screen: encoding the same footage at a quarter or a fifth of the bitrate is very hard to tell apart from the original on anything but a large, calibrated display.',
        ],
      },
      {
        h: 'What actually controls the trade-off',
        p: [
          'Three settings decide the result: **bitrate** (how much data per second of video; lower it and the file shrinks roughly proportionally), **resolution** (a 1080p clip has four times the pixels of 540p, so downscaling saves a lot before any perceptible loss), and **codec** (H.264 is universal, but H.265/AV1 fit the same quality into a smaller file if the destination supports them). Cutting bitrate too far causes blocky compression artefacts in fast motion; cutting resolution first, then bitrate, usually looks better than dropping bitrate alone.',
        ],
      },
      {
        h: 'On an iPhone',
        p: [
          'There is no in-app "compress" button, but Mail does it for you: attach the video in Mail and tap the size options that appear (Small, Medium, Large, Actual Size) before sending — Small and Medium re-encode the video at a lower bitrate and resolution. To shrink files you record from now on, go to Settings, Camera, Record Video, and pick a lower resolution or frame rate; this does not affect videos already on your phone.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'Android has no built-in compressor either. Sending a video through WhatsApp, Google Messages or similar apps re-encodes it at a lower bitrate automatically, which works as a rough compressor if you do not need the original attached anywhere.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'Clipchamp comes preinstalled with Windows 11: open it, import the clip, and use the export step\'s quality presets (720p or 1080p, and a bitrate/quality slider) to control the size before saving.',
        ],
      },
      {
        h: 'On a Mac',
        p: [
          'QuickTime Player can re-export at a lower resolution: open the file, then File, **Export As**, and choose 1080p, 720p or 480p instead of the original size. This reduces resolution, not bitrate directly, but it is a real, built-in way to shrink a file.',
        ],
      },
      {
        h: 'Compressing to an exact target',
        p: [
          'Stayput\'s [video compressor](/tools/compress-video) re-encodes the file in your browser tab and lets you pick a quality level or a target file size. The [Discord preset](/compress-video-for-discord) aims for Discord\'s 10 MB upload limit, and the [email preset](/compress-video-for-email) aims for 25 MB, both re-encoding automatically until the file fits. Nothing is uploaded to do this: the encoding runs on your device.',
        ],
      },
    ],
    faq: [
      { q: 'Does lowering the resolution always look worse?', a: 'On a small screen (phone, chat preview) it is often invisible, since the display cannot show the extra detail anyway. It matters more if the video will be viewed full-screen on a large display.' },
      { q: 'Should I lower bitrate or resolution first?', a: 'Resolution first for a big size cut with the least visible loss, then bitrate to fine-tune. Cutting bitrate alone on a high-resolution video tends to show blocky artefacts sooner.' },
      { q: 'Why does a re-compressed video sometimes look worse than the original even at a similar size?', a: 'Re-encoding an already-compressed video is lossy on top of lossy. Compressing straight from the original file, rather than a copy that has already been re-saved once, keeps more quality at the same target size.' },
      { q: 'What is a reasonable size for a 30-second phone video?', a: 'At a bitrate most people cannot distinguish from the original, a 30-second 1080p clip typically compresses to somewhere between 3 and 8 MB, well under most upload limits.' },
    ],
  },
  {
    slug: 'how-to-trim-a-video-without-an-app',
    title: 'How to Trim a Video Without Installing an App (iPhone, Android, Windows, Mac)',
    description: 'Every major phone and computer can cut the start and end off a video without installing anything. Here is how on each platform, and a browser tool for trimming without re-encoding.',
    heading: 'How to trim a video without installing an app',
    dek: 'iPhone, Android, Windows and Mac can all trim a video with what is already installed. Here is how on each.',
    keywords: ['how to trim a video without an app', 'trim video online', 'cut video without app', 'trim video iphone', 'cut a video windows'],
    updated: '2026-09-29',
    tools: ['trim-video', 'cut-video', 'trim-mp4'],
    sections: [
      {
        h: 'What "trim" means here',
        p: [
          'Trimming removes footage from the start and/or the end of a clip without touching what is in between, as opposed to cutting a piece out of the middle. Every platform below can do at least this much without installing anything new.',
        ],
      },
      {
        h: 'On an iPhone or iPad',
        p: [
          'Open the video in Photos and tap **Edit**. Drag the yellow handles at either end of the filmstrip at the bottom of the screen to the new start and end points, then tap the checkmark. Choose **Save as New Clip** to keep the original as well, or **Save Video** to overwrite it.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'In Google Photos, open the video, tap the pencil (Edit) icon, and drag the trim handles under the preview to the new start and end points, then tap **Save copy**. Samsung Gallery has the same trim handles under its own video editor.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'Windows 11 hands video editing to Clipchamp, which comes preinstalled: import the clip onto the timeline, drag the playhead to a cut point, use the split tool, delete the piece you do not want, and export. It is more steps than a single trim gesture, but it needs no extra download.',
        ],
      },
      {
        h: 'On a Mac',
        p: [
          'Open the video in QuickTime Player and press **Cmd+T** (or Edit, Trim). Drag the yellow handles on the filmstrip to the new start and end, then File, **Export As**, to save the trimmed clip as a new file.',
        ],
      },
      {
        h: 'Trimming without re-encoding',
        p: [
          'Every option above re-encodes the video during export, which takes time and can lose a little quality even at "the same" settings. Stayput\'s [trim video](/tools/trim-video) tool trims in your browser tab; the [Trim MP4](/trim-mp4) preset cuts at keyframes without re-encoding when the cut points allow it, which is close to instant and keeps the original quality exactly. Nothing is uploaded either way, so a private clip stays on your device.',
        ],
      },
    ],
    faq: [
      { q: 'Can I cut a piece out of the middle of a video, not just the ends?', a: 'That is a split-and-delete edit rather than a trim. Clipchamp on Windows and iMovie on Mac can do this; Stayput\'s trim tool currently handles start-and-end trimming.' },
      { q: 'Does trimming a video lose quality?', a: 'Re-encoding during trim can lose a small, usually invisible amount. Trimming at keyframes without re-encoding, like the Trim MP4 preset, keeps the exact original quality.' },
      { q: 'Why does my phone\'s trim take a moment to save?', a: 'The phone is re-encoding the clip from the new start point, which takes roughly as long as the clip itself, longer for higher resolutions.' },
      { q: 'Can I trim a video on my phone without uploading it anywhere?', a: 'Yes. The built-in Photos and Google Photos trimmers, and a browser tool that runs locally, all keep the file on your device.' },
    ],
  },
  {
    slug: 'how-to-rotate-a-sideways-video',
    title: 'How to Rotate a Sideways Video (iPhone, Android, Windows, Mac)',
    description: 'A video that plays sideways or upside down almost always has a fixable rotation flag, not damaged footage. Here is how to fix it on each platform, and a browser tool when the flag itself is the problem.',
    heading: 'How to rotate a sideways video',
    dek: 'Almost always a fixable rotation flag, not broken footage. Here is how to fix it on each platform.',
    keywords: ['how to rotate a sideways video', 'video is sideways how to fix', 'rotate video 90 degrees', 'flip video upright', 'video playing upside down'],
    updated: '2026-09-29',
    tools: ['rotate-video'],
    sections: [
      {
        h: 'Why a video ends up sideways',
        p: [
          'A phone records video in whatever orientation it was held, then writes a rotation flag into the file telling players to display it upright. Most apps read that flag correctly; some players, older software and a few messaging apps ignore it and show the raw, sideways frame instead. Re-encoding the video with a real 90-degree turn, rather than relying on the flag, fixes it everywhere.',
        ],
      },
      {
        h: 'On an iPhone or iPad',
        p: [
          'Open the video in Photos, tap **Edit**, then use the crop tool: tap the rotate icon (a square with a curved arrow) at the bottom-left of the crop screen to turn it 90 degrees, tapping again for more, then **Done**. This saves a real rotation, not just a flag.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'In Google Photos, open the video, tap **Edit**, open the crop/rotate tool, and tap the rotate icon until the video is upright, then save. Samsung Gallery\'s editor has the same rotate control.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'Clipchamp (preinstalled on Windows 11) has a rotate button on the clip once it is on the timeline: import the video, select it, and use the rotate control in the properties panel, then export.',
        ],
      },
      {
        h: 'On a Mac',
        p: [
          'QuickTime Player can do this directly: open the video and use **Edit, Rotate Left** or **Rotate Right** from the menu (or Cmd-R), then File, **Export As**, to save the corrected version.',
        ],
      },
      {
        h: 'When the fix does not stick',
        p: [
          'Some tools only change the rotation flag rather than the pixels, so the video looks right in one app and sideways again in another. Stayput\'s [rotate video](/tools/rotate-video) tool re-encodes the actual frames in your browser tab, so the fix holds everywhere the file is played, including sites and apps that ignore rotation metadata. It also flips a video horizontally for a mirrored recording. Nothing is uploaded: the rotation happens on your device.',
        ],
      },
    ],
    faq: [
      { q: 'Why does my video look fine on my phone but sideways when I send it?', a: 'Your phone\'s player reads the rotation flag correctly; the app or device you sent it to may not. Re-encoding the rotation into the actual frames fixes it everywhere.' },
      { q: 'Does rotating a video re-encode and lose quality?', a: 'Rotating by 90 or 180 degrees does not need to resample the image content, only reorder it, so a good encoder keeps quality very close to the original at a matching bitrate.' },
      { q: 'Can I flip a video like a mirror, not just rotate it?', a: 'Yes, a horizontal flip is a separate operation from rotation, useful for footage recorded in a mirror or by a front camera that came out reversed.' },
      { q: 'Will rotating fix a video that plays upside down?', a: 'Yes, a 180-degree rotation is the same fix, just turned twice as far.' },
    ],
  },
  {
    slug: 'how-to-remove-audio-from-a-video',
    title: 'How to Remove Audio From a Video (Mute It) on iPhone, Android, Windows, Mac',
    description: 'Muting a video for good, not just while you watch it, needs a real edit on most platforms. Here is how on iPhone, Android, Windows and Mac, and a browser tool that does it in one step.',
    heading: 'How to remove audio from a video',
    dek: 'The mute button on your phone only silences playback. Removing the audio for good needs an actual edit. Here is how, on each platform.',
    keywords: ['how to remove audio from a video', 'mute a video', 'remove sound from video', 'delete audio from video file', 'video without sound'],
    updated: '2026-09-29',
    tools: ['mute-video', 'remove-audio-from-video'],
    sections: [
      {
        h: 'Muting playback vs. removing the audio track',
        p: [
          'Turning your phone\'s ringer switch to silent, or tapping mute in a video player, only stops sound on that one playback. The audio track is still inside the file, and it plays normally for anyone else who opens it. Removing the audio for good means re-saving the file without that track, which is a real edit, not a playback setting.',
        ],
      },
      {
        h: 'On an iPhone or iPad',
        p: [
          'The Shortcuts app has a built-in **Remove Audio from Video** action: open Shortcuts, create a new shortcut, add **Select Photos** followed by **Remove Audio from Video**, then run it on your clip and save. It requires no other software and produces a silent copy of the video in Photos.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'There is no one-tap native option. Google Photos\' editor does not include a way to drop the audio track entirely, so muting a video for good on Android needs a third-party app or a browser tool.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'In Clipchamp (preinstalled on Windows 11), select the clip on the timeline and use the volume control in its properties to set it to 0%, then export; this writes the video with silent audio rather than truly removing the track, but the result is a video that never plays sound.',
        ],
      },
      {
        h: 'On a Mac',
        p: [
          'QuickTime Player can strip the audio directly: open the video, choose **Edit, Remove Audio** from the menu bar (it appears when the file has an audio track), then File, **Export As**, to save the silent version.',
        ],
      },
      {
        h: 'Removing it in one step, on any device',
        p: [
          'Stayput\'s [mute video](/tools/mute-video) tool drops the audio track entirely in your browser tab, on any phone or computer, without an app to install. The [Remove audio from video](/remove-audio-from-video) preset is the same tool set up for this exact job. The file is processed locally, so nothing is uploaded.',
        ],
      },
    ],
    faq: [
      { q: 'Does muting my phone remove the sound from a video permanently?', a: 'No. Muting only silences what you hear while watching; the audio track stays in the file for anyone else who opens it.' },
      { q: 'Will removing audio make the video file smaller?', a: 'Yes, though usually only slightly, since audio is a small part of a video\'s total size compared to the picture.' },
      { q: 'Can I remove audio from just part of a video?', a: 'Removing the whole track is the simplest edit and what all the options above do. To silence only part of a clip, trim out that section first, or edit in an app that supports separate audio and video timelines.' },
      { q: 'Does removing the audio track lose video quality?', a: 'No. The video frames are untouched; only the separate audio stream is dropped.' },
    ],
  },
  {
    slug: 'how-to-copy-text-from-an-image',
    title: 'How to Copy Text From an Image (iPhone, Android, Windows, Mac)',
    description: 'Every recent phone and computer can turn a photo of text into text you can copy and paste, no app required. Here is how on each platform, and a browser tool for batches, scans and stubborn photos.',
    heading: 'How to copy text from an image',
    dek: 'iPhone, Android, Windows and Mac can all turn a photo of text into text you can select and paste. Here is how on each.',
    keywords: ['how to copy text from an image', 'extract text from photo', 'image to text', 'ocr photo to text', 'copy text from screenshot'],
    updated: '2026-09-29',
    tools: ['image-to-text'],
    sections: [
      {
        h: 'How this works without typing it out',
        p: [
          'Optical character recognition (OCR) looks at the shapes in a photo and matches them to letters, effectively reading the image. It works well on clear, well-lit, front-on text such as a document, a sign, a screenshot or a book page, and less well on handwriting, tight curves, or text at a steep angle.',
        ],
      },
      {
        h: 'On an iPhone or iPad',
        p: [
          'Live Text does this automatically (iOS 15 and later): open the photo, and if it contains text, a small icon with lines appears in the corner, or you can touch and hold directly on the text. A selection appears around the words; tap **Select All** and then **Copy** to put it on the clipboard. This also works live through the Camera app, without taking a photo first.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'Google Lens does the equivalent: open the photo in Google Photos, tap the Lens icon, and it highlights the text it recognises; tap and drag to select some or all of it, then **Copy**. Google Lens is also built into the Camera app on many Android phones for live text recognition.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'Windows 11\'s Snipping Tool has a **Text Actions** button after you take a screenshot: it draws boxes around recognised text so you can select and copy it directly, without saving the image first. For text in a photo already on disk, open it in the Photos app and use its text-copy feature if your version has it, or use a browser tool.',
        ],
      },
      {
        h: 'On a Mac',
        p: [
          'Live Text works the same way as on iPhone: open the photo in Preview or Quick Look, hover or click on the text, and it becomes selectable; Cmd-A then Cmd-C selects and copies it. Right-clicking the image also offers **Copy All Text** as a shortcut.',
        ],
      },
      {
        h: 'For batches, scans and stubborn images',
        p: [
          'The built-in tools above work on one image at a time and need a fairly clean photo. Stayput\'s [image to text](/tools/image-to-text) tool runs Tesseract OCR entirely in your browser, so you can drop in several files (JPG, PNG, HEIC, WebP) and get text out of each without uploading anything or repeating the steps per photo. It is also useful for older scans and photos taken at an angle, where phone-camera Live Text sometimes misses lines.',
        ],
      },
    ],
    faq: [
      { q: 'Can I copy text from a photo without an app?', a: 'Yes. iPhone, Android, Windows and Mac all recognise text in a photo natively; a dedicated OCR tool is mainly useful for batches or harder images.' },
      { q: 'Does OCR work on handwriting?', a: 'Poorly, in general. All the tools above are built and tuned for printed text; handwriting recognition is a separate, much less reliable technology.' },
      { q: 'Why did some words come out wrong?', a: 'Low resolution, glare, a tight crop, or an unusual font all reduce accuracy. Retaking the photo straight-on, in even light, and at a higher resolution usually helps most.' },
      { q: 'Can I extract text from a screenshot?', a: 'Yes, screenshots work the same as any other photo for all of these tools, and are often easier since the text is usually sharp and unobstructed.' },
    ],
  },
  {
    slug: 'how-to-blur-a-face-in-a-photo',
    title: 'How to Blur a Face in a Photo (Before You Post It)',
    description: 'Phones do not have a built-in way to blur a face in a photo. Here is why, what the workarounds actually do, and a browser tool built for exactly this.',
    heading: 'How to blur a face in a photo',
    dek: 'No phone has a built-in face-blur button. Here is what the workarounds do instead, and a tool built for exactly this.',
    keywords: ['how to blur a face in a photo', 'blur face in picture', 'hide face in photo before posting', 'pixelate face online', 'anonymize photo face'],
    updated: '2026-09-29',
    tools: ['blur-face', 'blur-image'],
    sections: [
      {
        h: 'Why there is no built-in button for this',
        p: [
          'iPhone, Android, Windows and Mac all have quick-editing tools for cropping, filters and markup, but none of them ship a dedicated face-blur or face-pixelate feature. The closest built-in option on most platforms is the general markup pen: draw a solid black or coloured shape over the face, which hides it completely but looks obviously edited and cannot be partially see-through.',
        ],
      },
      {
        h: 'Drawing over it with Markup',
        p: [
          'On an iPhone: open the photo, tap **Edit**, tap the markup icon (three dots in a circle, or the pen icon), and draw a filled shape over the face with the pen or shape tool. On a Mac, Preview\'s Markup toolbar (the pen-tip icon) has the same shapes and a fill colour. On Windows, Paint\'s shape tool with a fill colour does the same job. This works, and is often the fastest option when appearance does not matter, but it is a solid patch, not a blur, and it is easy to place badly on a moving or tilted face.',
        ],
      },
      {
        h: 'Why a blur or pixelate is often better than a solid box',
        p: [
          'A blur or pixelate keeps the photo looking like a real photo rather than a patched one, which matters for a listing, a group photo shared publicly, or a screenshot going into a report. It also degrades gracefully: light blurring still reads as "there was a face here" while heavy blurring makes the identity unrecoverable, which a badly-placed solid box does not guarantee if it slips even slightly.',
        ],
      },
      {
        h: 'Blurring or pixelating a face without an app',
        p: [
          'Stayput\'s [blur faces](/blur-face) tool detects faces automatically and lets you blur, pixelate, or black-box each one, with the strength adjustable per face, directly in your browser. It also works on other things worth hiding in a photo (a number plate, a screen, a name tag) using the underlying [blur & pixelate](/tools/blur-image) tool\'s manual marking. Nothing is uploaded: the photo and the detection both run on your device.',
        ],
      },
      {
        h: 'A quick checklist before posting',
        p: [
          'Beyond the obvious face, check for: other people\'s faces in the background, visible screens or documents, licence plates, house numbers, and anything reflective (glasses, windows, chrome) that can show what the camera itself would have caught.',
        ],
      },
    ],
    faq: [
      { q: 'Does my phone have a face blur feature?', a: 'No major phone OS ships one natively. The closest built-in option is drawing a solid shape with the markup or pen tool.' },
      { q: 'Is pixelating a face reversible?', a: 'A strong enough blur or pixelation cannot be reliably reversed to recover the original detail, though light blurring may still leave some identifying features visible; when in doubt, blur more heavily.' },
      { q: 'Can I blur more than one face in the same photo?', a: 'Yes, Stayput\'s tool detects every face it finds and lets you blur each independently.' },
      { q: 'Does blurring a face upload the photo anywhere?', a: 'Not with a browser-based tool that runs face detection locally. Stayput\'s runs entirely in your tab, so the photo never leaves your device.' },
    ],
  },
];

export const guideBySlug = (slug: string): Guide | undefined => guides.find((g) => g.slug === slug);

/** "Is <service> safe?" guides, which read as a set. */
export const isSafetyGuide = (g: Guide): boolean => /^is-.+-safe$/.test(g.slug);

/**
 * Guides to suggest under another guide: other safety guides first when the
 * reader is on one, then the guides sharing the most tools, in list order on ties.
 */
export function relatedGuides(guide: Guide, count = 4): Guide[] {
  const safety = isSafetyGuide(guide);
  const score = (g: Guide) => g.tools.filter((t) => guide.tools.includes(t)).length + (safety && isSafetyGuide(g) ? 10 : 0);
  return guides
    .filter((g) => g.slug !== guide.slug)
    .map((g, i) => ({ g, i, s: score(g) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, count)
    .map((x) => x.g);
}

/** Guides that point at a tool or landing page, for the "Guides" section on tool pages. */
export const guidesFor = (slugs: string[]): Guide[] => guides.filter((g) => g.tools.some((t) => slugs.includes(t)));
