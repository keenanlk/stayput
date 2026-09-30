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
          'On any Stayput tool you will see the page and its scripts load, on the HEIC and JPEG XL pages one larger GET for the decoder program, and one small anonymous page-count request. After you add files: nothing, apart from that same small count when a tool finishes, which names the tool and a size bucket and never a file name. Each tool page also runs this count for you and lists the requests under "Open the network tab. Your files never appear in it." The site is [open source](https://github.com/keenanlk/stayput), so the third check is reading the code.',
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
  {
    slug: 'how-to-convert-mov-to-mp4',
    title: 'How to Convert MOV to MP4 (Mac, Windows, iPhone)',
    description: 'MOV plays fine on a Mac or iPhone but not everywhere else. Here is how to convert it to MP4 on a Mac and Windows without extra software, and a browser tool that never re-encodes when it does not need to.',
    heading: 'How to convert MOV to MP4',
    dek: 'MOV plays fine on Apple devices but not everywhere else. Here is how to convert it on a Mac and on Windows.',
    keywords: ['how to convert mov to mp4', 'mov to mp4 converter', 'convert mov to mp4 on mac', 'convert mov to mp4 windows', 'mov file wont play windows'],
    updated: '2026-09-29',
    tools: ['video-to-mp4', 'mov-to-mp4'],
    sections: [
      {
        h: 'Why a MOV won\'t play somewhere else',
        p: [
          'MOV is Apple\'s QuickTime container format: the default for iPhone recordings, Mac screen recordings and FaceTime footage. It usually holds the same H.264 or HEVC video that MP4 does, but some Windows apps, older TVs, video editors and web uploaders only recognise the MP4 wrapper, and a few reject a MOV outright with no explanation. Converting the container to MP4, not necessarily the video itself, is normally all it takes.',
        ],
      },
      {
        h: 'On a Mac',
        p: [
          'QuickTime Player can do this directly: open the MOV file, then File, **Export As**, and choose a resolution (1080p, 720p, etc). QuickTime saves the export as an .mp4 file. This does re-encode the video, so it takes roughly as long as the clip itself and can lose a very small amount of quality.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'Clipchamp, preinstalled on Windows 11, opens a MOV file directly: import it, add it to the timeline, and export, which produces an MP4 by default. Older MOV files using less common codecs sometimes fail to import in Windows\' own apps; that is the case where a browser tool that reads the file itself, rather than relying on Windows\' installed codecs, is more reliable.',
        ],
      },
      {
        h: 'On an iPhone',
        p: [
          'The Shortcuts app has a **Convert Media** action that can output MP4: create a shortcut with **Select Photos** followed by **Convert Media** set to MP4, then run it on the video. This is mainly useful for sending a video to something that insists on MP4 before it will even accept the file.',
        ],
      },
      {
        h: 'Converting without re-encoding when possible',
        p: [
          'Since most MOV files already contain H.264 video, Stayput\'s [video to MP4](/tools/video-to-mp4) converter (and the dedicated [MOV to MP4](/mov-to-mp4) page) checks first: if the video is already H.264, it repackages the container in seconds with no quality loss and no re-encoding at all; only HEVC or other codecs get re-encoded. Everything happens in your browser tab, so a private video is never uploaded, and there is no file-size limit.',
        ],
      },
    ],
    faq: [
      { q: 'Is MOV the same video as MP4, just renamed?', a: 'Often, yes, when the video inside is H.264: the two are different containers around the same kind of data, so a straight repackage with no quality loss is possible. A MOV using HEVC or another codec needs an actual re-encode.' },
      { q: 'Why does my MOV file look huge compared to an MP4 of the same video?', a: 'File size comes mainly from the video codec and bitrate inside, not the container, so a MOV and MP4 with the same codec and settings are close in size. A large MOV is more often about how it was recorded than the container format.' },
      { q: 'Can I convert MOV to MP4 without losing quality?', a: 'Yes, when the source is already H.264, a container-only conversion changes nothing about the video data. Re-encoding to a different codec always carries some quality trade-off.' },
      { q: 'Do I need Handbrake or another app to convert MOV to MP4?', a: 'Not for a quick conversion. QuickTime Player (Mac), Clipchamp (Windows) or a browser tool cover most cases without installing dedicated software.' },
    ],
  },
  {
    slug: 'how-to-merge-pdfs-on-iphone',
    title: 'How to Merge PDFs on an iPhone (No App Required)',
    description: 'The Files app has a built-in way to combine PDFs, though it is not obvious. Here is the exact steps, plus a faster browser tool for reordering pages first.',
    heading: 'How to merge PDFs on an iPhone',
    dek: 'The Files app can do this, though the steps are not obvious. Here they are, plus a faster option when you need to reorder pages.',
    keywords: ['how to merge pdfs on iphone', 'combine pdf files on iphone', 'merge pdf iphone no app', 'join pdf files iphone', 'combine pdfs iphone files app'],
    updated: '2026-09-29',
    tools: ['merge-pdf', 'combine-pdf'],
    sections: [
      {
        h: 'The built-in way, through the Files app',
        p: [
          'Open the **Files** app, find the PDFs you want to combine, and tap **Select** in the top corner. Tap each PDF to select all of them, in the order you want them to appear, then tap the share icon. From the share sheet, tap **Print**. In the print preview, use two fingers to pinch outward on the page thumbnail; this opens a full-page preview showing every page from every selected file in one continuous document. Tap the share icon again from this view and choose **Save to Files** (or Save to Photos, or share it directly). What comes out is a single PDF with every page from your selected files, in the order you picked them.',
        ],
      },
      {
        h: 'Why this feels hidden',
        p: [
          'This works because the Print preview treats anything printable, including a stack of separate PDFs, as one combined document, and the pinch gesture reveals the pages behind that print job as their own file. It is a genuine, no-install way to merge PDFs, but it does not appear anywhere as a "merge" or "combine" button, and it is easy to miss the pinch-to-preview step.',
        ],
      },
      {
        h: 'The limits of this method',
        p: [
          'The Files app trick joins files in the order you tapped them, and there is no way to reorder or remove individual pages once they are in the combined preview: if you tap files in the wrong order, you have to start over. It also does not let you drop specific pages from the middle of a document before merging.',
        ],
      },
      {
        h: 'When you need more control',
        p: [
          'Stayput\'s [merge PDF](/tools/merge-pdf) tool lets you drag files into the exact order you want, see thumbnails of every page, and remove any you do not need, before merging, all in your phone\'s browser. There is no size limit, and the files are combined locally rather than uploaded anywhere, which matters for something like a signed lease or a set of ID documents.',
        ],
      },
    ],
    faq: [
      { q: 'Do I need to download an app to merge PDFs on iPhone?', a: 'No. The Files app\'s Print-preview trick merges PDFs natively, and a browser-based tool covers cases needing reordering, without installing anything either way.' },
      { q: 'Can I choose the order of pages when merging on iPhone?', a: 'With the Files app trick, only by selecting the files in that order beforehand. A tool with a visible page list, like Stayput\'s merge tool, lets you reorder afterward too.' },
      { q: 'Does merging PDFs on an iPhone upload them anywhere?', a: 'The Files app method stays entirely on the device. A browser tool that processes files locally, rather than uploading them to a server, keeps the same guarantee.' },
      { q: 'Can I merge PDFs and images together?', a: 'The Files app print trick works with PDFs and can include some image types in the same selection since both are printable. A converter that turns images into PDF pages first is the more reliable way to mix the two.' },
    ],
  },
  {
    slug: 'how-to-resize-a-photo-for-social-media',
    title: 'How to Resize a Photo for Instagram, Discord and Profile Pictures',
    description: 'Every platform crops or squeezes a photo to its own shape if you upload it as-is. Here are the sizes that matter and how to hit them exactly, on any device.',
    heading: 'How to resize a photo for social media',
    dek: 'Upload the wrong shape and the platform crops it for you, sometimes badly. Here are the sizes that matter and how to hit them.',
    keywords: ['how to resize a photo for instagram', 'resize image for discord', 'profile picture size', 'instagram photo dimensions', 'image size for social media'],
    updated: '2026-09-29',
    tools: ['resize-image-for-instagram', 'crop-image-to-square'],
    sections: [
      {
        h: 'Why the platform\'s own crop is worth avoiding',
        p: [
          'Instagram, Discord, LinkedIn and most other platforms will accept almost any photo, but if its proportions don\'t match what the platform expects, they crop it automatically, often centred, which can cut off a face at the edge of a group photo or leave a subject off-centre. Cropping it yourself first, to the platform\'s actual target size, keeps the framing you intended.',
        ],
      },
      {
        h: 'The sizes that matter',
        p: ['The exact numbers vary a little as platforms update their apps, but these cover almost every case:'],
        list: [
          '**Instagram feed post:** 1:1 square (1080×1080) or 4:5 portrait (1080×1350), which shows more of a tall photo in the feed without cropping.',
          '**Instagram Story or Reel:** 9:16 portrait (1080×1920), filling the full vertical screen.',
          '**Discord and most forum avatars:** square, at least 128×128, though a larger square (512×512 or more) looks sharp on high-DPI screens.',
          '**LinkedIn and most profile pictures:** square, at least 400×400.',
          '**A cover photo or banner** (Facebook, LinkedIn, X): a wide rectangle, typically at least 1500 px wide; check the specific platform, since these change more often than the others.',
        ],
      },
      {
        h: 'Resizing on a phone or computer',
        p: [
          'Stayput\'s [resize for Instagram](/resize-image-for-instagram) preset offers the 4:5, square and 9:16 crops directly, letting you position the crop before saving so the important part of the photo stays in frame. For a plain square, for Discord, LinkedIn or any other profile picture, [crop to square](/crop-image-to-square) does the same with a 1:1 frame you can drag over any part of the photo. Both run in your browser: no upload, no account, and the photo is exported at full resolution rather than whatever the platform\'s own cropper produces.',
        ],
      },
      {
        h: 'A couple of things that catch people out',
        p: [
          'Round profile pictures (most platforms display them in a circle) still need a square source image; the platform masks the corners itself, so cropping to a circle yourself is unnecessary and can leave transparent corners where none are expected. And Instagram\'s minimum resolution is lower than it looks: 1080px wide covers virtually every device, so exporting a much larger image just adds file size without a visible improvement.',
        ],
      },
    ],
    faq: [
      { q: 'What is the best size for an Instagram post in 2026?', a: '1080×1080 for a square post, or 1080×1350 (4:5) to show more of a portrait photo without Instagram cropping it further.' },
      { q: 'Why did Discord crop my profile picture oddly?', a: 'Discord expects a square image and centre-crops anything else. Cropping to a square yourself, keeping the subject centred, avoids that.' },
      { q: 'Does resizing a photo lower its quality?', a: 'Cropping alone does not resample the kept pixels. Scaling a photo down loses some detail, though usually not visibly for web and app use; scaling up cannot add detail that was not there originally.' },
      { q: 'Can I resize a photo without uploading it to Instagram\'s own tools?', a: 'Yes. A browser-based cropping tool produces the exact size before you ever open Instagram, and the photo never leaves your device to do it.' },
    ],
  },
  {
    slug: 'how-to-take-a-passport-photo-at-home',
    title: 'How to Take a Passport Photo at Home (US and International)',
    description: 'A compliant passport photo is mostly about background, lighting and framing, not equipment. Here is how to take one with a phone, the exact requirements, and a tool that sizes it correctly.',
    heading: 'How to take a passport photo at home',
    dek: 'Mostly about background, lighting and framing, not equipment. Here is how to get it right with just a phone.',
    keywords: ['how to take a passport photo at home', 'passport photo requirements', 'diy passport photo', 'passport photo size', 'take your own passport photo'],
    updated: '2026-09-29',
    tools: ['passport-photo', '2x2-photo', '35x45-photo'],
    sections: [
      {
        h: 'What passport photo rules actually require',
        p: [
          'Requirements vary a little by country, but the common ground covers most of it: a plain white or off-white background, even lighting with no harsh shadows on the face or background, a neutral expression with both eyes open, no glasses (most countries now reject photos with glasses, even clear ones), no shadow across the face, and the head filling a specific portion of the frame. The US requires a 2×2 inch photo with the head (chin to top of hair) between 1 inch and 1 3/8 inches. Most of Europe and the Schengen area use 35×45 mm with similar head-size rules.',
        ],
      },
      {
        h: 'Setting up the shot',
        p: [
          'Stand about 4-6 feet from a plain wall, ideally white or light-coloured, in daylight from a window rather than overhead lighting, which casts shadows under the eyes and chin. Have someone else take the photo (or use a tripod and timer) rather than a selfie, since a selfie\'s wide-angle lens distorts facial proportions at close range and most rules require it to be taken by someone else or from a fixed camera anyway. Face the camera directly, keep a neutral expression, and remove glasses, hats, and anything covering the face other than religious head coverings, which most countries explicitly allow.',
        ],
      },
      {
        h: 'From that photo to a compliant file',
        p: [
          'Stayput\'s [passport photo maker](/tools/passport-photo) takes that photo and does the sizing work: it finds your eyes, mouth and hairline, scales your head into the required range automatically, and centres you in either a [2×2 inch US format](/2x2-photo) or a [35×45 mm European format](/35x45-photo). It can also replace the background with plain white if your wall was not perfectly even, and it produces both a single digital photo and a 4×6 inch print sheet with multiple copies, ready to print at a pharmacy or photo kiosk. All of this happens in your browser; the photo is never uploaded.',
        ],
      },
      {
        h: 'Photo-booth vs. DIY: what actually differs',
        p: [
          'A passport photo both booth costs money mainly for the guaranteed compliant background and lighting, not for anything a phone cannot do at home with a bit of care. The most common reasons DIY photos get rejected are a shadowed or uneven background, glasses, and a head that is too small or too large in the frame, all three of which the steps above and the sizing tool directly address.',
        ],
      },
    ],
    faq: [
      { q: 'Can I take my own passport photo with my phone?', a: 'Yes, most passport agencies accept a photo you took yourself as long as it meets the size, background and lighting requirements; a phone camera is more than sharp enough.' },
      { q: 'Can I wear glasses in a passport photo?', a: 'Most countries, including the US since 2016, no longer allow glasses in a passport photo, even clear prescription glasses.' },
      { q: 'What background do I need for a passport photo?', a: 'Plain white or off-white, evenly lit with no shadows, for almost every country\'s passport photo.' },
      { q: 'How is the head-size requirement measured?', a: 'From the bottom of the chin to the top of the hair (not including the very top of the head\'s shadow or hairline flyaways), which must fall within a specific range: 1 to 1 3/8 inches for the US 2×2 photo, and a similar proportion for the 35×45 mm format used across most of Europe.' },
    ],
  },
  {
    slug: 'how-to-remove-a-password-from-a-pdf',
    title: 'How to Remove a Password From a PDF (Mac, Windows, Browser)',
    description: 'If you can already open a PDF, removing its password is usually a save-or-print trick you already have installed. Here is how on a Mac and on Windows, and a browser tool for restriction passwords too.',
    heading: 'How to remove a password from a PDF',
    dek: 'If you can already open it, removing the password is usually a save or print trick built into your computer. Here is how.',
    keywords: ['how to remove a password from a pdf', 'unlock pdf password', 'remove pdf password mac', 'remove pdf password windows', 'pdf password protected remove'],
    updated: '2026-09-29',
    tools: ['unlock-pdf'],
    sections: [
      {
        h: 'The two kinds of PDF password',
        p: [
          'An **open password** stops the file from being viewed at all until it is entered; you need to know this one to do anything with the file. A **permissions password** (or "owner password") lets the file open freely but blocks printing, copying text or editing, and can sometimes be removed even without knowing it, since most PDF readers let you view and print a restricted file regardless. What follows is for a PDF you can already legally open and want to stop having to unlock every time.',
        ],
      },
      {
        h: 'On a Mac',
        p: [
          'Preview does this in one step: open the password-protected PDF (entering the password when asked), then choose File, **Export As PDF**. Preview saves a new copy without the password or the permission restrictions, because it exports the already-decrypted content rather than the original encrypted file.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'There is no equivalent one-click export in the built-in PDF viewer, but the print trick works: open the PDF in Edge or Chrome (entering the password), choose **Print**, then set the destination to **Save as PDF** or **Microsoft Print to PDF**, and save. The resulting file is a fresh, unprotected PDF, since printing renders the page content rather than copying the original encrypted file.',
        ],
      },
      {
        h: 'The print trick on any device',
        p: [
          'The same idea works anywhere a PDF can be opened and printed: iPhone, Android and any browser support printing to a PDF file. It works for permission restrictions unconditionally, and for an open password once you have entered it correctly, since by that point the reader is showing you the plain content.',
        ],
      },
      {
        h: 'A dedicated tool for restriction passwords',
        p: [
          'When you already know the password and just want it gone for good, Stayput\'s [unlock PDF](/tools/unlock-pdf) tool removes it directly in your browser: enter the password once, and it re-saves the PDF without it, without the print step\'s slight risk of re-rendering text as an image in some viewers. Nothing is uploaded; the file and its password stay on your device.',
        ],
      },
    ],
    faq: [
      { q: 'Can I remove a PDF password without knowing it?', a: 'Not an open password that genuinely restricts viewing; you need it to see the content at all. A permissions password (blocking printing or copying) can often be bypassed just by viewing and printing the file, since most readers do not enforce those restrictions strictly.' },
      { q: 'Does printing to PDF lower the quality?', a: 'For ordinary text and images, no meaningful difference. Highly precise vector graphics or forms with fillable fields can occasionally lose some structure through a print-based export, since printing flattens the page.' },
      { q: 'Is removing a password from a PDF I own legal?', a: 'Yes, removing a password from a PDF you have the legal right to open and use is fine. This does not apply to files you do not have permission to access.' },
      { q: 'Does an online PDF password remover upload the file?', a: 'Many do, which means both the file and its password reach someone else\'s server. A browser-based tool that processes the file locally avoids that.' },
    ],
  },
  {
    slug: 'how-to-convert-pdf-to-word',
    title: 'How to Convert a PDF to Word (Editable .docx)',
    description: 'Microsoft Word and Google Docs can both open a PDF and convert it directly, no separate converter needed for most documents. Here is how, and a browser tool for when the result needs cleaning up.',
    heading: 'How to convert a PDF to Word',
    dek: 'Word and Google Docs can both open a PDF directly. Here is how, and what to use when the result comes out messy.',
    keywords: ['how to convert a pdf to word', 'pdf to word converter', 'convert pdf to docx', 'edit a pdf in word', 'pdf to editable document'],
    updated: '2026-09-29',
    tools: ['pdf-to-word'],
    sections: [
      {
        h: 'Why this usually just works, and sometimes doesn\'t',
        p: [
          'Converting a PDF to Word means rebuilding editable paragraphs, headings and (approximately) formatting from a format that only stores where each character sits on the page, not the document structure behind it. For a PDF that was originally a Word document exported to PDF, this reconstruction is usually accurate. For a scanned document (a photo or scan with no real text layer) or a PDF with a complex multi-column layout, the result is rougher, since the converter is guessing at structure that isn\'t really there.',
        ],
      },
      {
        h: 'In Microsoft Word',
        p: [
          'Open Word, choose File, **Open**, and select the PDF directly. Word converts it automatically and opens it as an editable document; a message explains that some layout may shift as a result. Save it as .docx from there. This works in Word for Windows and Mac without any add-in.',
        ],
      },
      {
        h: 'In Google Docs',
        p: [
          'Upload the PDF to Google Drive, right-click it, choose **Open with, Google Docs**. Docs converts it into an editable document, with the same layout caveats as Word\'s conversion, and keeps the original PDF untouched in Drive alongside the new Doc.',
        ],
      },
      {
        h: 'On an iPhone or Android',
        p: [
          'Neither the Word nor Google Docs mobile apps convert a PDF to an editable document the way their desktop and web versions do; they mainly view PDFs. Converting on a phone means using a tool built for it, or opening the file in a desktop version later.',
        ],
      },
      {
        h: 'A dedicated converter for the text underneath',
        p: [
          'Stayput\'s [PDF to Word](/tools/pdf-to-word) tool rebuilds paragraphs and headings from the PDF\'s text layer directly, on your phone or computer, in the browser, without uploading the document. It also offers a plain-text export for when you only need the words, not the formatting. As with Word and Docs\' own conversion, a scanned PDF with no text layer needs OCR first, such as with Stayput\'s [image to text](/tools/image-to-text) tool, before there is any text to convert.',
        ],
      },
    ],
    faq: [
      { q: 'Can I convert a scanned PDF to Word?', a: 'Only after it has gone through OCR to create a text layer; a scan is just an image until then, so any converter starts by guessing text from pixels, and it is only as good as the OCR behind it. [OCR PDF](/tools/ocr-pdf) adds that text layer on your device; convert the searchable copy afterwards.' },
      { q: 'Why did the formatting change after converting?', a: 'The converter is reconstructing structure (columns, headings, spacing) from where text sits on the page, which is an approximation rather than a copy of the original document\'s actual layout.' },
      { q: 'Is there a free way to convert PDF to Word without installing anything?', a: 'Yes. Opening the PDF directly in Word or Google Docs (both already have this built in) or using a browser-based converter both avoid installing separate software.' },
      { q: 'Does converting a PDF to Word online upload my document?', a: 'It depends on the tool. Google Docs\' conversion uploads it to Google Drive by definition; a browser-based tool that processes the file locally does not upload it anywhere.' },
    ],
  },
  {
    slug: 'how-to-convert-a-photo-to-pdf',
    title: 'How to Convert a Photo to PDF (iPhone, Android, Windows, Mac)',
    description: 'Every recent phone and computer can turn a photo into a PDF without installing anything, though the steps are different on each. Here is how, plus a browser tool for combining several photos into one document.',
    heading: 'How to convert a photo to PDF',
    dek: 'Every device can do this, in different ways and different places in the menus. Here is how on each, plus combining several photos into one file.',
    keywords: ['how to convert a photo to pdf', 'jpg to pdf', 'image to pdf converter', 'turn a picture into a pdf', 'save photo as pdf'],
    updated: '2026-09-29',
    tools: ['image-to-pdf', 'jpg-to-pdf'],
    sections: [
      {
        h: 'On an iPhone or iPad',
        p: [
          'From the Photos app: select the photo (or several, by tapping **Select** and choosing more than one), tap the share icon, and choose **Print**. In the print preview, pinch outward on the page thumbnail to open the full-page view, then tap the share icon again and **Save to Files** to save it as a PDF. Selecting multiple photos beforehand puts every one into the same PDF, one photo per page, in the order they were selected.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'Google Drive has a built-in **Scan** feature (tap the **+** button, then **Scan**) that photographs a document directly into a PDF, with automatic cropping and contrast, which works well for documents rather than ordinary photos. For an existing photo already on the phone, the Google Photos app doesn\'t export to PDF directly; use the same print-preview trick as iPhone through the phone\'s Print option in the photo\'s share menu, or use a browser tool.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'Open the photo in the Photos app, or select it in File Explorer, and choose **Print**. Set the printer to **Microsoft Print to PDF** and print; this saves the image as a one-page PDF rather than sending it to a physical printer. This method only handles one photo per PDF at a time.',
        ],
      },
      {
        h: 'On a Mac',
        p: [
          'Open the photo in Preview, then File, **Export As PDF**. For several photos in one PDF, select them all in Preview\'s sidebar first (or select multiple files in Finder and open them together in Preview), then use **File, Print**, and in the print dialog\'s PDF menu choose **Save as PDF**; this combines every open photo into a single multi-page document.',
        ],
      },
      {
        h: 'Combining several photos with more control',
        p: [
          'Stayput\'s [image to PDF](/tools/image-to-pdf) tool (and the [JPG to PDF](/jpg-to-pdf) preset) lets you drop in multiple photos, reorder them by dragging, and choose the page size and margins, all in the browser before generating the PDF. It handles JPG, PNG, WebP and HEIC photos straight from an iPhone camera roll, and nothing is uploaded to produce the file.',
        ],
      },
    ],
    faq: [
      { q: 'Can I combine several photos into one PDF?', a: 'Yes, on every platform above, either by selecting multiple photos before using the print-to-PDF trick, or with a tool built to combine several images into one document with control over the order.' },
      { q: 'What is the print-to-PDF trick and why does it work?', a: 'Printing normally sends a page to a printer; choosing a "Save as PDF" or "Print to PDF" destination instead captures that same rendered page as a PDF file rather than physical paper, which works for a photo just as well as a document.' },
      { q: 'Does converting a photo to PDF reduce its quality?', a: 'The print-based methods can slightly compress or resize the image to fit a standard page. A dedicated converter that embeds the image at its original resolution keeps it unchanged, just wrapped in a PDF page.' },
      { q: 'Can I scan a paper document into a PDF, not just convert an existing photo?', a: 'Yes: the iPhone\'s Notes app and Android\'s Google Drive both have a document-scanning mode that photographs and auto-crops a physical page directly into a PDF, which is more reliable for a document than photographing it manually.' },
    ],
  },
  {
    slug: 'how-to-password-protect-a-pdf',
    title: 'How to Password Protect a PDF (Windows, Mac, Browser)',
    description: 'A few PDF readers can add a password themselves, but most people need a separate tool with real encryption. Here is what your computer can already do, and a browser tool that encrypts the file with AES-256 without uploading it.',
    heading: 'How to password protect a PDF',
    dek: 'Unlike removing a password, adding real encryption usually needs a dedicated tool rather than a built-in export option. Here is what works.',
    keywords: ['how to password protect a pdf', 'add password to pdf', 'encrypt pdf', 'lock a pdf with a password', 'pdf password protection free'],
    updated: '2026-09-29',
    tools: ['protect-pdf'],
    sections: [
      {
        h: 'Why this is harder than removing a password',
        p: [
          'Removing a password from a PDF you can already open is often a save-or-print trick, because the reader has already decrypted the content and just needs to re-save it. Adding a password means encrypting the file from scratch with a real cipher, which most everyday apps, including Preview on a Mac and the Photos or Files apps on Windows, simply do not offer as a built-in feature.',
        ],
      },
      {
        h: 'On a Mac with Preview',
        p: [
          'Preview can add a password: open the PDF, choose File, **Export**, check **Encrypt**, and set a password. This uses standard PDF encryption and is the one common exception to "your OS can\'t do this natively" below, but it is Mac-only.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'There is no equivalent built into File Explorer, the Photos app, or Edge\'s PDF viewer. Microsoft Word can save a document as a password-protected PDF (File, **Save As**, PDF, then **Options, Encrypt the document with a password**), but only if the PDF started as a Word file; it cannot add a password to a PDF you did not create in Word.',
        ],
      },
      {
        h: 'On an iPhone or Android',
        p: [
          'Neither platform has a native way to add a password to an existing PDF. The Files app on iPhone and most Android file managers can only view and organize PDFs, not encrypt them.',
        ],
      },
      {
        h: 'A browser tool that actually encrypts the file',
        p: [
          'Stayput\'s [protect PDF](/tools/protect-pdf) tool sets a real password with AES-256 encryption directly in the browser: the file is encrypted on your device before it is ever saved, so the unprotected version never leaves your computer or gets uploaded anywhere to be locked. It works on any device, including Windows and Android where there is no built-in option, and handles several PDFs in one batch.',
        ],
      },
    ],
    faq: [
      { q: 'Is browser-based PDF encryption actually secure?', a: 'Yes, when the tool uses a standard, real cipher like AES-256 rather than just hiding the content. The key difference versus an online converter is whether the file is uploaded to add the password; if it is not, the plain file never leaves your device.' },
      { q: 'Can I password protect a PDF for free?', a: 'Yes, both Preview\'s built-in export on Mac and a browser-based tool that runs locally are free, unlike some online converters that charge or limit file size.' },
      { q: 'What is the difference between an open password and a permissions password?', a: 'An open password is required just to view the file at all. A permissions (or owner) password lets anyone view it but is meant to block printing, copying or editing, though many readers do not strictly enforce that restriction.' },
      { q: 'Will adding a password change the PDF\'s content or formatting?', a: 'No. Password protection encrypts the existing file; it does not alter the text, images or layout, only who can open or use it.' },
    ],
  },
  {
    slug: 'how-to-split-a-pdf',
    title: 'How to Split a PDF Into Separate Pages',
    description: 'Splitting a PDF means extracting a page range or breaking it into individual files, something most built-in PDF viewers cannot do. Here is what actually works, on desktop and in the browser.',
    heading: 'How to split a PDF into separate pages',
    dek: 'Most built-in PDF viewers can reorder or delete pages, but not split a document into separate files. Here is what does the job.',
    keywords: ['how to split a pdf', 'extract pages from pdf', 'split pdf into separate files', 'pdf splitter free', 'pull one page out of a pdf'],
    updated: '2026-09-29',
    tools: ['split-pdf'],
    sections: [
      {
        h: 'What "splitting" usually means',
        p: [
          'Splitting a PDF covers a few different jobs: pulling out one page range as its own file (say, pages 3 to 5 of a 20-page report), or breaking every page into its own separate document. Deleting pages you don\'t want, which some readers support, is a different operation and doesn\'t produce the extracted pages as their own file.',
        ],
      },
      {
        h: 'On a Mac with Preview',
        p: [
          'Preview\'s sidebar lets you drag individual page thumbnails out onto the desktop, which saves each dragged page as its own single-page PDF. There is no built-in way to extract a multi-page range as one file without repeating this per page, or without dragging a multi-page selection (shift-click a range first, then drag).',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'The built-in PDF viewer in Edge does not support splitting or extracting pages. Print-to-PDF can print a chosen page range (in the print dialog\'s page range field) to a new PDF, which handles extracting one range but not breaking a document into many separate files at once.',
        ],
      },
      {
        h: 'On an iPhone or Android',
        p: [
          'Neither platform\'s Files app or PDF viewer supports splitting a document. A print-to-PDF with a page range, from the share sheet, works the same way as the Windows trick above for pulling out one range.',
        ],
      },
      {
        h: 'A dedicated splitter for pages or ranges',
        p: [
          'Stayput\'s [split PDF](/tools/split-pdf) tool extracts a specific page range, or breaks the whole document into individual single-page PDFs, in one step, directly in the browser. It works the same way on a phone or a computer and does not upload the document to do it.',
        ],
      },
    ],
    faq: [
      { q: 'Can I split a PDF without installing software?', a: 'Yes, a browser-based splitter needs no install and works the same on any device, unlike Preview\'s drag-out method which is Mac-only.' },
      { q: 'What is the difference between splitting and deleting pages?', a: 'Deleting removes pages from the existing document and leaves the rest; splitting produces the removed (or selected) pages as their own separate file, keeping both parts usable.' },
      { q: 'Can I extract just one page from a PDF?', a: 'Yes, that\'s the simplest case of a page range, whether by dragging a single page out in Preview, printing that one page to a new PDF, or using a dedicated split tool.' },
      { q: 'Does splitting a PDF reduce its quality?', a: 'No, splitting copies the existing pages into new files without re-rendering them, so text and images stay exactly as they were.' },
    ],
  },
  {
    slug: 'how-to-convert-a-video-to-mp3',
    title: 'How to Convert a Video to MP3',
    description: 'Pulling the audio out of a video and saving it as an MP3 is different from just muting the video, and most phones and computers have no built-in way to do it. Here is what actually works.',
    heading: 'How to convert a video to MP3',
    dek: 'This is different from muting a video: you want the sound saved as its own file. Most devices have no built-in way to do that.',
    keywords: ['how to convert a video to mp3', 'mp4 to mp3', 'extract audio from video', 'save video sound as mp3', 'video to audio converter'],
    updated: '2026-09-29',
    tools: ['video-to-mp3'],
    sections: [
      {
        h: 'Converting versus muting',
        p: [
          'Muting a video, or removing its audio track, gets rid of the sound and keeps the silent video. Converting a video to MP3 is closer to the opposite: keep the sound, discard the video frames, and save the audio as a standalone file you can put on a music player or send separately. They are two different operations even though both involve separating audio from video.',
        ],
      },
      {
        h: 'On an iPhone or Android',
        p: [
          'Neither the Photos app nor the built-in camera roll has a way to export just the audio track of a video. Voice Memos and similar apps only record new audio; they don\'t extract it from an existing video file. This is one of the more common "how do I" gaps on mobile, since it is a fairly specific, less common task.',
        ],
      },
      {
        h: 'On a Mac with QuickTime',
        p: [
          'QuickTime Player can export audio only: open the video, choose File, **Export As**, and pick **Audio Only**. This saves an M4A file, not an MP3 directly, so a follow-up conversion step is needed if MP3 specifically is required (many devices and players accept M4A just as well, so check whether that\'s actually necessary first).',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'There is no built-in equivalent in the Movies & TV or Photos apps for extracting audio from a video as a separate file. This is a task Windows genuinely has no native tool for, which is why most people search for a converter rather than a menu option.',
        ],
      },
      {
        h: 'A direct converter to MP3',
        p: [
          'Stayput\'s [video to MP3](/tools/video-to-mp3) tool does this directly, on any device: drop in a video (or several, in a batch) and it extracts the audio and saves it as an MP3 or WAV, in the browser, without uploading the file. It skips the extra M4A-to-MP3 conversion step that QuickTime\'s export leaves you with.',
        ],
      },
    ],
    faq: [
      { q: 'Is converting a video to MP3 the same as muting the video?', a: 'No. Muting removes the audio and keeps the silent video; converting to MP3 keeps the audio as its own file and discards the video.' },
      { q: 'Why does QuickTime save an M4A instead of an MP3?', a: 'M4A is Apple\'s preferred audio format and what QuickTime\'s "Audio Only" export produces by default; it is not the same file extension as MP3 even though both are compressed audio, so some further conversion or a different tool is needed for MP3 specifically.' },
      { q: 'Does the audio quality change when converting to MP3?', a: 'MP3 is a compressed format, so there is some quality loss versus the original video\'s audio track, though it is usually not noticeable for speech or typical video soundtracks at a reasonable bitrate.' },
      { q: 'Can I convert just part of a video to MP3?', a: 'Trim the video to the part you want first (or trim the resulting audio file afterward), since most converters, including a browser-based one, convert the whole file by default.' },
    ],
  },
  {
    slug: 'how-to-trim-an-mp3-file',
    title: 'How to Trim an MP3 File (Cut a Song, Voice Memo or Podcast)',
    description: 'Cutting an MP3 or other audio file down to just the part you want usually needs a waveform to see what you are cutting, which most phones and computers do not show by default. Here is what works.',
    heading: 'How to trim an MP3 file',
    dek: 'Cutting audio precisely needs to see the waveform, which most built-in apps do not show. Here is what actually works.',
    keywords: ['how to trim an mp3', 'cut a song online', 'trim audio file', 'mp3 cutter free', 'cut a voice memo'],
    updated: '2026-09-29',
    tools: ['trim-audio'],
    sections: [
      {
        h: 'Why this is fiddlier than trimming a video',
        p: [
          'Most phones show a visible timeline with a video preview when trimming, which makes it easy to see roughly where to cut. Audio has no picture, only sound, so trimming accurately without seeing a waveform means guessing based on playback position alone, which is slow and imprecise for anything more exact than "somewhere near the start."',
        ],
      },
      {
        h: 'On an iPhone',
        p: [
          'The Voice Memos app can trim a recording it made itself: tap the recording, tap the options icon, **Edit Recording**, then drag the trim handles at the top of the waveform. This only works for recordings made in Voice Memos, not for an MP3 or other audio file already on the phone from somewhere else.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'There is no universal built-in audio trimmer across Android phones; some manufacturers\' own Sound Recorder apps include one for their own recordings, similar to Voice Memos, but it doesn\'t handle an arbitrary MP3 file already saved to the phone.',
        ],
      },
      {
        h: 'On a Mac with GarageBand',
        p: [
          'GarageBand can trim any audio file: import it as a track, drag its edges to the length you want, and export with **Share, Export Song to Disk**. This works for any MP3, not just recordings made in the app, but it is a full music app for a simple cut, and exporting adds a few extra steps compared to a purpose-built trimmer.',
        ],
      },
      {
        h: 'A waveform-based trimmer built for exactly this',
        p: [
          'Stayput\'s [trim audio](/tools/trim-audio) tool shows the waveform so you can see exactly where to cut, works on any MP3, WAV, M4A or other audio file (or the sound from a video), adds fades if you want them, and exports as MP3 or WAV, all in the browser with nothing uploaded. It works the same way on a phone or a computer, unlike Voice Memos or GarageBand which each only cover one device.',
        ],
      },
    ],
    faq: [
      { q: 'Can I trim an MP3 without installing an app?', a: 'Yes, a browser-based trimmer with a visible waveform works on a phone or computer without installing anything, and handles any MP3 rather than only recordings made in a specific app.' },
      { q: 'Why do I need to see a waveform to trim audio accurately?', a: 'A waveform shows where the sound actually starts and stops, including silences and peaks, which makes it possible to cut precisely instead of guessing from playback position alone.' },
      { q: 'Does trimming an MP3 reduce its quality?', a: 'Trimming itself doesn\'t re-encode the audio content, only shortens it; quality loss only happens if the tool re-compresses the file at a lower bitrate during export.' },
      { q: 'Can I add a fade-in or fade-out when trimming?', a: 'Some tools support this, including Stayput\'s trim audio tool; a plain trim without a fade can sound abrupt at the cut points, especially for music or speech.' },
    ],
  },
  {
    slug: 'how-to-add-page-numbers-to-a-pdf',
    title: 'How to Add Page Numbers to a PDF',
    description: 'Word and Google Docs can number pages before exporting to PDF, but once a document is already a PDF, most viewers have no way to stamp numbers onto it. Here is what works, including for a PDF you did not create yourself.',
    heading: 'How to add page numbers to a PDF',
    dek: 'Easy if you still have the original Word file; much harder if all you have is the finished PDF. Here is what actually works.',
    keywords: ['how to add page numbers to a pdf', 'number pdf pages', 'insert page numbers pdf', 'pdf page numbering free', 'add page numbers to a scanned pdf'],
    updated: '2026-09-29',
    tools: ['pdf-page-numbers'],
    sections: [
      {
        h: 'The easy case: you still have the original document',
        p: [
          'If the PDF came from Word or Google Docs, the simplest path is to add page numbers in the original document (Word: **Insert, Page Number**; Google Docs: **Insert, Page numbers**) and re-export to PDF. This gives full control over the numbering format and skips touching the PDF at all.',
        ],
      },
      {
        h: 'When you only have the PDF',
        p: [
          'Often the original document is gone, came from someone else, or is a scan, and page numbers need to be stamped directly onto the existing PDF. This is a different job: adding a small text layer to each page rather than reflowing a document, and it is something neither Preview on a Mac nor the built-in PDF viewers on Windows, iPhone or Android can do.',
        ],
      },
      {
        h: 'On a Mac, Windows, iPhone or Android',
        p: [
          'None of the built-in PDF viewers on any of these platforms, including Preview, Edge\'s reader, and the Files apps on iPhone and Android, offer a way to stamp page numbers onto an existing PDF. This is a genuine gap across every platform, not something hidden in a menu.',
        ],
      },
      {
        h: 'A dedicated tool for stamping numbers onto a PDF',
        p: [
          'Stayput\'s [add page numbers](/tools/pdf-page-numbers) tool stamps a number onto every page directly, with a choice of position (corner or centre), format (plain number, or "Page 1 of 10"), font and starting number, done in the browser without uploading the document. It works the same way whether the PDF came from Word, a scanner, or somewhere else entirely.',
        ],
      },
    ],
    faq: [
      { q: 'Can I add page numbers to a PDF without the original document?', a: 'Yes, a tool that stamps numbers directly onto the existing PDF pages works regardless of what created the file, unlike adding numbers in Word or Docs which requires the original source document.' },
      { q: 'Can I start numbering from a page other than 1?', a: 'A dedicated PDF page-numbering tool typically lets you set a starting number, which is useful when a cover page or table of contents should not be counted.' },
      { q: 'Does adding page numbers change the PDF\'s existing content?', a: 'No, it adds a small text layer to each page without altering the original text or images underneath.' },
      { q: 'Can I number a scanned PDF the same way?', a: 'Yes, stamping numbers works on any PDF, including a scan with no underlying text layer, since it is adding a new number on top rather than depending on what is already there.' },
    ],
  },
  {
    slug: 'how-to-merge-multiple-videos-into-one',
    title: 'How to Merge Multiple Videos Into One',
    description: 'Joining several video clips end to end into a single file is not something most phone camera rolls or built-in video apps do without a full editor. Here is what actually works, including a browser tool.',
    heading: 'How to merge multiple videos into one',
    dek: 'Most camera rolls can play clips one after another, not merge them into a single file. Here is what actually joins them.',
    keywords: ['how to merge videos', 'combine video clips into one', 'join videos together', 'merge mp4 files free', 'stitch videos into one file'],
    updated: '2026-09-29',
    tools: ['merge-videos'],
    sections: [
      {
        h: 'Why this needs more than the camera roll',
        p: [
          'Playing several clips in sequence in the Photos app, or grouping them into an album, is not the same as merging them into one video file: the clips stay separate, so sharing them as a single file, or uploading them somewhere that only accepts one video, still doesn\'t work.',
        ],
      },
      {
        h: 'On an iPhone or Android',
        p: [
          'Neither the Photos app nor the default camera roll has a built-in way to merge clips into one video file. iMovie (free on iPhone and Mac) can do it: add the clips to a new project in the order you want, and export. This is a full video editor, though, for what is otherwise a simple join.',
        ],
      },
      {
        h: 'On a Mac with iMovie',
        p: [
          'Same approach as iPhone: create a new project, drag the clips onto the timeline in order, and share/export as a video file. Reordering clips is done by dragging them along the timeline before exporting.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'The Photos app\'s video editor (Clipchamp, built into recent versions of Windows) can combine clips on a timeline similarly to iMovie: add each clip, arrange the order, and export. Like iMovie, it is a general editor rather than a single-purpose merge tool.',
        ],
      },
      {
        h: 'A tool built just for joining clips',
        p: [
          'Stayput\'s [merge videos](/tools/merge-videos) tool skips the full editor: drop in the clips, drag to reorder them, and it joins them end to end into one MP4, keeping the original sound, directly in the browser with nothing uploaded. It handles MP4, MOV, WebM and MKV clips together in one merge.',
        ],
      },
    ],
    faq: [
      { q: 'Can I merge videos without a full video editor?', a: 'Yes, a tool built specifically for joining clips end to end skips the timeline, transitions and other editing features a full app like iMovie or Clipchamp includes.' },
      { q: 'Can I merge videos in different formats together?', a: 'A capable merge tool can combine MP4, MOV, WebM and MKV clips in a single output; some simpler methods require all clips to already share the same format.' },
      { q: 'Does merging videos re-encode and lose quality?', a: 'Some quality loss is common since the clips need to be combined into a single continuous stream, though a well-built tool keeps this minimal at a matching resolution and bitrate.' },
      { q: 'Can I reorder the clips before merging?', a: 'Yes, on every method above, whether by dragging clips along a timeline in a full editor or reordering them in a dedicated merge tool before joining.' },
    ],
  },
  {
    slug: 'how-to-convert-wav-to-mp3',
    title: 'How to Convert WAV to MP3 (and Other Audio Formats)',
    description: 'A WAV file is much larger than the equivalent MP3 for the same audio, which is usually why people need to convert one to the other. Here is how, including what your OS can already do, and a browser converter for the rest.',
    heading: 'How to convert WAV to MP3',
    dek: 'WAV files are large; MP3 is the smaller, more compatible format most people actually need. Here is how to convert between them.',
    keywords: ['how to convert wav to mp3', 'audio format converter', 'convert m4a to mp3', 'convert flac to mp3', 'wav to mp3 free no upload'],
    updated: '2026-09-29',
    tools: ['audio-converter'],
    sections: [
      {
        h: 'Why WAV and MP3 are so different in size',
        p: [
          'WAV is an uncompressed format: it stores the raw audio data directly, which makes files large but exactly reproduces the original sound. MP3 compresses the audio, discarding some detail that is harder for most people to hear, which is why an MP3 of the same recording is often a tenth the size or smaller.',
        ],
      },
      {
        h: 'On a Mac with QuickTime or iTunes/Music',
        p: [
          'QuickTime Player can export a WAV file as an M4A (File, **Export As**, Audio Only), but not directly to MP3. The Music app can convert to MP3 if "Create MP3 Version" is enabled first in its settings (Preferences, **Files, Import Settings**, set to MP3 Encoder), then right-click the imported song and choose it from there — a roundabout path for a simple conversion.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'There is no built-in converter between audio formats in Windows Media Player or the Photos app; both mainly play files rather than convert them. This is a genuine gap, which is why most people search for a dedicated converter rather than a settings menu.',
        ],
      },
      {
        h: 'On an iPhone or Android',
        p: [
          'Neither platform has a native audio format converter. Files that arrive as WAV, FLAC or another format either play as-is in a compatible app, or need converting elsewhere before they will import into an app that expects MP3 specifically.',
        ],
      },
      {
        h: 'A direct converter between formats',
        p: [
          'Stayput\'s [audio converter](/tools/audio-converter) tool converts between MP3, WAV, FLAC, M4A and OGG directly, in a batch, in the browser, without uploading the files or needing the Music app\'s roundabout MP3-encoder setting. It also pulls audio out of a video file in the same step if needed.',
        ],
      },
    ],
    faq: [
      { q: 'Does converting WAV to MP3 lose audio quality?', a: 'Yes, some quality is lost since MP3 is a compressed (lossy) format, though at a reasonable bitrate the difference is not noticeable for most listening.' },
      { q: 'Can I convert MP3 back to WAV?', a: 'Yes, but this does not recover any detail that was discarded during the original MP3 compression; it just changes the container and encoding, not the underlying quality.' },
      { q: 'Why can\'t I just rename a .wav file to .mp3?', a: 'The file extension does not change the actual audio encoding inside the file, so renaming it does not convert anything; the data still needs to be re-encoded by a converter.' },
      { q: 'Is there a free way to convert audio formats without installing software?', a: 'Yes, a browser-based converter works without installing anything and, when it runs locally, does not upload the audio file anywhere to convert it.' },
    ],
  },
  {
    slug: 'how-to-add-a-watermark-to-a-photo',
    title: 'How to Add a Watermark to a Photo',
    description: 'Putting your name, a copyright line or a website on photos before sharing them usually means a separate app, since phone camera rolls have no built-in watermarking feature. Here is what works.',
    heading: 'How to add a watermark to a photo',
    dek: 'Phone camera rolls have no built-in watermark feature. Here is what actually adds text to a photo before you share it.',
    keywords: ['how to add a watermark to a photo', 'add text to a photo', 'copyright watermark image', 'add watermark to picture free', 'photo watermark online'],
    updated: '2026-09-29',
    tools: ['watermark-image'],
    sections: [
      {
        h: 'Why this needs a separate step',
        p: [
          'A watermark is text or a logo layered onto a photo, usually to mark ownership or discourage unauthorized use before sharing a preview or a sample image. Neither the iPhone nor Android Photos app, nor Windows Photos, has a built-in way to add this kind of text overlay; their editing tools cover cropping, filters and basic adjustments, not adding new text to the image.',
        ],
      },
      {
        h: 'On an iPhone or iPad',
        p: [
          'The Markup tool (available from the Photos app\'s edit screen, or the share sheet\'s Markup option) can add text to a photo by tapping the **+** button and choosing **Text**, then positioning and resizing it. This works for a one-off photo but has no way to save a watermark style to reuse, and repeating it across many photos means doing this manually each time.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'Most Android phones\' built-in Photos or Gallery apps don\'t include a markup or text tool at all; Google Photos\' editor covers filters and adjustments only. Adding text on Android typically means a separate app made for the purpose.',
        ],
      },
      {
        h: 'On a Mac or Windows',
        p: [
          'Preview on a Mac has a Markup toolbar with a text tool, similar to iPhone\'s Markup, reached from the toolbar\'s annotation icon. Windows\' Photos app has no equivalent text-overlay tool; adding text there means a separate editor.',
        ],
      },
      {
        h: 'A tool built for watermarking many photos at once',
        p: [
          'Stayput\'s [watermark image](/tools/watermark-image) tool is built for this specifically: set the text once (a name, copyright line or website), choose a corner, the centre, or a repeated pattern across the photo, adjust size, opacity and colour, and apply it to a batch of photos at once, all in the browser with nothing uploaded. This avoids repeating the Markup trick photo by photo.',
        ],
      },
    ],
    faq: [
      { q: 'Can I watermark several photos at once?', a: 'Yes, a dedicated watermarking tool applies the same text, position and style to a batch of photos in one step, unlike Markup-based methods which handle one photo at a time.' },
      { q: 'Does adding a watermark reduce the photo\'s resolution?', a: 'No, a well-built watermarking tool adds the text or logo at the photo\'s original resolution rather than resizing or recompressing the image itself.' },
      { q: 'Can I make the watermark harder to remove by repeating it across the image?', a: 'Yes, a repeated, semi-transparent watermark pattern across the whole photo is harder to crop or clone out than a single watermark in one corner.' },
      { q: 'Is watermarking free?', a: 'Yes, both the built-in Markup tools on iPhone and Mac, and a browser-based watermarking tool, are free; some online watermarking services add their own logo unless you pay, which a tool that doesn\'t do that avoids.' },
    ],
  },
  {
    slug: 'how-to-rotate-a-pdf',
    title: 'How to Rotate a PDF (and Save It That Way)',
    description: 'Most PDF viewers can rotate a page temporarily just to read it, but that view resets the next time it opens. Making a rotation permanent is a different, less obvious step. Here is how.',
    heading: 'How to rotate a PDF',
    dek: 'Rotating a PDF to read it and rotating it permanently are two different things. Here is how to make the fix stick.',
    keywords: ['how to rotate a pdf', 'rotate pdf permanently', 'fix sideways pdf pages', 'rotate a scanned pdf', 'rotate pdf and save'],
    updated: '2026-09-29',
    tools: ['rotate-pdf'],
    sections: [
      {
        h: 'Why the rotation doesn\'t save',
        p: [
          'Most PDF readers, including the ones built into iPhone, Android, Mac and Windows, let you rotate the current view with a button or gesture so a sideways page reads right-side up. That rotation is just how the viewer is displaying the page in that session; it is not written back into the file, so the page opens sideways again next time, and anyone else who opens the PDF sees it unrotated too.',
        ],
      },
      {
        h: 'On a Mac with Preview',
        p: [
          'Preview can rotate a page and save it that way: select the page in the sidebar, use the rotate buttons in the toolbar (or **Tools, Rotate Left/Right**), then save the file. This is one of the few built-in viewers that actually writes the rotation into the saved PDF rather than only changing the display.',
        ],
      },
      {
        h: 'On Windows, iPhone or Android',
        p: [
          'None of the default PDF viewers on these platforms (Edge\'s reader, or the Files/Photos apps on iPhone and Android) save a rotation permanently; whatever rotate control they offer only affects that viewing session. This is a genuine gap, not a hidden setting, which is why the fix tends to come up as a repeated search across every platform except Mac.',
        ],
      },
      {
        h: 'A tool that rotates and saves it for good',
        p: [
          'Stayput\'s [rotate PDF](/tools/rotate-pdf) tool rotates all pages or just the ones you select by 90, 180 or 270 degrees and saves the change permanently into a new file, directly in the browser without uploading the document. It works the same way on any device, including Windows, iPhone and Android where there is no built-in equivalent.',
        ],
      },
    ],
    faq: [
      { q: 'Why does my PDF keep opening sideways even after I rotate it?', a: 'Most viewers only rotate the on-screen display for that session; the rotation is not saved into the file unless the tool specifically supports saving it, like Preview on a Mac or a dedicated rotate tool.' },
      { q: 'Can I rotate just one page instead of the whole document?', a: 'Yes, both Preview and a dedicated PDF rotation tool let you select individual pages to rotate rather than applying it to every page.' },
      { q: 'Does rotating a PDF affect its text or image quality?', a: 'No, rotation only changes the page\'s orientation; the underlying text and images are unchanged.' },
      { q: 'Why are scanned PDFs so often sideways in the first place?', a: 'A scanner or phone camera can capture a page in whatever orientation it was fed or held, and the scanning software doesn\'t always auto-correct it, leaving the saved PDF rotated.' },
    ],
  },
  {
    slug: 'how-to-slow-down-or-speed-up-a-video',
    title: 'How to Slow Down or Speed Up a Video',
    description: 'Changing how fast a video plays, permanently, in the saved file, is different from adjusting playback speed in a player. Here is what phones and computers can do, and a browser tool with proper pitch correction.',
    heading: 'How to slow down or speed up a video',
    dek: 'This changes the saved file itself, not just how a player plays it back. Here is what actually works, including keeping the audio in tune.',
    keywords: ['how to slow down a video', 'how to speed up a video', 'change video speed', 'slow motion video editor free', 'speed up video without app'],
    updated: '2026-09-29',
    tools: ['video-speed'],
    sections: [
      {
        h: 'Playback speed versus the actual file',
        p: [
          'Many video players, including YouTube and some phone players, let you change playback speed while watching, but that setting only affects how that player shows the video to you; the file itself, and how it plays for anyone else or on any other app, is unchanged. Actually speeding up or slowing down a video means re-encoding a new file at the different speed.',
        ],
      },
      {
        h: 'On an iPhone',
        p: [
          'The Photos app has no built-in speed control for existing videos. iMovie (free on iPhone) can do it: add the clip to a project, select it, and use the speed slider to make it faster or slower, then export. Apple\'s own Slo-Mo camera mode only works for footage recorded that way from the start, not for slowing down existing regular video.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'Most Android phones\' default Gallery or Photos apps don\'t include a speed editor. Google Photos\' basic editor also doesn\'t offer this; changing speed typically means a separate video editor app.',
        ],
      },
      {
        h: 'On a Mac or Windows',
        p: [
          'iMovie on Mac works the same way as on iPhone: select the clip, drag the speed slider, export. Windows\' Clipchamp (built into recent versions of Windows) includes a similar speed control on its timeline. Both are full editors for what is otherwise a single adjustment.',
        ],
      },
      {
        h: 'A direct speed changer with pitch correction',
        p: [
          'Stayput\'s [change video speed](/tools/video-speed) tool speeds a video up to 2x, 4x or 8x, or slows it to 0.5x or 0.25x, directly in the browser, and keeps the audio\'s pitch correct rather than letting it sound chipmunk-high or slowed to a growl, which is a common side effect of naive speed changes. Nothing is uploaded to do it.',
        ],
      },
    ],
    faq: [
      { q: 'Does changing video speed also change the audio pitch?', a: 'It can, unless the tool specifically corrects for it; naive speed changes raise the pitch when sped up and lower it when slowed down, while pitch-correct tools keep the voice or music sounding natural.' },
      { q: 'Is changing playback speed in a video player the same as actually speeding up the file?', a: 'No, a player\'s speed control only affects how that app plays the video back; the saved file, and how it plays anywhere else, stays at its original speed.' },
      { q: 'Can I slow down only part of a video, not the whole thing?', a: 'Trim the clip to just the section you want first, then apply the speed change to that shorter clip, since most tools change the speed of the whole file by default.' },
      { q: 'Why would I want to slow down a video that wasn\'t recorded in slow motion?', a: 'Slowing down regular footage can create a slow-motion effect after the fact, useful when the moment wasn\'t recorded with a slow-motion camera setting to begin with, though it looks less smooth than footage recorded at a genuinely higher frame rate.' },
    ],
  },
  {
    slug: 'how-to-add-a-watermark-to-a-pdf',
    title: 'How to Add a Watermark to a PDF (Confidential, Draft, or Copy Number)',
    description: 'Marking every page of a PDF as confidential, a draft or a numbered copy is not something built-in PDF viewers can do; it usually needs the original document or a dedicated tool. Here is how.',
    heading: 'How to add a watermark to a PDF',
    dek: 'Stamping "confidential" or "draft" across every page needs either the original document or a tool built for it. Here is how.',
    keywords: ['how to add a watermark to a pdf', 'stamp confidential on pdf', 'add draft watermark to pdf', 'pdf watermark free online', 'watermark every page of a pdf'],
    updated: '2026-09-29',
    tools: ['watermark-pdf'],
    sections: [
      {
        h: 'What a PDF watermark is for',
        p: [
          'A PDF watermark stamps repeated text, such as CONFIDENTIAL, DRAFT, or a recipient\'s name as a copy marker, across every page, usually as a diagonal, semi-transparent overlay that doesn\'t block reading the content underneath. It is meant to discourage a document from being redistributed as if it were final, or to trace which copy went to whom.',
        ],
      },
      {
        h: 'If you still have the original document',
        p: [
          'Word has a built-in watermark feature (**Design, Watermark**) that adds text before exporting to PDF, and it is the easiest path when the source file is still available. This does not help once the document only exists as a PDF, which is the more common situation.',
        ],
      },
      {
        h: 'On a Mac, Windows, iPhone or Android',
        p: [
          'None of the built-in PDF viewers on any platform, Preview included, can stamp a watermark across an existing PDF\'s pages; Preview\'s Markup tool can add text to one page at a time, but not automatically repeat it across every page of a multi-page document.',
        ],
      },
      {
        h: 'A tool that stamps every page at once',
        p: [
          'Stayput\'s [watermark PDF](/tools/watermark-pdf) tool stamps text across every page in one step, diagonally, repeated, or in a corner, directly in the browser, whether or not the original document still exists. It works on a PDF from any source, including a scan or one someone else sent you.',
        ],
      },
    ],
    faq: [
      { q: 'Can I watermark a PDF I no longer have the original document for?', a: 'Yes, a tool that stamps the watermark directly onto the existing PDF pages works regardless of what created the file or whether the source document still exists.' },
      { q: 'Does a watermark block someone from reading the document?', a: 'No, a proper watermark is semi-transparent and placed so it doesn\'t obscure the text; its purpose is visibility as a marker, not blocking access to the content.' },
      { q: 'Can I put a different watermark on each copy, like a recipient\'s name?', a: 'Yes, since the watermark text is set per file, each copy sent to a different person can carry that person\'s name or a unique copy number, useful for tracing which copy leaked if a document is redistributed.' },
      { q: 'Does watermarking a PDF change its other content?', a: 'No, it adds a new layer of text on top of each page without altering the existing text, images or layout underneath.' },
    ],
  },
  {
    slug: 'how-to-convert-a-gif-to-mp4',
    title: 'How to Convert a GIF to MP4',
    description: 'A GIF is often far larger than the equivalent video, and some places do not accept it at all. Converting to MP4 shrinks the file and makes it playable everywhere. Here is how.',
    heading: 'How to convert a GIF to MP4',
    dek: 'A GIF of the same clip is usually much bigger than an MP4, and some platforms will not accept a GIF at all. Here is how to convert it.',
    keywords: ['how to convert a gif to mp4', 'gif to video converter', 'gif to mp4 free', 'shrink a gif file', 'convert animated gif to video'],
    updated: '2026-09-29',
    tools: ['gif-to-mp4'],
    sections: [
      {
        h: 'Why convert a GIF to MP4 at all',
        p: [
          'GIF stores every frame with limited color compression, which makes an animated GIF file far larger than a video of the same clip using modern video compression. Some platforms and messaging apps also handle a GIF differently from a video, or don\'t accept one at all in certain upload spots, which is the other common reason to convert.',
        ],
      },
      {
        h: 'On an iPhone or Android',
        p: [
          'Neither platform\'s Photos app has a built-in GIF-to-video converter; a GIF saved to the camera roll stays a GIF unless something converts it. Some messaging apps automatically convert a GIF to a short video internally when sending it, but that conversion isn\'t something you control or can save as your own file.',
        ],
      },
      {
        h: 'On a Mac or Windows',
        p: [
          'There is no built-in converter in Preview, Photos, or File Explorer on either platform for turning a GIF into a video file; both mainly treat a GIF as an image that happens to animate, not as source video to re-encode.',
        ],
      },
      {
        h: 'A direct converter to MP4',
        p: [
          'Stayput\'s [GIF to MP4](/tools/gif-to-mp4) tool converts animated GIFs to MP4 video directly in the browser, in a batch, without uploading the files. The resulting MP4 is typically a fraction of the original GIF\'s size and plays correctly as a video on Instagram, WhatsApp, X and in slide decks where a GIF sometimes doesn\'t behave as expected.',
        ],
      },
    ],
    faq: [
      { q: 'Why is a GIF so much bigger than the same clip as MP4?', a: 'GIF uses an older, less efficient compression scheme with a limited color palette per frame; MP4 uses modern video compression designed specifically to keep motion video small.' },
      { q: 'Does converting a GIF to MP4 lose the animation loop?', a: 'A converted MP4 can be set to loop the same way a GIF does in most players and platforms, though the setting to loop it depends on where it is played, not the file itself.' },
      { q: 'Will an MP4 look the same quality as the original GIF?', a: 'Generally as good or better, since MP4\'s compression preserves more color detail than GIF\'s limited palette, while also producing a smaller file.' },
      { q: 'Can I convert several GIFs to MP4 at once?', a: 'Yes, a browser-based batch converter can process multiple GIF files in one go rather than one at a time.' },
    ],
  },
  {
    slug: 'how-to-reorder-pages-in-a-pdf',
    title: 'How to Reorder Pages in a PDF',
    description: 'Fixing the order of pages in a PDF, or deleting the ones you do not need, is easy on a Mac but missing from most other built-in PDF viewers. Here is what works everywhere.',
    heading: 'How to reorder pages in a PDF',
    dek: 'Rearranging pages is built into Preview on a Mac, but missing on Windows, iPhone and Android. Here is what works on every device.',
    keywords: ['how to reorder pdf pages', 'rearrange pages in a pdf', 'delete pages from a pdf', 'change pdf page order free', 'move pages in a pdf document'],
    updated: '2026-09-29',
    tools: ['reorder-pdf'],
    sections: [
      {
        h: 'On a Mac with Preview',
        p: [
          'Preview\'s sidebar (View, **Thumbnails**) shows every page, and dragging a thumbnail to a new position moves it, while selecting a page and pressing delete removes it. Save the file afterward. This is one of the few built-in PDF viewers that supports rearranging pages directly.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'Edge\'s PDF reader can delete a page (right-click a thumbnail in the sidebar, **Delete**) but has no way to drag pages into a new order; reordering isn\'t supported in the built-in viewer at all.',
        ],
      },
      {
        h: 'On an iPhone or Android',
        p: [
          'Neither platform\'s Files app or default PDF viewer supports reordering or deleting individual pages from an existing PDF. This is a genuine gap on mobile, not a hidden setting.',
        ],
      },
      {
        h: 'A page thumbnail view that works on any device',
        p: [
          'Stayput\'s [reorder & delete pages](/tools/reorder-pdf) tool shows every page as a thumbnail, lets you drag them into a new order and remove the ones you don\'t need, then saves the result, directly in the browser without uploading the document. It works the same way on a phone or a computer, unlike Preview\'s drag-and-drop which is Mac-only.',
        ],
      },
    ],
    faq: [
      { q: 'Can I delete a page from a PDF without deleting others?', a: 'Yes, both Preview\'s sidebar and a dedicated page-management tool let you select and remove one page while leaving the rest of the document intact.' },
      { q: 'Can I reorder pages on an iPhone or Android?', a: 'Not with the built-in Files app or default PDF viewer on either platform; a browser-based tool that shows page thumbnails works the same way on mobile as on a computer.' },
      { q: 'Does reordering pages change their content?', a: 'No, it only changes the position of each page in the document; the text and images on each page stay exactly as they were.' },
      { q: 'Can I undo a page deletion after saving?', a: 'Once saved, the deleted page is gone from that file; keep a copy of the original PDF beforehand if there is any chance you\'ll need the removed page again.' },
    ],
  },
  {
    slug: 'how-to-add-music-to-a-video',
    title: 'How to Add Music or Audio to a Video',
    description: 'Putting a song, voice-over or sound effect onto a video, without losing the video quality, usually needs more than a phone camera roll. Here is what actually works.',
    heading: 'How to add music to a video',
    dek: 'Adding a soundtrack to an existing video is not something most camera rolls support directly. Here is what does the job.',
    keywords: ['how to add music to a video', 'add audio to a video free', 'put a song on a video', 'add background music to video online', 'replace video sound with music'],
    updated: '2026-09-29',
    tools: ['add-audio-to-video'],
    sections: [
      {
        h: 'Adding versus replacing',
        p: [
          'Adding audio to a video can mean two different things: mixing a new track (music, a voice-over) in alongside the video\'s existing sound, or replacing the original sound entirely with something else, such as swapping in a licensed song for a clip that had no usable audio.',
        ],
      },
      {
        h: 'On an iPhone or Android',
        p: [
          'The Photos app has no built-in way to add or swap a video\'s soundtrack. Some social apps (Instagram Reels, TikTok) let you add music at the point of posting, but that only applies within that app, not to a video file you can save and use elsewhere.',
        ],
      },
      {
        h: 'On a Mac with iMovie',
        p: [
          'iMovie can add an audio track: import the video into a project, drag a song or audio file onto the timeline below the video, and adjust its volume or fade. Export when done. This works well but requires building a small project for what might be a one-off edit.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'Clipchamp (built into recent versions of Windows) supports adding an audio track to a video timeline similarly to iMovie. There is no equivalent in the simpler Photos app video editor.',
        ],
      },
      {
        h: 'A direct tool for adding or swapping sound',
        p: [
          'Stayput\'s [add audio to video](/tools/add-audio-to-video) tool puts an MP3, WAV or M4A onto a video, or swaps in the audio from another clip, with options to mix or fully replace the original sound, loop a short track to match the video\'s length, and fade in or out, directly in the browser. The picture is copied over untouched, and nothing is uploaded.',
        ],
      },
    ],
    faq: [
      { q: 'Can I add music to a video without a full video editor?', a: 'Yes, a tool built specifically for adding or replacing audio skips the timeline, transitions and other features a full editor like iMovie or Clipchamp includes.' },
      { q: 'Can I keep the original sound and add music on top?', a: 'Yes, mixing keeps both the original audio and the new track together at whatever relative volume you set, rather than replacing one with the other.' },
      { q: 'What happens if my music track is shorter than the video?', a: 'A tool with a loop option repeats the track to fill the video\'s length; without it, the audio simply stops early and the rest of the video plays silent or on its original sound.' },
      { q: 'Does adding audio reduce video quality?', a: 'No, a well-built tool copies the video stream unchanged and only adds or replaces the separate audio track.' },
    ],
  },
  {
    slug: 'how-to-make-a-favicon',
    title: 'How to Make a Favicon (and the Other Icons a Website Needs)',
    description: 'A modern website needs more than a single favicon.ico: Apple touch icons, Android icons and a manifest file, each a different size. Here is how to generate the full set from one logo.',
    heading: 'How to make a favicon',
    dek: 'A modern site needs more than one favicon.ico; here is how to generate the whole set of icons from a single logo.',
    keywords: ['how to make a favicon', 'favicon generator free', 'create apple touch icon', 'favicon ico from png', 'website icon generator'],
    updated: '2026-09-29',
    tools: ['favicon-generator'],
    sections: [
      {
        h: 'Why one favicon.ico isn\'t enough anymore',
        p: [
          'Browsers, Apple\'s home-screen icon, Android\'s icon system and web app manifests each expect their own icon file, in different sizes and sometimes different formats: a classic .ico for browser tabs, PNGs at specific sizes for Apple touch icons and Android, and a site.webmanifest file describing them. Missing one means a blank or default icon in that context, even if the browser tab icon looks fine.',
        ],
      },
      {
        h: 'Making the source image',
        p: [
          'Whatever generates the icon set needs a single clean source image to start from, typically a square logo or mark at a reasonably high resolution (512px or larger works well), since every other size is produced by scaling down from it. A simple, high-contrast mark scales down more legibly than a detailed logo, which can turn into a blur at 16x16 pixels.',
        ],
      },
      {
        h: 'Doing it by hand',
        p: [
          'It is possible to resize a logo to each required size manually in any image editor and name the files correctly, but getting every size, format and the manifest file right (there are a dozen or so distinct files for full coverage) is tedious and easy to get subtly wrong, which shows up as a missing icon on just one platform.',
        ],
      },
      {
        h: 'A generator that produces the whole set at once',
        p: [
          'Stayput\'s [favicon generator](/tools/favicon-generator) tool takes one PNG, JPG or SVG logo and produces favicon.ico, the Apple touch icon, Android and maskable icons, and a site.webmanifest file, plus the HTML snippet to paste into a page\'s head, all generated in the browser without uploading the logo.',
        ],
      },
    ],
    faq: [
      { q: 'What size should my source logo be?', a: 'At least 512x512 pixels is a safe starting point, since every icon size needed is produced by scaling down from the source; starting too small means the largest generated icons will look soft.' },
      { q: 'Do I need a favicon.ico if I already have PNG icons?', a: 'Yes, some older browsers and contexts specifically look for favicon.ico by name, so it is still worth including alongside the newer PNG-based icons.' },
      { q: 'What is a maskable icon?', a: 'An Android-specific icon format with extra padding so the system can crop it into different shapes (circle, rounded square) without cutting off important parts of the logo.' },
      { q: 'Can I generate a favicon from an SVG logo?', a: 'Yes, an SVG source can be rasterized to each required PNG size, often with cleaner results than starting from an already-rasterized image.' },
    ],
  },
  {
    slug: 'how-to-get-a-color-code-from-an-image',
    title: 'How to Get a Color Code From an Image (Eyedropper)',
    description: 'Finding the exact hex or RGB code of a color you see in a photo needs an eyedropper tool, which most built-in photo viewers do not include. Here is what works, including on a phone.',
    heading: 'How to get a color code from an image',
    dek: 'Matching a color you see in a photo needs an eyedropper, which most photo viewers do not have built in. Here is what actually gets the exact code.',
    keywords: ['how to get color code from image', 'eyedropper tool online', 'find hex code from a photo', 'color picker from picture free', 'get rgb value from image'],
    updated: '2026-09-29',
    tools: ['color-picker'],
    sections: [
      {
        h: 'Why you can\'t just guess a color code',
        p: [
          'Two shades that look almost identical to the eye can have noticeably different hex codes, and matching a brand color, a paint swatch or a design element exactly needs a tool that samples the actual pixel value rather than a visual estimate.',
        ],
      },
      {
        h: 'On a Mac',
        p: [
          'The built-in Digital Color Meter app (in Applications, Utilities) shows the RGB value under the cursor anywhere on screen, including over an open image. It is accurate but shows raw values rather than a convenient hex code, and it is a separate app most people don\'t know exists.',
        ],
      },
      {
        h: 'On Windows',
        p: [
          'Windows has no built-in eyedropper for an arbitrary open image; the closest built-in option is the color picker inside Paint (choose the eyedropper tool, click a pixel, then check the color properties for its code), which requires opening the image in Paint specifically.',
        ],
      },
      {
        h: 'On an iPhone or Android',
        p: [
          'Neither platform\'s Photos app includes an eyedropper or color-code tool. Some design apps include one, but that means installing something just for an occasional lookup.',
        ],
      },
      {
        h: 'A browser eyedropper with a magnifier',
        p: [
          'Stayput\'s [color picker from image](/tools/color-picker) tool drops in a photo and shows a magnified view so you can point at the exact pixel, then copies its HEX, RGB or HSL code. It also extracts the image\'s main colors as a palette, and works the same way on a phone or a computer, all in the browser without uploading the photo.',
        ],
      },
    ],
    faq: [
      { q: 'What is the difference between HEX, RGB and HSL?', a: 'They are different ways of writing the same color: HEX is a six-digit code used mainly in web design, RGB gives separate red, green and blue values, and HSL describes hue, saturation and lightness, which is sometimes more intuitive for adjusting a shade.' },
      { q: 'Can I get a color code from a photo on my phone?', a: 'Yes, with a browser-based eyedropper tool; neither iPhone nor Android has a built-in way to do this from the Photos app.' },
      { q: 'How accurate is a screen color picker?', a: 'It reads the exact pixel value as displayed, which is accurate for that image and device, though the same color can render slightly differently across screens with different color calibration.' },
      { q: 'Can I get a full palette of colors from an image, not just one pixel?', a: 'Yes, a tool that extracts the main colors from an image gives a small palette representing its dominant shades, useful for matching a design to a photo\'s overall look.' },
    ],
  },
  {
    slug: 'smallpdf-alternative',
    title: 'A Free Smallpdf Alternative With No Daily Limit',
    description: 'Smallpdf\'s free plan caps you at two tasks a day; unlimited use needs a paid plan. Here is what that free limit actually looks like, and a browser-based alternative with no cap and no upload.',
    heading: 'A free Smallpdf alternative with no daily limit',
    dek: 'Smallpdf\'s free plan is genuinely limited, not just ad-supported. Here is what that limit looks like, and a way around it that never uploads your files at all.',
    keywords: ['smallpdf alternative', 'free smallpdf alternative', 'smallpdf alternative no limit', 'smallpdf free plan limit', 'smallpdf without sign up'],
    updated: '2026-09-29',
    tools: ['merge-pdf', 'split-pdf', 'compress-pdf', 'sign-pdf', 'unlock-pdf', 'protect-pdf', 'rotate-pdf', 'reorder-pdf', 'watermark-pdf', 'pdf-page-numbers', 'pdf-to-word'],
    sections: [
      {
        h: 'What Smallpdf does well',
        p: [
          'Smallpdf is a large, well-run PDF service with over 30 tools covering merging, splitting, compressing, converting, signing and more, plus a desktop and mobile app and team features for businesses. It is a legitimate, established product, not something to avoid on principle.',
        ],
      },
      {
        h: 'Why people look for an alternative',
        p: [
          'The free plan is capped: as of when this page was checked, Smallpdf limited free accounts to around two tasks a day, with unlimited use requiring a paid Pro plan (its pricing page listed Pro Personal starting around $15 a month). For an occasional user, hitting that daily cap mid-task, or being asked to subscribe just to merge a second PDF that day, is the usual reason to look elsewhere.',
          'The other factor is the upload itself: every Smallpdf tool sends your file to its servers to process it, however briefly it keeps it afterward. For details on Smallpdf\'s own file retention and privacy practices, see [Is Smallpdf safe?](/guides/is-smallpdf-safe).',
        ],
      },
      {
        h: 'What changes with a browser-based tool',
        p: [
          'Stayput\'s PDF tools run entirely inside the browser tab, so there is no server-side task to count and nothing to upload: [merge PDF](/tools/merge-pdf), [split PDF](/tools/split-pdf), [compress PDF](/tools/compress-pdf), [sign PDF](/tools/sign-pdf), [unlock PDF](/tools/unlock-pdf), [protect PDF](/tools/protect-pdf) with AES-256 encryption, [rotate PDF](/tools/rotate-pdf), [reorder and delete pages](/tools/reorder-pdf), [watermark PDF](/tools/watermark-pdf), [add page numbers](/tools/pdf-page-numbers) and [PDF to Word](/tools/pdf-to-word). There is no daily limit, no account, and no subscription, because processing a tenth PDF costs nothing more than processing the first.',
        ],
      },
      {
        h: 'Where Smallpdf still has the edge',
        p: [
          'Smallpdf\'s OCR-heavy conversions, its e-signature workflow with audit trails for legally binding signatures, team workspaces and some Office document conversions go beyond what a browser can currently do unassisted. If you need those specifically, Smallpdf (or its desktop app, which also avoids uploading) remains the more complete tool. For the everyday jobs above, a local tool with no limit is usually the simpler choice.',
        ],
      },
    ],
    faq: [
      { q: 'Is there a free Smallpdf alternative with no daily task limit?', a: 'Yes. A tool that processes PDFs entirely in the browser, like Stayput, has no per-day task count to hit, since there is no server-side job being metered.' },
      { q: 'Do I need to sign up to use a Smallpdf alternative?', a: 'Not for a browser-based tool: there is no account system because there is nothing stored on a server to attach an account to.' },
      { q: 'Does a no-upload PDF tool do everything Smallpdf does?', a: 'Not quite; heavier OCR conversions, legally binding e-signature workflows and team features are still easier on a service like Smallpdf, but merging, splitting, compressing, signing, unlocking, protecting, rotating, reordering, watermarking and numbering pages are covered.' },
      { q: 'Is a browser-based PDF tool actually free, or does it have hidden limits?', a: 'A tool that runs locally has no meaningful marginal cost per file, so there is no natural reason to cap daily use the way a server-based service, which pays for the compute, typically does.' },
    ],
  },
  {
    slug: 'ilovepdf-alternative',
    title: 'A Free iLovePDF Alternative With No Task Limits or Ads',
    description: 'iLovePDF\'s free tier limits document size and batch processing and shows ads; Premium removes both for a monthly fee. Here is a browser-based alternative with neither restriction.',
    heading: 'A free iLovePDF alternative with no task limits or ads',
    dek: 'iLovePDF\'s free tier works, but with limits on file size and batches, plus ads. Here is what changes with a tool that never uploads the file at all.',
    keywords: ['ilovepdf alternative', 'free ilovepdf alternative', 'ilovepdf alternative no ads', 'ilovepdf without limits', 'ilovepdf premium alternative free'],
    updated: '2026-09-29',
    tools: ['merge-pdf', 'split-pdf', 'compress-pdf', 'sign-pdf', 'unlock-pdf', 'protect-pdf', 'rotate-pdf', 'reorder-pdf', 'watermark-pdf', 'pdf-page-numbers'],
    sections: [
      {
        h: 'What iLovePDF does well',
        p: [
          'iLovePDF is one of the most popular PDF sites on the web, with a wide toolset covering merging, splitting, compressing, converting, signing and OCR, along with desktop and mobile apps. It is a legitimate, widely used service.',
        ],
      },
      {
        h: 'Why people look for an alternative',
        p: [
          'iLovePDF\'s free tier, as of when this page was checked, limited document size, batch processing and showed banner ads; removing those limits and the ads meant subscribing to Premium, listed on its pricing page at around €5 a month billed annually or €9 a month billed monthly. For someone who needs to merge or compress a PDF once in a while, paying a recurring fee just to skip a size cap or an ad is a common reason to look elsewhere.',
          'As with any upload-based service, there is also the file itself to consider: iLovePDF processes documents on its servers. Its own retention and security practices are covered separately in [Is iLovePDF safe?](/guides/is-ilovepdf-safe).',
        ],
      },
      {
        h: 'What changes with a browser-based tool',
        p: [
          'Stayput\'s PDF tools run inside the browser tab rather than on a server, so there is no file-size tier, no batch cap and no ads to work around: [merge PDF](/tools/merge-pdf), [split PDF](/tools/split-pdf), [compress PDF](/tools/compress-pdf), [sign PDF](/tools/sign-pdf), [unlock PDF](/tools/unlock-pdf), [protect PDF](/tools/protect-pdf), [rotate PDF](/tools/rotate-pdf), [reorder and delete pages](/tools/reorder-pdf), [watermark PDF](/tools/watermark-pdf) and [add page numbers](/tools/pdf-page-numbers) are all free with no daily count and no subscription.',
        ],
      },
      {
        h: 'Where iLovePDF still has the edge',
        p: [
          'iLovePDF\'s OCR, Office document conversion and legally binding e-signature workflow are more capable than what runs client-side today, and its desktop app is a reasonable private option if you need those specifically. For everyday merging, splitting, compressing, signing and organizing PDFs, a browser tool with no limits covers most of what people actually search for iLovePDF to do.',
        ],
      },
    ],
    faq: [
      { q: 'Is there a completely free iLovePDF alternative?', a: 'Yes. A browser-based PDF tool has no server-side task to limit or advertising to fund, so it can be free without a daily cap or a Premium tier.' },
      { q: 'Does a no-upload PDF tool have file size limits like iLovePDF\'s free plan?', a: 'Since the file is processed on your own device rather than a server with fixed resources, there is no per-plan file size ceiling to hit.' },
      { q: 'What does iLovePDF do that a browser tool cannot?', a: 'OCR-heavy conversions, Office document conversion and legally binding e-signature workflows remain more capable on a full service like iLovePDF; ordinary merging, splitting, compressing and signing are well covered locally.' },
      { q: 'Are there ads on a browser-based PDF tool?', a: 'A tool that costs nothing to run per file has less need to fund itself with advertising the way a free tier on a server-based service typically does.' },
    ],
  },
  {
    slug: 'cloudconvert-alternative',
    title: 'A Free CloudConvert Alternative for Everyday Files',
    description: 'CloudConvert\'s free plan is metered in conversion minutes per day, not files, which can run out unpredictably. Here is a browser-based alternative for common formats with no metering at all.',
    heading: 'A free CloudConvert alternative for everyday files',
    dek: 'CloudConvert measures its free tier in minutes, not files, which makes it hard to predict when you will hit the limit. Here is an alternative with nothing to meter.',
    keywords: ['cloudconvert alternative', 'free cloudconvert alternative', 'cloudconvert alternative no limit', 'cloudconvert free plan limit', 'cloudconvert without upload'],
    updated: '2026-09-29',
    tools: ['convert-image', 'heic-to-jpg', 'video-to-mp3', 'video-to-gif', 'audio-converter'],
    sections: [
      {
        h: 'What CloudConvert does well',
        p: [
          'CloudConvert supports an unusually wide range of formats, including many document, e-book, CAD and professional video and audio formats that a browser cannot decode on its own. It is a legitimate, established converter used by developers as well as everyday users, including through an API.',
        ],
      },
      {
        h: 'Why people look for an alternative',
        p: [
          'CloudConvert\'s free plan, as of when this page was checked, was metered in conversion minutes per day (around 25) rather than a simple file count, so the point at which you hit the limit depends on how long each conversion takes to run, not how many files you have converted. That makes the free tier harder to predict than a flat daily count, and paid usage is sold as packages or subscriptions of conversion minutes.',
          'It is also, like any converter of this kind, an upload-based service: your file is sent to its servers to be processed. Its stated retention and security practices are covered in [Is CloudConvert safe?](/guides/is-cloudconvert-safe).',
        ],
      },
      {
        h: 'What changes with a browser-based tool',
        p: [
          'For the formats browsers can already decode and encode, a local tool has nothing to meter: Stayput\'s [image converter](/tools/convert-image) handles JPG, PNG, WebP, HEIC, AVIF, TIFF and more, [HEIC to JPG](/tools/heic-to-jpg) covers iPhone photos, the [audio converter](/tools/audio-converter) handles MP3, WAV, FLAC, M4A and OGG, [Video to MP3](/tools/video-to-mp3) pulls sound out of a video, and [Video to GIF](/tools/video-to-gif) turns a clip into an animation. None of it counts against a daily minute budget, because there is no server-side conversion running at all.',
        ],
      },
      {
        h: 'Where CloudConvert still has the edge',
        p: [
          'CloudConvert\'s format coverage is genuinely broader: office documents, e-books, CAD files, and professional video and audio codecs that browsers cannot handle natively still need a server-based converter. For the common image, audio and video formats most people convert day to day, a browser tool avoids the minute-based limit entirely.',
        ],
      },
    ],
    faq: [
      { q: 'Why does CloudConvert\'s free plan run out at different times for different files?', a: 'Because its free tier is measured in conversion minutes rather than a file count, so a longer or more complex conversion uses up more of the daily allowance than a quick one.' },
      { q: 'Is there a free alternative to CloudConvert with no minute limit?', a: 'Yes, for common formats. A browser-based converter processes the file on your device, so there is no server time being metered against a daily budget.' },
      { q: 'Does a browser converter support as many formats as CloudConvert?', a: 'No, CloudConvert supports far more formats, including many document, e-book and professional media formats a browser cannot decode; for common image, audio and video formats, a browser tool covers the same ground with no limit.' },
      { q: 'Can I convert files without uploading them at all?', a: 'Yes, for formats the browser itself can read and write. Stayput\'s converters process the file on your device, and you can confirm it by switching on airplane mode after the page loads.' },
    ],
  },
  {
    slug: 'remove-bg-alternative',
    title: 'A Free remove.bg Alternative With No Resolution Cap',
    description: 'remove.bg\'s free tier only gives you a low-resolution result; full resolution needs paid credits. Here is a browser-based background remover with no resolution limit at all.',
    heading: 'A free remove.bg alternative with no resolution cap',
    dek: 'remove.bg\'s free result is capped at low resolution; the full-size image needs a paid credit. Here is a way to remove a background at full size for free.',
    keywords: ['remove.bg alternative', 'free remove.bg alternative', 'remove.bg alternative full resolution', 'remove.bg free high resolution', 'background remover no upload'],
    updated: '2026-09-29',
    tools: ['remove-background', 'make-background-transparent', 'white-background', 'blur-background'],
    sections: [
      {
        h: 'What remove.bg does well',
        p: [
          'remove.bg, owned by Canva, popularized instant AI background removal and produces clean cutouts on a wide range of photos, including tricky subjects like hair and fur. It is a legitimate, widely used tool.',
        ],
      },
      {
        h: 'Why people look for an alternative',
        p: [
          'The free result on remove.bg\'s website, as of when this page was checked, was capped at a low resolution (up to about 0.25 megapixels, roughly 625 by 400 pixels) for personal use; getting the full-resolution cutout back requires a paid credit, sold individually or through a monthly subscription. For anything beyond a small web thumbnail, such as a print, a listing photo or a portrait for a profile, the free tier\'s output is usually too small to use directly.',
          'Every remove.bg request also uploads the photo to its servers to run the cutout model. Its stated retention practices, including a detail about account uploads being used for AI training, are covered in [Is remove.bg safe?](/guides/is-remove-bg-safe).',
        ],
      },
      {
        h: 'What changes with a browser-based tool',
        p: [
          'Stayput\'s [background remover](/tools/remove-background) runs the cutout model (ISNet) directly in the browser using onnxruntime-web, so the output comes back at the photo\'s original resolution with no paid tier gating it, and the photo is never uploaded to produce the result. [Make background transparent](/make-background-transparent) and [white background](/white-background) apply the same cutout for a transparent PNG or a plain white backdrop, and [blur background](/blur-background) keeps the subject sharp while blurring everything behind it.',
        ],
      },
      {
        h: 'Where remove.bg still has the edge',
        p: [
          'remove.bg\'s model has been refined over years on a very large dataset and can handle some especially difficult edge cases (fine hair strands, motion blur, very low contrast subjects) more reliably than a smaller model that runs entirely in a browser tab. For most everyday product photos, portraits and pet pictures, a full-resolution local cutout with no fee is the more practical choice.',
        ],
      },
    ],
    faq: [
      { q: 'Is there a free way to remove a background at full resolution?', a: 'Yes. A background remover that runs the cutout model in your own browser has no reason to gate resolution behind a paid tier, since there is no server cost per image to recover.' },
      { q: 'Why does remove.bg give me a small image for free?', a: 'Its free tier on the website is limited to a low resolution for personal use; the full-size result requires a paid credit or subscription, according to its pricing page.' },
      { q: 'Does a browser-based background remover work as well as remove.bg?', a: 'For most everyday photos, yes; remove.bg\'s model can have an edge on especially difficult cases like very fine hair or low-contrast subjects, refined over a larger dataset.' },
      { q: 'Is my photo uploaded to remove a background locally?', a: 'No. A tool that runs the cutout model in the browser processes the image on your device; you can confirm this with the browser\'s network panel or by trying it in airplane mode after the page loads.' },
    ],
  },
  {
    slug: 'convertio-alternative',
    title: 'A Free Convertio Alternative With No File Size Cap',
    description: 'Convertio\'s free plan limits files to 100MB and 10 conversions a day. Here is what that looks like, and a browser-based alternative with neither limit for common formats.',
    heading: 'A free Convertio alternative with no file size cap',
    dek: 'Convertio\'s free plan caps both file size and how many conversions you get per day. Here is an alternative with no such ceiling.',
    keywords: ['convertio alternative', 'free convertio alternative', 'convertio alternative no limit', 'convertio free plan limit', 'convertio without upload'],
    updated: '2026-09-29',
    tools: ['convert-image', 'heic-to-jpg', 'video-to-mp3', 'image-to-pdf', 'audio-converter'],
    sections: [
      {
        h: 'What Convertio does well',
        p: [
          'Convertio supports a very wide range of file types across documents, images, audio, video and archives, with a simple drag-and-drop interface. It is a legitimate, widely used converter run by Convertio Limited.',
        ],
      },
      {
        h: 'Why people look for an alternative',
        p: [
          'Convertio\'s free plan, as of when this page was checked, capped files at 100MB and limited free accounts to around 10 conversions a day; going beyond either meant a paid plan, with its lowest tier listed around $9.99 a month for a higher daily count and larger files, up to a top tier that removes the daily cap entirely. A single large video or archive can hit the 100MB ceiling on its own, well before the conversion count matters.',
          'It is also, like any converter of this kind, an upload-based service. Its stated file-handling and retention practices are covered separately in [Is Convertio safe?](/guides/is-convertio-safe).',
        ],
      },
      {
        h: 'What changes with a browser-based tool',
        p: [
          'For formats a browser can already decode and encode, there is no file to upload and nothing to count: Stayput\'s [image converter](/tools/convert-image) handles JPG, PNG, WebP, HEIC, AVIF, TIFF and more with no size ceiling other than what your device can hold in memory, [HEIC to JPG](/tools/heic-to-jpg) covers iPhone photos, [image to PDF](/tools/image-to-pdf) turns photos into documents, the [audio converter](/tools/audio-converter) handles MP3, WAV, FLAC, M4A and OGG, and [Video to MP3](/tools/video-to-mp3) extracts a soundtrack.',
        ],
      },
      {
        h: 'Where Convertio still has the edge',
        p: [
          'Convertio\'s format coverage extends well beyond what a browser can read natively, including many document, e-book, archive and specialist formats. For a common image, audio or video conversion where the file is a reasonable size, a browser tool sidesteps both the size cap and the daily count entirely.',
        ],
      },
    ],
    faq: [
      { q: 'Is there a free Convertio alternative with no file size limit?', a: 'Yes, for formats a browser can already handle. A tool that converts locally has no server-side size tier to enforce, so the practical limit is only what your device can process.' },
      { q: 'How many free conversions does Convertio allow per day?', a: 'Its free plan, as of when this page was checked, allowed around 10 conversions a day, with paid tiers raising that count and the 100MB file size cap.' },
      { q: 'Does a browser converter support as many formats as Convertio?', a: 'No, Convertio covers many more file types, particularly documents, e-books and archives; for common image, audio and video formats, a browser tool matches it with no limit.' },
      { q: 'Can I convert a large file without hitting a size cap?', a: 'For formats the browser can decode locally, size is limited only by your device\'s memory, not a fixed plan tier the way an upload-based converter enforces.' },
    ],
  },
  {
    slug: 'zamzar-alternative',
    title: 'A Free Zamzar Alternative With No Daily Limit',
    description: 'Zamzar\'s free plan allows just two conversions a day with a 50MB file cap. Here is what that looks like, and a browser-based alternative with neither restriction.',
    heading: 'A free Zamzar alternative with no daily limit',
    dek: 'Zamzar\'s free plan is one of the tightest around: two conversions a day, 50MB per file. Here is an alternative with no such cap.',
    keywords: ['zamzar alternative', 'free zamzar alternative', 'zamzar alternative no limit', 'zamzar free plan limit', 'zamzar without upload'],
    updated: '2026-09-29',
    tools: ['convert-image', 'compress-image', 'video-to-mp3', 'pdf-to-image'],
    sections: [
      {
        h: 'What Zamzar does well',
        p: [
          'Zamzar has converted files online since 2006 and covers a large number of formats, with an API for developers and no third-party advertising on its site, which avoids the fake-download-button problem common on free converters. It is a long-running, legitimate service run by Zamzar Limited.',
        ],
      },
      {
        h: 'Why people look for an alternative',
        p: [
          'Zamzar\'s free plan, as of when this page was checked, was notably tight: about two conversions within any 24-hour period, and a 50MB cap per file. Paid plans, listed from around $12 a month, raise those limits substantially. For anyone converting more than a couple of files in a day, or a single file over 50MB, the free tier runs out quickly.',
          'As with any upload-based converter, the file also spends time on Zamzar\'s servers to be processed; its retention practices (including a seven-day storage window for free conversions) are covered in [Is Zamzar safe?](/guides/is-zamzar-safe).',
        ],
      },
      {
        h: 'What changes with a browser-based tool',
        p: [
          'A browser-based converter has no daily count and no server-side file size tier: Stayput\'s [image converter](/tools/convert-image) and [compress image](/tools/compress-image) handle JPG, PNG, WebP, HEIC and more, [PDF to image](/tools/pdf-to-image) turns pages into JPG or PNG, and [Video to MP3](/tools/video-to-mp3) pulls out a soundtrack. Converting a tenth file in a day, or a file well over 50MB, costs nothing extra because there is no server job being metered.',
        ],
      },
      {
        h: 'Where Zamzar still has the edge',
        p: [
          'Zamzar\'s broader format support and its API for automated conversions go beyond what a browser tool offers. For everyday image, PDF and audio conversions, especially more than two a day, a browser-based tool with no cap is the more practical option.',
        ],
      },
    ],
    faq: [
      { q: 'How many free conversions does Zamzar allow per day?', a: 'Its free plan, as of when this page was checked, allowed about two conversions within a 24-hour period, with a 50MB file size cap.' },
      { q: 'Is there a Zamzar alternative with no daily conversion limit?', a: 'Yes, for common formats. A browser-based converter processes files on your device, so there is no per-day count to run out of.' },
      { q: 'Can I convert a file bigger than 50MB for free?', a: 'With a tool that converts in the browser, file size is limited by your device\'s memory rather than a fixed plan tier.' },
      { q: 'Does Zamzar have ads?', a: 'According to its privacy policy, zamzar.com does not host third-party advertising, though it does use Google Analytics.' },
    ],
  },
  {
    slug: 'freeconvert-alternative',
    title: 'A Free FreeConvert Alternative With No Processing Time Cap',
    description: 'FreeConvert\'s free plan is generous on file size but caps processing at 5 minutes per file. Here is what that looks like, and a browser-based alternative with no such cap.',
    heading: 'A free FreeConvert alternative with no processing time cap',
    dek: 'FreeConvert\'s free plan allows large files, but each one only gets 5 minutes of processing time. Here is an alternative with nothing to time out.',
    keywords: ['freeconvert alternative', 'free freeconvert alternative', 'freeconvert alternative no limit', 'freeconvert free plan limit', 'freeconvert without upload'],
    updated: '2026-09-29',
    tools: ['convert-image', 'compress-image', 'video-to-gif', 'video-to-mp3'],
    sections: [
      {
        h: 'What FreeConvert does well',
        p: [
          'FreeConvert.com, operated by TRMedia Inc., supports a wide range of formats and, compared to many competitors, is relatively generous with free-tier file size, reportedly allowing files up to around 1GB. It is a legitimate, widely used converter.',
        ],
      },
      {
        h: 'Why people look for an alternative',
        p: [
          'The catch on FreeConvert\'s free plan, as of when this page was checked, was a processing time cap of about 5 minutes per file, alongside a daily conversion count around 25; a large or complex file that needs longer than 5 minutes to process can fail or get cut off on the free tier, and its Pro plan (around $9.99 a month) removes the time limit and raises the file size ceiling further.',
          'It is also an upload-based service, sending your file to its servers for the full duration of that processing window. Its stated retention practices are covered in [Is FreeConvert safe?](/guides/is-freeconvert-safe).',
        ],
      },
      {
        h: 'What changes with a browser-based tool',
        p: [
          'A tool that converts inside your browser has nothing to time out, because there is no shared server queue: Stayput\'s [image converter](/tools/convert-image) and [compress image](/tools/compress-image) handle common image formats, [Video to GIF](/tools/video-to-gif) turns clips into animations, and [Video to MP3](/tools/video-to-mp3) extracts audio, all limited only by your own device\'s speed, not a fixed processing window.',
        ],
      },
      {
        h: 'Where FreeConvert still has the edge',
        p: [
          'FreeConvert covers document, e-book and archive formats a browser cannot read natively, and its generous size allowance on paid tiers suits very large files that need server-grade processing power. For common image, audio and video conversions, a browser tool avoids the processing-time cap entirely.',
        ],
      },
    ],
    faq: [
      { q: 'Why does my FreeConvert conversion fail or time out?', a: 'Its free plan, as of when this page was checked, capped processing at around 5 minutes per file; a large or complex file that needs longer can fail to finish on the free tier.' },
      { q: 'Is there a FreeConvert alternative with no time limit?', a: 'Yes, for common formats. A browser-based converter runs at the speed of your own device with no shared processing queue to be timed out of.' },
      { q: 'How big a file can I convert for free with FreeConvert?', a: 'Its free plan, as of when this page was checked, allowed files up to around 1GB, though the 5-minute processing cap can still cut off a large or complex conversion before it finishes.' },
      { q: 'Does a browser converter have ads like FreeConvert?', a: 'A tool with no server cost per conversion has less need to fund itself with advertising the way a free tier on an upload-based service typically does.' },
    ],
  },
  {
    slug: 'pdf24-alternative',
    title: 'A PDF24 Alternative That Works on Any Device Without Uploading',
    description: 'PDF24\'s free online tools have no size limits, but they still upload your PDF to a server; its private offline option, PDF24 Creator, is Windows only. Here is an alternative that works anywhere without uploading.',
    heading: 'A PDF24 alternative that works on any device without uploading',
    dek: 'PDF24 itself recommends its offline app for privacy, but that app is Windows only. Here is an alternative that skips the upload on any device.',
    keywords: ['pdf24 alternative', 'pdf24 alternative mac', 'pdf24 without upload', 'pdf24 alternative no install', 'pdf24 creator alternative'],
    updated: '2026-09-29',
    tools: ['merge-pdf', 'compress-pdf', 'split-pdf', 'unlock-pdf', 'rotate-pdf', 'reorder-pdf'],
    sections: [
      {
        h: 'What PDF24 does well',
        p: [
          'PDF24, run by Geek Software GmbH in Germany, has offered free PDF tools since 2006, and as of when this page was checked its online tools carried no file size or task limits, which is unusually generous compared to most free converters. It is a legitimate, long-running service.',
        ],
      },
      {
        h: 'Why people look for an alternative',
        p: [
          'PDF24\'s own homepage points out the trade-off itself: the online tools process files on its servers, and for more privacy it recommends PDF24 Creator, a desktop app where files stay on your PC. The catch is that PDF24 Creator is Windows-only, so it is not an option on a Mac, a Chromebook, a phone or a locked-down work laptop, which is exactly where people go looking for an alternative.',
          'PDF24\'s stated retention and security practices for the online tools are covered in [Is PDF24 safe?](/guides/is-pdf24-safe).',
        ],
      },
      {
        h: 'What changes with a browser-based tool',
        p: [
          'Stayput\'s PDF tools run inside the browser tab itself, so there is no upload regardless of device: [merge PDF](/tools/merge-pdf), [split PDF](/tools/split-pdf), [compress PDF](/tools/compress-pdf), [unlock PDF](/tools/unlock-pdf), [rotate PDF](/tools/rotate-pdf) and [reorder and delete pages](/tools/reorder-pdf) all work the same way on Windows, Mac, Linux, Chromebooks and phones, without installing anything.',
        ],
      },
      {
        h: 'Where PDF24 still has the edge',
        p: [
          'PDF24\'s toolbox is larger, including OCR, Office conversions and a virtual PDF printer available in Creator on Windows. If you are on Windows and need those specifically, Creator remains a solid private choice; for the everyday jobs above, on any device, a browser tool matches PDF24\'s no-limit approach without the upload or the install.',
        ],
      },
    ],
    faq: [
      { q: 'Is PDF24 Creator available for Mac?', a: 'No, PDF24 Creator is Windows-only; on other platforms, PDF24\'s online tools upload the file to its servers instead.' },
      { q: 'Does PDF24\'s online version have file size limits?', a: 'As of when this page was checked, PDF24 stated no artificial usage limits on its free online tools, unlike most competing converters.' },
      { q: 'Is there a way to edit PDFs privately on a Mac or phone?', a: 'Yes, a tool that runs inside the browser, such as Stayput\'s PDF tools, processes the file on your device without uploading it, on any platform.' },
      { q: 'Why does PDF24 recommend its desktop app over the website?', a: 'Its own homepage explains that the online tools process files on its servers, while the desktop app keeps everything on your own PC, which it frames as the more private option.' },
    ],
  },
  {
    slug: 'ezgif-alternative',
    title: 'A Free Ezgif Alternative With No File Size Cap',
    description: 'Ezgif caps uploads at 200MB and shows ads around the download. Here is a browser-based GIF alternative with no size cap and nothing to click around.',
    heading: 'A free ezgif alternative with no file size cap',
    dek: 'Ezgif caps how big a file you can upload and runs ads around the result. Here is an alternative with neither.',
    keywords: ['ezgif alternative', 'free ezgif alternative', 'ezgif alternative no ads', 'ezgif file size limit', 'gif maker without upload'],
    updated: '2026-09-29',
    tools: ['video-to-gif', 'gif-to-mp4', 'crop-image', 'compress-image'],
    sections: [
      {
        h: 'What ezgif does well',
        p: [
          'Ezgif.com, run by Open Idea in Latvia, has been one of the most popular free GIF editors for years, with frame-by-frame editing, effects and text overlays that go beyond simple conversion. It is a legitimate, long-running tool.',
        ],
      },
      {
        h: 'Why people look for an alternative',
        p: [
          'Ezgif is upload-based: as of when this page was checked, it capped uploads at 200MB (with some individual tools limited lower, around 100MB), which a longer or higher-resolution video can exceed easily. It is also ad-supported, and on ad-funded download sites the recurring complaint is a large advertisement styled to look like the actual download button.',
          'Its stated retention practices, including a roughly one-hour deletion window after last use, are covered in [Is ezgif safe?](/guides/is-ezgif-safe).',
        ],
      },
      {
        h: 'What changes with a browser-based tool',
        p: [
          'Stayput\'s [Video to GIF](/tools/video-to-gif) turns MP4, MOV and WebM clips into GIFs directly on your device, [GIF to MP4](/tools/gif-to-mp4) goes the other way, and [crop image](/tools/crop-image) and [compress image](/tools/compress-image) handle stills, all with no upload size cap beyond what your device can hold in memory, and no advertising around the result.',
        ],
      },
      {
        h: 'Where ezgif still has the edge',
        p: [
          'Ezgif\'s frame-by-frame GIF editing, text overlays and effects are more specialized than what a browser conversion tool offers. For turning a clip into a GIF or back, or basic image edits, a browser tool with no size cap and no ads covers the common case.',
        ],
      },
    ],
    faq: [
      { q: 'What is ezgif\'s file size limit?', a: 'As of when this page was checked, ezgif capped uploads at 200MB, with some individual tools limited to around 100MB.' },
      { q: 'Is there a GIF maker with no upload size limit?', a: 'Yes, for video-to-GIF conversion specifically. A tool that encodes the GIF in your browser is limited by your device\'s memory rather than a fixed upload cap.' },
      { q: 'Does ezgif have ads?', a: 'Yes, the site is ad-supported; the usual advice is to use the download link directly under the result rather than a large advertisement styled as a button.' },
      { q: 'Can I make a GIF without uploading the video?', a: 'Yes, a browser-based converter like Stayput\'s Video to GIF processes the clip on your device; switching on airplane mode after the page loads confirms it keeps working.' },
    ],
  },
  {
    slug: 'how-to-transcribe-audio-to-text',
    title: 'How to Transcribe Audio to Text (iPhone, Android, Windows, Mac)',
    description: 'Turning a recording into text used to mean typing it out by hand or paying per minute. Here is how to transcribe audio on each platform, plus a free browser tool with no upload and no per-minute charge.',
    heading: 'How to transcribe audio to text',
    dek: 'Every platform has a way to turn speech into text now, at very different prices. Here is what each one offers, and a free option that never uploads the recording.',
    keywords: ['how to transcribe audio to text', 'transcribe audio to text free', 'transcribe audio to text iphone', 'how to transcribe an interview', 'voice memo to text'],
    updated: '2026-09-30',
    tools: ['transcribe', 'video-to-subtitles', 'mp3-to-text'],
    sections: [
      {
        h: 'What you are choosing between',
        p: [
          'An interview, a lecture, a voice memo or a meeting recording all turn into text the same way underneath: a speech-recognition model listens and writes down what it hears. Where that model runs, and who pays for it, is what actually differs between the options below: on the device for free, in the cloud for a subscription, or by a person for a fee.',
        ],
      },
      {
        h: 'On an iPhone',
        p: [
          'The Voice Memos app transcribes its own recordings automatically on-device (iOS 17 and later): open the recording and tap the transcript icon. It only works for audio recorded in Voice Memos itself, not a file someone sent you, and there is no SRT or VTT export for video captions. Live Speech and Dictation cover live transcription while you talk, not an existing file.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'Google\'s Recorder app (on Pixel and some other phones) transcribes as you record and lets you search the text afterward, on-device. Outside Recorder, Android has no system-wide "transcribe this file" option; Google Docs voice typing only works live through the microphone, not on an existing recording.',
        ],
      },
      {
        h: 'On Windows or a Mac',
        p: [
          'Word\'s **Transcribe** feature (Microsoft 365, in Word on the web) uploads the file to Microsoft and returns text with speaker labels, with a monthly transcription-minutes cap on most plans. Apps like Otter.ai and Rev do the same over the web, priced by the minute or by a subscription tier; Rev\'s human transcription is more accurate for difficult audio but costs several dollars per minute.',
        ],
      },
      {
        h: 'Transcribing without uploading or paying per minute',
        p: [
          'Stayput\'s [transcribe](/tools/transcribe) tool runs Whisper, OpenAI\'s speech-recognition model, directly in the browser tab: drop an MP3, WAV, M4A, MP4 or MOV file, and the model downloads once and then works entirely on your device. It writes plain text, or timed [SRT subtitles](/video-to-subtitles) and WebVTT captions for a video, in over a dozen languages, with no per-minute cost and no upload of the recording itself.',
          'It does not label who is speaking, and it struggles with the same things every automatic transcriber does: heavy accents, overlapping speech, and specialist terms. For a recording where the wording actually matters, read the result against the audio before using it.',
        ],
      },
    ],
    faq: [
      { q: 'Can I transcribe audio for free without a time limit?', a: 'Yes, with a tool that runs the speech model in the browser rather than metering server time; Stayput\'s transcribe tool has no per-minute cost because nothing is processed on a server.' },
      { q: 'How accurate is automatic transcription?', a: 'Clear speech in a widely spoken language comes out well. Strong accents, background noise, crosstalk and technical vocabulary reduce accuracy with any automatic transcriber, free or paid.' },
      { q: 'Does transcribing a recording upload it anywhere?', a: 'With cloud services like Word\'s Transcribe or Otter.ai, yes, the audio is sent to their servers. A browser-based tool that runs the model on your device, like Stayput\'s, never uploads the file.' },
      { q: 'Can I get subtitles, not just plain text?', a: 'Yes. Stayput\'s transcribe tool can output SRT subtitles or WebVTT captions timed to the speech, ready to load into a video editor or a web page.' },
    ],
  },
  {
    slug: 'how-to-add-subtitles-to-a-video',
    title: 'How to Add Subtitles to a Video (Free, No Watermark)',
    description: 'Auto captions on TikTok and YouTube style tools often watermark the free tier or cap the length. Here is how burned-in subtitles work, and a browser tool that writes and burns them in for free.',
    heading: 'How to add subtitles to a video',
    dek: 'Captions written from the speech and burned into the picture, without a watermark or a length cap. Here is how, and a tool that does both steps on your own device.',
    keywords: ['how to add subtitles to a video', 'add subtitles to video free', 'burn subtitles into video', 'auto caption video free no watermark', 'add captions to video'],
    updated: '2026-09-30',
    tools: ['add-subtitles-to-video', 'auto-caption-video', 'burn-subtitles-into-video'],
    sections: [
      {
        h: 'Soft subtitles vs burned-in captions',
        p: [
          'A subtitle file (SRT or VTT) is a separate track a player can turn on or off, the way Netflix or YouTube captions work. Burned-in (or "hardcoded" and "open") captions are drawn directly into the video frames, so they show on any player, including Instagram, TikTok and a video sent as a plain file, with no viewer setting to toggle. Social platforms need the burned-in kind because their own players do not read an attached SRT reliably.',
        ],
      },
      {
        h: 'Editing apps and their free-tier catches',
        p: [
          'CapCut, Premiere Pro and DaVinci Resolve can all auto-caption and burn in subtitles. CapCut\'s free tier is the most accessible on a phone, but exporting without its watermark, and some caption styles, sit behind CapCut Pro. Premiere and Resolve have no watermark but need buying or learning a full editor for what is otherwise a single, short task.',
        ],
      },
      {
        h: 'Web-based auto-caption tools',
        p: [
          'Kapwing, VEED and similar web tools auto-caption from the speech and are quick to use, but most cap free exports at a short length (often under a minute), add a watermark, or both, with the unlocked version behind a monthly subscription.',
        ],
      },
      {
        h: 'Captioning without a watermark or length cap',
        p: [
          'Stayput\'s [add subtitles to video](/tools/add-subtitles-to-video) tool writes the captions itself, using the same on-device Whisper model as the [transcribe](/tools/transcribe) tool, or burns in an SRT or VTT file you already have, and draws them into the video with a choice of three caption styles. It runs entirely in the browser tab, so there is no length cap beyond what your device can hold in memory, no watermark, and no upload of the video.',
        ],
      },
    ],
    faq: [
      { q: 'What is the difference between subtitles and captions burned in?', a: 'Subtitles are a separate file a player can switch on or off. Burned-in captions are part of the video image itself, so they show up everywhere, which is what most social platforms need.' },
      { q: 'Can I add subtitles to a video for free with no watermark?', a: 'Yes, with a tool that processes the video in your browser rather than a server, since there is no hosting cost to recover with a watermark or a paid tier.' },
      { q: 'Do auto-captions need an internet connection?', a: 'A browser-based tool downloads its speech model once and then works offline; a cloud-based captioning site needs a connection for every video.' },
      { q: 'Can I burn in subtitles I already wrote as an SRT file?', a: 'Yes. Stayput\'s add subtitles tool accepts an existing SRT or VTT file and burns those exact captions into the video instead of generating new ones from the speech.' },
    ],
  },
  {
    slug: 'how-to-remove-vocals-from-a-song',
    title: 'How to Remove Vocals From a Song for Karaoke',
    description: 'Removing vocals used to mean finding a rare instrumental version. AI source separation now does it from any song. Here is how it works and a free browser tool with no upload.',
    heading: 'How to remove vocals from a song',
    dek: 'AI vocal removers pull the voice out of almost any song now, not just tracks with a lucky stereo mix. Here is how they work, and a free browser-based one.',
    keywords: ['how to remove vocals from a song', 'vocal remover free', 'make a song instrumental', 'karaoke maker online free', 'acapella extractor'],
    updated: '2026-09-30',
    tools: ['vocal-remover', 'karaoke-maker', 'acapella-extractor'],
    sections: [
      {
        h: 'Why "reduce the centre channel" mostly does not work anymore',
        p: [
          'The old trick, cancelling the parts identical in both stereo channels, only works on songs mixed with vocals dead-centre and nothing else sharing that spot, and it usually dulls the bass and drums along with the voice. Most modern songs are not mixed that forgivingly, so this method quietly went from a common tip to a mostly unreliable one.',
        ],
      },
      {
        h: 'What AI source separation does instead',
        p: [
          'A source-separation model, the kind used by apps like Ultimate Vocal Remover and vocalremover.org, is trained on thousands of songs to recognize what a human voice sounds like versus instruments, and can pull one out of an ordinary stereo (or even mono) mix without relying on how it was panned. It is the same category of technology used to make karaoke tracks and acapellas from songs that never had separate stems released.',
        ],
      },
      {
        h: 'Where the free web tools fall short',
        p: [
          'Sites like vocalremover.org and similar free separators typically cap the file length or size, queue you behind other users, or upload the song to run the separation, which is a real concern for an unreleased demo or a client\'s stems. Reverb, heavily processed vocals and dense mixes also trip up any separation model, free or paid.',
        ],
      },
      {
        h: 'Separating a song without uploading it',
        p: [
          'Stayput\'s [vocal remover](/tools/vocal-remover) runs UVR-MDX-NET Inst HQ 3, one of the models behind Ultimate Vocal Remover, directly in the browser: drop a song and get the [instrumental for karaoke](/karaoke-maker), the [isolated vocals as an acapella](/acapella-extractor), or both, with no file uploaded and no queue. A computer with WebGPU (recent Chrome or Edge, or Safari 26) separates a song in well under its own length; without it, the CPU takes noticeably longer, and the tab needs to stay open until it finishes.',
        ],
      },
    ],
    faq: [
      { q: 'Can I remove vocals from any song?', a: 'Mostly, with an AI separation model. Heavy reverb, vocals mixed to sound like an instrument, and very dense or distorted mixes still leave some trace of voice behind.' },
      { q: 'Is there a free vocal remover with no upload?', a: 'Yes. A tool that runs the separation model in your browser, like Stayput\'s vocal remover, processes the song on your device instead of sending it to a server.' },
      { q: 'Can I use the instrumental I make this way?', a: 'For personal karaoke, practice and remixing your own songs, yes. The tool changes only the audio file, not who owns the underlying song, so publishing an instrumental or acapella of someone else\'s track still needs their permission.' },
      { q: 'Why does the separated vocal sound a bit thin or watery?', a: 'That artifact comes from the separation model itself, not the file format; it is more noticeable on tracks with heavy reverb or a dense mix, where the model has less to go on to isolate the voice cleanly.' },
    ],
  },
  {
    slug: 'how-to-remove-an-object-from-a-photo',
    title: 'How to Remove an Object From a Photo (Free, No App)',
    description: 'A stranger in the background, a bin, a wire or a date stamp can usually be painted out with an AI inpainting tool rather than cropped around. Here is how, on each platform and in the browser.',
    heading: 'How to remove an object from a photo',
    dek: 'Painting out an unwanted object usually beats cropping around it. Here is how to do it on your phone, and a free browser tool with no upload.',
    keywords: ['how to remove object from photo', 'remove object from photo free', 'remove person from photo', 'photo object eraser', 'magic eraser online free'],
    updated: '2026-09-30',
    tools: ['remove-object', 'magic-eraser', 'remove-person-from-photo'],
    sections: [
      {
        h: 'Why painting it out beats cropping',
        p: [
          'Cropping to cut out a stranger, a bin or a car in the background often ruins the framing or leaves too little of the actual subject. An inpainting tool instead paints over just that area with a plausible guess at what belongs there, based on the pixels around it, so the rest of the photo, including its framing, stays exactly as shot.',
        ],
      },
      {
        h: 'On an iPhone',
        p: [
          'The Photos app\'s **Clean Up** tool (iOS 18 and later, or Magic Eraser on older models with limited support) circles or brushes over an object and an on-device model fills it in, similar to Google\'s Magic Eraser. It works well for a single distinct object against a simple background and is built into every photo, no separate app needed.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'Google Photos\' **Magic Eraser** does the same job: tap suggested objects or draw around one, and it fills in the gap. On Pixel phones it runs on-device or in the cloud depending on the model; on other Android phones it usually needs a Google One subscription for full access.',
        ],
      },
      {
        h: 'On a computer, without an editor',
        p: [
          'Photoshop\'s **Generative Fill** and Lightroom\'s **Remove** tool do this well but need a Creative Cloud subscription. Free web tools like cleanup.pictures work for quick jobs but usually cap resolution or the number of free uses per day, and the photo is uploaded to their server to be processed.',
        ],
      },
      {
        h: 'Removing an object without uploading the photo',
        p: [
          'Stayput\'s [remove object from photo](/tools/remove-object) tool uses MI-GAN, a small open-source inpainting model, running as WebAssembly directly in the browser tab: paint over the thing to remove and it fills in the gap on your own device, with no account, no daily limit and no upload. It is best at objects on a background that repeats, like a person on a beach or a wire across the sky; a large object in front of something unique, like a face, comes back as a plausible blur rather than the real thing underneath.',
        ],
      },
    ],
    faq: [
      { q: 'Can I remove a person from a photo for free?', a: 'Yes, with an inpainting tool such as your phone\'s built-in eraser or a browser-based one like Stayput\'s, which paints over the person with a guess at what is behind them.' },
      { q: 'Does removing an object upload my photo anywhere?', a: 'Not with a tool that runs the inpainting model in your browser or on-device on your phone. Many free web tools do upload the photo to process it, so check before using one for a private picture.' },
      { q: 'Why does the filled-in area look smudged?', a: 'The model is guessing what belongs there from the surrounding pixels, so a smooth, repeating background (sky, grass, pavement) fills in convincingly, while a busy or unique background leaves a softer, less exact patch.' },
      { q: 'Can I remove more than one object?', a: 'Yes, one at a time. Painting and erasing a smaller area at a time generally gives a cleaner result than one large stroke covering several things.' },
    ],
  },
  {
    slug: 'how-to-make-a-pdf-searchable',
    title: 'How to Make a Scanned PDF Searchable (OCR, Free)',
    description: 'A scanned PDF is a picture of a page, so Ctrl+F finds nothing in it. Here is how OCR fixes that, and a free browser tool that does it with no upload and no page limit.',
    heading: 'How to make a scanned PDF searchable',
    dek: 'A scan is a photograph of paper, not text, which is why you cannot search it. Here is how OCR adds a text layer, and a free browser tool for it.',
    keywords: ['how to make a pdf searchable', 'ocr pdf free', 'make scanned pdf searchable', 'scanned pdf to text', 'pdf text recognition online'],
    updated: '2026-09-30',
    tools: ['ocr-pdf', 'make-pdf-searchable', 'scanned-pdf-to-text'],
    sections: [
      {
        h: 'Why a scanned PDF cannot be searched',
        p: [
          'A PDF made by scanning paper, or by photographing it with a scanning app, stores each page as an image, the same as a JPG would. A PDF reader can only search for text it actually contains, so pressing Ctrl+F on a scanned document finds nothing, however clearly the words are printed on the page.',
        ],
      },
      {
        h: 'What OCR actually changes',
        p: [
          'Optical character recognition (OCR) reads the letters in that image and places matching, invisible text exactly on top of where each word sits. The page still looks like the original scan, but a reader can now find, select and copy the words, because there is real text there for it to match against.',
        ],
      },
      {
        h: 'In Adobe Acrobat',
        p: [
          'Acrobat Pro\'s **Scan & OCR** tool does this well and keeps formatting closely, but it needs a paid Acrobat subscription; the free Acrobat Reader cannot add OCR text to a PDF, only read PDFs that already have it.',
        ],
      },
      {
        h: 'On a phone, while scanning',
        p: [
          'Apps like Adobe Scan and Microsoft Lens can OCR a page as part of scanning it, which is convenient for a fresh document but does nothing for a PDF you already have from somewhere else, such as an old scanned manual or a document someone emailed you.',
        ],
      },
      {
        h: 'Making an existing scan searchable without uploading it',
        p: [
          'Stayput\'s [OCR PDF](/tools/ocr-pdf) tool runs Tesseract, an open-source OCR engine, directly in the browser: drop a scanned PDF and it reads the text on your device, adds it invisibly over each page, and gives back a searchable PDF, with an option to also save the text as a plain .txt file. It reads English text; other Latin-alphabet languages are read with the English model and come out less accurately, and it does not yet read Cyrillic, Arabic or Asian scripts. Clean, straight, sharply printed pages read best; faint photocopies and pages photographed at an angle read worse, so scanning them with a [document scanner](/tools/document-scanner) first, which straightens and flattens the page, generally improves the result.',
        ],
      },
    ],
    faq: [
      { q: 'Why can\'t I search or copy text in a scanned PDF?', a: 'A scanned PDF stores each page as an image, not text, so there is nothing for a search or a copy command to match against until OCR adds a text layer.' },
      { q: 'Is there a free OCR tool with no page limit?', a: 'Yes, a browser-based one. Since Stayput\'s OCR PDF tool reads the pages on your device instead of a metered server, there is no natural reason to cap how many pages it processes.' },
      { q: 'Does OCR upload my document anywhere?', a: 'Cloud OCR services do send the file to their servers. A browser-based tool that runs the OCR engine locally, like Stayput\'s, keeps the PDF on your device the whole time.' },
      { q: 'Will OCR work on handwriting?', a: 'Poorly. OCR engines like Tesseract are trained mainly on printed text; handwriting recognition is a different, much harder problem and results are generally unreliable.' },
    ],
  },
  {
    slug: 'how-to-scan-a-document-with-your-phone',
    title: 'How to Scan a Document With Your Phone (No App)',
    description: 'iPhone and Android can both turn a photo of paper into a flat, clean scan, but the built-in tools are scattered across different apps. Here is where to find them, and a browser tool that needs no app at all.',
    heading: 'How to scan a document with your phone',
    dek: 'Both iPhone and Android can scan paper into a clean PDF without a dedicated app, if you know where to look. Here is where, plus a browser option for when you would rather not.',
    keywords: ['how to scan a document with your phone', 'scan document with iphone no app', 'scan paper to pdf android', 'phone photo to scanned pdf', 'document scanner online free'],
    updated: '2026-09-30',
    tools: ['document-scanner', 'scan-to-pdf', 'receipt-scanner'],
    sections: [
      {
        h: 'What separates a scan from a photo',
        p: [
          'A photo of a document shows the table around it, the page as a trapezoid because the phone was held at an angle, and the paper tinted grey or yellow by the room\'s light and your own shadow. A real scan corrects all three: it finds the page\'s edges, straightens them back into a rectangle, and evens out the lighting so the paper reads as flat white.',
        ],
      },
      {
        h: 'On an iPhone',
        p: [
          'The **Notes** app has a scanner built in: open a note, tap the camera icon, then **Scan Documents**. It detects the page automatically, lets you adjust the corners, and saves as a PDF or images you can share from Notes. Files app also has a **Scan Documents** option under its "+" menu, which saves straight to a folder instead of a note.',
        ],
      },
      {
        h: 'On Android',
        p: [
          'Google Drive has a built-in scanner: tap the **+** button, choose **Scan**, and it works the same way as the iPhone version, saving the result to Drive as a PDF. Samsung phones have a similar scanner inside Samsung Notes. Stock Android without either app has no system-wide scan option.',
        ],
      },
      {
        h: 'Dedicated scanner apps',
        p: [
          'Adobe Scan and CamScanner both scan well and add automatic text recognition, but push a subscription for features like unlimited pages, no watermark, or exporting to Word. For an occasional scan, that is more than most people need to pay for.',
        ],
      },
      {
        h: 'Scanning a photo you already took, without an app',
        p: [
          'Stayput\'s [document scanner](/tools/document-scanner) tool takes photos you have already taken (from your camera roll, not live camera capture) and does the same correction in the browser: it finds the page\'s edges, straightens it, and lifts the shadows so the result reads like it came off a flatbed scanner. It works for a [single receipt](/receipt-scanner) or a stack of pages combined into [one PDF](/scan-to-pdf), with a choice of black-and-white, greyscale or colour output, and no upload, account or watermark. It needs the paper to be lighter than the surface it sits on so it can find the corners; the tool says when it could not detect a page and falls back to the whole photo, cleaned up.',
        ],
      },
    ],
    faq: [
      { q: 'Can I scan a document on my iPhone without downloading an app?', a: 'Yes. The Notes app and the Files app both have a built-in Scan Documents option under their camera or "+" menu.' },
      { q: 'Does Android have a built-in document scanner?', a: 'Not system-wide on stock Android, but Google Drive\'s Scan option and Samsung Notes on Samsung phones both scan without a separate app.' },
      { q: 'How is a browser-based scanner different from a phone\'s built-in one?', a: 'A phone scanner uses the live camera; a browser tool like Stayput\'s works from photos you already took, which is useful when the pictures came from someone else or an older phone.' },
      { q: 'Can I turn several scanned photos into one PDF?', a: 'Yes. Stayput\'s document scanner combines multiple photos, in the order you drop them, into one PDF.' },
    ],
  },
  {
    slug: 'how-to-convert-epub-to-pdf',
    title: 'How to Convert EPUB to PDF (Free, No Email Required)',
    description: 'Some tools email you the file, cap the size, or need Calibre installed. Here is how to convert EPUB to PDF a few different ways, and a browser tool with none of those catches.',
    heading: 'How to convert EPUB to PDF',
    dek: 'A few tools do this conversion, each with a catch: an email delivery, a size cap, or an app to install. Here is a browser one with none of those.',
    keywords: ['how to convert epub to pdf', 'epub to pdf converter free', 'convert epub to pdf online free', 'epub to pdf no email', 'ebook to pdf converter'],
    updated: '2026-09-30',
    tools: ['epub-to-pdf', 'pdf-to-epub', 'pdf-to-kindle'],
    sections: [
      {
        h: 'Why convert an EPUB to PDF at all',
        p: [
          'An EPUB reflows to fit whatever screen it is on, which is ideal for reading, but that same flexibility makes it print inconsistently and awkward to annotate with a fixed page reference. A PDF fixes the layout in place, which is what a printer, a professor grading page numbers, or an annotation tool that expects stable pages actually needs.',
        ],
      },
      {
        h: 'With Calibre',
        p: [
          'Calibre, the free desktop ebook manager, converts EPUB to PDF with the most control over margins, fonts and page size, but it is a full application to install and learn, which is a lot for a single conversion.',
        ],
      },
      {
        h: 'Web converters',
        p: [
          'Sites like CloudConvert and various "epub to pdf" converters handle the format but usually cap the free file size or the number of conversions per day, and a few older ones ask for an email address to send the result to rather than downloading it directly.',
        ],
      },
      {
        h: 'Converting without installing anything or giving an email',
        p: [
          'Stayput\'s [EPUB to PDF](/tools/epub-to-pdf) tool unzips and lays out the book directly in the browser: chapters start on new pages, with page numbers and a contents page, in a choice of page size for reading (A5) or printing (A4 or Letter) at home. It works only on DRM-free EPUBs, the kind from Project Gutenberg, Standard Ebooks and many small publishers; a book bought from a store that locks its files cannot be converted by any tool without breaking that lock, which is illegal in many countries. Going the other way, [PDF to EPUB](/tools/pdf-to-epub) turns a PDF into a reflowable ebook for a [Kindle](/pdf-to-kindle), phone or e-reader, though it works on the text alone and drops pictures and tables, since an EPUB made from a PDF is built for reading the words on a small screen.',
        ],
      },
    ],
    faq: [
      { q: 'Can I convert an EPUB to PDF for free without an email?', a: 'Yes. A browser-based converter, like Stayput\'s EPUB to PDF, downloads the result directly with no email required and no server involved.' },
      { q: 'Does converting EPUB to PDF keep the pictures?', a: 'EPUB to PDF keeps pictures, since it is laying the same book out with fixed pages. Converting the other way, PDF to EPUB, drops pictures and tables because it extracts the text for reflow.' },
      { q: 'Can I convert a book I bought from an ebook store?', a: 'Only if it is DRM-free. Most store-bought ebooks are locked, and removing that lock is illegal in many places, so no legitimate converter, including this one, can convert them.' },
      { q: 'Why would I convert a PDF to EPUB instead of just reading the PDF?', a: 'A PDF has fixed pages, which are tiny or require panning around on a phone or e-reader; an EPUB reflows the text to fit the screen instead.' },
    ],
  },
  {
    slug: 'how-to-resize-an-image-to-exact-pixels',
    title: 'How to Resize an Image to Exact Pixels',
    description: 'A form or upload field that asks for an exact pixel size, like 1920x1080 or 512x512, needs more than a plain resize. Here is how to hit an exact size without stretching or cropping wrong, in the browser.',
    heading: 'How to resize an image to exact pixels',
    dek: 'Getting a photo to an exact width and height, not just smaller, needs a different setting than a normal resize. Here is how, with no software to install.',
    keywords: ['how to resize an image to exact pixels', 'resize image to exact pixels online', 'resize photo to exact dimensions', 'resize image to 1920x1080', 'resize image to 512x512'],
    updated: '2026-09-30',
    tools: ['resize-image', 'resize-image-to-1920x1080', 'resize-image-to-1024x1024'],
    sections: [
      {
        h: 'Why "resize" alone is not enough',
        p: [
          'Most resize tools, including phone Photos apps, scale an image down to fit inside a maximum width or height while keeping its original proportions. That is the right behavior for shrinking a photo for the web, but a field that asks for an exact size, such as a 1920x1080 banner or a 512x512 app icon, means the output must be precisely that width and height, whatever shape the source photo started as. A plain resize that respects the aspect ratio cannot hit an odd exact size on its own; the image has to be cropped, padded, or stretched to fit.',
        ],
      },
      {
        h: 'The three ways to force an exact size',
        p: [
          'There is more than one way to fill an exact box, and the right choice depends on whether cropping or distortion is the lesser problem for that photo:',
        ],
        list: [
          'Crop to fill: scale the image up until it covers the exact box, then cut off whatever hangs over the edges. No blank space, but some of the photo is lost at the sides or top and bottom.',
          'Fit inside with padding: scale the image down until it fits entirely inside the box, then fill the leftover space with a background colour (usually white or black). Nothing is cropped, but bars appear on two sides unless the source is already the right shape.',
          'Stretch: force the image to the exact width and height regardless of its original proportions, which distorts anything that is not already close to that shape.',
        ],
      },
      {
        h: 'In Photoshop or a phone editor',
        p: [
          'Photoshop\'s Image Size dialog can set exact pixel dimensions but needs the constrain-proportions box unchecked to avoid stretching, and does not crop or pad automatically, so getting a non-matching aspect ratio to look right still takes manual cropping first. Most phone editors only offer preset crop ratios (1:1, 4:5, 16:9), not an arbitrary exact pixel size.',
        ],
      },
      {
        h: 'Setting an exact size in the browser',
        p: [
          'Stayput\'s [resize image](/resize-image) tool has an **Exact size** mode: type the width and height you need, and choose whether a mismatched photo is cropped to fill, fit with padding, or stretched. Ready-made pages cover the sizes people ask for most, such as [1920 by 1080](/resize-image-to-1920x1080) for a banner or wallpaper and [1024 by 1024](/resize-image-to-1024x1024) for an app icon, with the exact size already set. Everything happens in the browser, so a batch of photos resizes at once with nothing uploaded.',
        ],
      },
    ],
    faq: [
      { q: 'What is the difference between resizing and cropping to an exact size?', a: 'Resizing to a maximum keeps the photo\'s original shape and only makes it smaller; forcing an exact size (like 1920x1080) usually needs cropping, padding or stretching, since the source photo is rarely already that exact shape.' },
      { q: 'Will resizing to an exact size distort my photo?', a: 'Only if you choose Stretch. Crop to fill and Fit with padding both keep the photo\'s proportions intact; they just handle the leftover space differently, by cutting it off or by adding a border.' },
      { q: 'Can I resize many photos to the same exact size at once?', a: 'Yes, with a browser tool like Stayput\'s resize image, which applies the same exact-size setting to every photo you drop.' },
      { q: 'Can this make a small image bigger to hit the exact size?', a: 'A plain resize does not enlarge, since upscaling invents pixels and looks soft; for a photo smaller than the target size, run it through an AI image upscaler first, then resize to the exact dimensions.' },
    ],
  },
  {
    slug: 'otter-ai-alternative',
    title: 'A Free Otter.ai Alternative With No Monthly Minute Cap',
    description: 'Otter.ai\'s free plan limits monthly transcription minutes and caps recording length; a Pro subscription lifts both for a monthly fee. Here is a browser-based alternative with neither limit.',
    heading: 'A free Otter.ai alternative with no monthly minute cap',
    dek: 'Otter.ai\'s free tier meters your minutes each month and caps how long a single recording can run. Here is what that looks like, and an alternative with nothing to meter.',
    keywords: ['otter.ai alternative', 'otter ai alternative free', 'free alternative to otter ai', 'otter ai alternative no limit', 'transcription app without subscription'],
    updated: '2026-09-30',
    tools: ['transcribe', 'video-to-subtitles', 'mp3-to-text'],
    sections: [
      {
        h: 'What Otter.ai does well',
        p: [
          'Otter.ai is a well-established transcription service with live transcription during meetings, speaker labels, and integrations with Zoom, Google Meet and Teams that go well beyond converting a single file. For ongoing meeting notes with speaker attribution, it does a job a plain file transcriber does not attempt.',
        ],
      },
      {
        h: 'Why people look for an alternative',
        p: [
          'Otter\'s free plan meters transcription in minutes per month, and, as of when this page was checked, capped a single recording\'s length; going over either needs a paid Pro or Business plan. For someone who wants to transcribe an occasional long interview or a batch of old voice memos, hitting a monthly cap partway through, or being capped on the length of one file, is the usual friction.',
        ],
      },
      {
        h: 'What changes with a browser-based tool',
        p: [
          'Stayput\'s [transcribe](/tools/transcribe) tool runs Whisper directly in the browser tab, so there is no monthly minute budget and no per-recording length cap beyond what your device can hold in memory: drop an MP3, WAV, M4A, MP4 or MOV file and it downloads the speech model once, then transcribes entirely on your device into plain text, [SRT subtitles for video](/video-to-subtitles), or WebVTT captions. There is no account and no subscription, because a tenth file costs nothing more to process than the first.',
        ],
      },
      {
        h: 'Where Otter.ai still has the edge',
        p: [
          'Otter\'s live meeting transcription, speaker labels, and calendar and video-call integrations are beyond what a single-file browser tool does. For transcribing files you already have, without a monthly limit, a local tool covers the common case.',
        ],
      },
    ],
    faq: [
      { q: 'What is Otter.ai\'s free plan limit?', a: 'As of when this page was checked, Otter\'s free plan metered transcription minutes per month and capped the length of a single recording, with a paid plan needed to lift either.' },
      { q: 'Is there a transcription tool with no monthly minute cap?', a: 'Yes. A tool that runs the transcription model in your browser, like Stayput\'s, has no server-side minutes to meter, so there is no natural reason to cap monthly use.' },
      { q: 'Does a free Otter.ai alternative include speaker labels?', a: 'Not the browser-based ones generally, including Stayput\'s: they write what was said, not who said it. Otter\'s speaker labelling remains an advantage for meeting notes specifically.' },
      { q: 'Can I get subtitles from an Otter.ai alternative?', a: 'Yes, Stayput\'s transcribe tool can output SRT subtitles or WebVTT captions timed to the speech, which Otter does not offer directly.' },
    ],
  },
  {
    slug: 'camscanner-alternative',
    title: 'A Free CamScanner Alternative With No Watermark',
    description: 'CamScanner\'s free tier watermarks PDFs and limits pages; unlocking both needs a subscription. Here is a browser-based scanning alternative with neither restriction.',
    heading: 'A free CamScanner alternative with no watermark',
    dek: 'CamScanner\'s free version puts a watermark on your scans and links a subscription to remove it. Here is a scanning alternative with no watermark to begin with.',
    keywords: ['camscanner alternative', 'camscanner alternative free', 'camscanner alternative no watermark', 'free document scanner no watermark', 'scan document without app'],
    updated: '2026-09-30',
    tools: ['document-scanner', 'scan-to-pdf', 'receipt-scanner'],
    sections: [
      {
        h: 'What CamScanner does well',
        p: [
          'CamScanner is one of the most downloaded scanning apps for a reason: fast page detection, built-in OCR, cloud sync across devices and batch scanning to one PDF. For scanning on the go from a phone camera, it is a capable, mature app.',
        ],
      },
      {
        h: 'Why people look for an alternative',
        p: [
          'As of when this page was checked, CamScanner\'s free tier stamped a watermark across every exported PDF and image, and capped features like OCR and batch export behind a subscription. For a one-off scan of a form or a receipt, paying monthly to remove a watermark from a single document feels disproportionate. CamScanner has also drawn scrutiny in the past over its handling of user data on some of its app versions, which matters for scanning IDs and personal documents.',
        ],
      },
      {
        h: 'What changes with a browser-based tool',
        p: [
          'Stayput\'s [document scanner](/tools/document-scanner) tool takes photos you have already taken and straightens, flattens and cleans them up entirely in the browser, with no watermark on the result at any tier, because there is no tier: [scan a stack of pages into one PDF](/scan-to-pdf) or [a single receipt](/receipt-scanner), in colour, greyscale or black-and-white, for free. Since nothing is uploaded, there is also nothing sent to a third-party server to scan an ID or a signed contract.',
        ],
      },
      {
        h: 'Where CamScanner still has the edge',
        p: [
          'CamScanner\'s live camera capture with instant edge detection while you are holding the phone over the page is more convenient in the moment than taking a photo first and then processing it in a browser. For occasional scans of photos you have already taken, though, a free tool with no watermark and no upload covers the job.',
        ],
      },
    ],
    faq: [
      { q: 'Does CamScanner put a watermark on free scans?', a: 'Yes, as of when this page was checked, CamScanner\'s free tier watermarked exported PDFs and images, with a subscription needed to remove it.' },
      { q: 'Is there a document scanner with no watermark and no subscription?', a: 'Yes. A browser-based scanner like Stayput\'s document scanner has no paid tier to gate a watermark behind, since it has no server cost to recover.' },
      { q: 'Is it safe to scan an ID or personal document without an app?', a: 'A tool that processes the photo entirely in your browser, without uploading it anywhere, avoids sending the document to any third-party server at all.' },
      { q: 'Can a browser scanner combine multiple pages into one PDF?', a: 'Yes, Stayput\'s document scanner combines several scanned photos, in the order you drop them, into a single PDF.' },
    ],
  },
  {
    slug: 'how-to-redact-a-pdf',
    title: 'How to Redact a PDF So the Text Is Actually Gone',
    description: 'A black box drawn over text in most PDF viewers only hides it visually; the words are still in the file underneath. Here is how real redaction works, and a free browser tool that removes the text itself.',
    heading: 'How to redact a PDF',
    dek: 'Painting a black rectangle over a name in a PDF usually just covers it, since the text is still selectable underneath. Here is how to actually delete it, for free, without uploading the document.',
    keywords: ['how to redact a pdf', 'redact pdf free', 'redact pdf online free', 'black out text in pdf', 'remove text from pdf permanently'],
    updated: '2026-09-30',
    tools: ['redact-pdf'],
    sections: [
      {
        h: 'Why a black box is not redaction',
        p: [
          'Drawing a black rectangle in a PDF viewer, or even in some "highlight" annotation tools, adds a shape on top of the page; the text underneath is untouched. Select-all-and-copy, or opening the file in a text editor, can still pull out a name, an account number or a social security number sitting right behind the box. Real redaction removes the underlying text and any image data at that spot, not just what is visible.',
        ],
      },
      {
        h: 'In Adobe Acrobat',
        p: [
          'Acrobat Pro has a dedicated **Redact** tool that marks text or areas for removal, then a separate **Apply** step that deletes the underlying content and can also search the whole document for a pattern, like every occurrence of a phone number. It does the job properly but needs a paid Acrobat subscription; the free Acrobat Reader has no redaction tool at all.',
        ],
      },
      {
        h: 'Government and legal redaction tools',
        p: [
          'Courts and agencies that handle sensitive documents often use dedicated redaction software, or the redaction feature built into case-management systems, because getting this wrong in a public filing has real consequences. For a one-off document, installing that kind of software is a lot of overhead.',
        ],
      },
      {
        h: 'Redacting without uploading the document',
        p: [
          'Stayput\'s [redact PDF](/tools/redact-pdf) tool works on the document in the browser tab: search for a word or number and it finds every match, or draw boxes by hand over anything else, like a signature or a photo. Confirming the redaction deletes the underlying text and image data at each marked spot before saving, not just draws over it, and the file is never uploaded to check it against a server-side pattern list.',
        ],
      },
    ],
    faq: [
      { q: 'Does drawing a black box in a PDF viewer count as redaction?', a: 'No. It only covers the text visually; selecting or copying the area, or opening the file in another program, can still reveal the text underneath unless it was actually deleted.' },
      { q: 'Can I redact a PDF for free without uploading it?', a: 'Yes. A browser-based redaction tool, like Stayput\'s, deletes the underlying text and image data on your device and never sends the document anywhere.' },
      { q: 'Can I search for a name and redact every occurrence at once?', a: 'Yes, Stayput\'s redact PDF tool can search the document for a word or number and mark every match for removal in one pass.' },
      { q: 'Can I redact something that is not text, like a signature?', a: 'Yes, by drawing a box over it by hand; the tool removes whatever image or text data sits under the box you draw, not only searchable text.' },
    ],
  },
  {
    slug: 'how-to-crop-a-pdf',
    title: 'How to Crop a PDF (Trim Margins or Cut to an Area)',
    description: 'A scanned page with wide white margins, or a PDF that needs just one part of each page kept, both need cropping rather than resizing. Here is how, free and without uploading the file.',
    heading: 'How to crop a PDF',
    dek: 'Trimming a PDF down to what matters, whether that is shrinking wide margins or cutting every page to one area, works differently from resizing. Here is how, in the browser.',
    keywords: ['how to crop a pdf', 'crop pdf free', 'crop pdf online free', 'trim pdf margins', 'cut pdf page to size'],
    updated: '2026-09-30',
    tools: ['crop-pdf'],
    sections: [
      {
        h: 'Cropping vs resizing a PDF',
        p: [
          'Resizing a PDF scales the whole page, content included, up or down to a new paper size. Cropping instead keeps the content at its original scale and simply changes which part of the page is kept, cutting off everything outside the box: wide margins, a header repeated on every page, or a sidebar you do not need. The two solve different problems and are often confused because both change the page\'s dimensions.',
        ],
      },
      {
        h: 'In Adobe Acrobat',
        p: [
          'Acrobat Pro\'s **Crop Pages** tool sets an exact crop box in inches or points, applied to one page, a range, or the whole document, with fine control over how many points to trim from each side. It needs a paid subscription, and the free Acrobat Reader has no crop tool.',
        ],
      },
      {
        h: 'Printing "shrink to fit" as a workaround',
        p: [
          'Printing a PDF to a virtual PDF printer with a smaller paper size crops or scales the page depending on the setting chosen, but it is an indirect way to do something a dedicated crop tool does in one step, and it is easy to end up scaling when you meant to crop, or the other way round.',
        ],
      },
      {
        h: 'Cropping in the browser',
        p: [
          'Stayput\'s [crop PDF](/tools/crop-pdf) tool draws a box over a preview of the page to keep, or trims the white margins from every page automatically in one click, and applies the same crop to the whole document or just the pages you choose. The text inside the kept area stays sharp and selectable, since the underlying page is not re-rendered as an image, and nothing is uploaded to do it.',
        ],
      },
    ],
    faq: [
      { q: 'Does cropping a PDF change its content, or just what is shown?', a: 'A crop hides everything outside the box permanently in the saved file; the page\'s effective size shrinks to the cropped area. It differs from resizing, which scales the content itself.' },
      { q: 'Can I crop just the white margins automatically?', a: 'Yes, Stayput\'s crop PDF tool has a one-click auto-trim that finds and removes the white space around the content on every page.' },
      { q: 'Will the text still be selectable after cropping?', a: 'Yes, cropping only changes which part of the page is visible; the text within the kept area stays as real, selectable text rather than turning into an image.' },
      { q: 'Can I crop only some pages and leave others full-size?', a: 'Yes, Stayput\'s crop PDF tool lets you choose which pages the crop applies to, rather than forcing it onto the whole document.' },
    ],
  },
  {
    slug: 'how-to-upscale-an-image',
    title: 'How to Upscale an Image Without It Looking Blurry',
    description: 'Stretching a small picture in an editor makes it soft; an AI upscaler redraws detail instead of just blending pixels. Here is how each approach compares, and a free browser-based upscaler.',
    heading: 'How to upscale an image',
    dek: 'Making a small picture bigger the old way just blurs it further. Here is what an AI upscaler does differently, and a free one that runs in the browser.',
    keywords: ['how to upscale an image', 'upscale image online free', 'ai image upscaler free', 'enlarge image without losing quality', 'increase image resolution free'],
    updated: '2026-09-30',
    tools: ['upscale-image', 'increase-image-resolution', 'enlarge-image'],
    sections: [
      {
        h: 'Why stretching a small picture looks bad',
        p: [
          'Ordinary resizing, whether in an editor, a browser or a phone\'s Photos app, works by blending the colours of neighbouring pixels to fill in the new, larger space. It has no more real detail to work with than the original had, so the bigger the enlargement, the softer and blockier the result looks, especially around edges and text.',
        ],
      },
      {
        h: 'What an AI upscaler does instead',
        p: [
          'A model like Real-ESRGAN is trained on millions of pairs of sharp and degraded images, so instead of blending pixels it predicts what the sharp version of a small or JPEG-compressed picture probably looked like: it draws cleaner edges, smoother gradients, and plausible fine texture in skin, fabric or foliage, while removing JPEG blocking as it goes.',
        ],
      },
      {
        h: 'In Photoshop',
        p: [
          'Photoshop\'s **Super Resolution**, built on similar AI upscaling, does a comparable job to a dedicated web upscaler but needs a Creative Cloud subscription and the desktop app open, which is a lot of overhead for enlarging one photo or logo.',
        ],
      },
      {
        h: 'Upscaling without uploading the photo',
        p: [
          'Stayput\'s [AI image upscaler](/tools/upscale-image) runs Real-ESRGAN directly in the browser tab: drop a picture and enlarge it 2×, 3× or 4×, with the result held under 16 megapixels, the largest size a browser can reliably hold and save. Ready-made pages are set up for the common cases, [increasing resolution for print](/increase-image-resolution) or [enlarging a small logo or thumbnail](/enlarge-image) at 2× by default, and PNG or WebP output keeps a transparent background intact.',
        ],
      },
    ],
    faq: [
      { q: 'Does upscaling actually add detail, or just make the picture bigger?', a: 'An AI upscaler adds plausible detail, sharp edges and reduced compression artefacts, unlike a plain resize which only spreads existing pixels thinner. It cannot recover detail that was never captured, such as text too small to read in the original.' },
      { q: 'Is there a free AI upscaler with no upload?', a: 'Yes, Stayput\'s upscaler runs the model in the browser, so the photo is processed and enlarged on your own device rather than sent to a server.' },
      { q: 'What is the biggest size it can output?', a: 'Results are capped around 16 megapixels, the largest image size browsers can reliably hold in memory and save; a very large source photo may reach that cap before the full 4× factor.' },
      { q: 'Does it keep a transparent background?', a: 'Yes, when saving as PNG or WebP; choosing JPG puts the picture on a white background instead, since JPG cannot store transparency.' },
    ],
  },
  {
    slug: 'how-to-make-a-qr-code',
    title: 'How to Make a QR Code That Never Expires',
    description: 'Some QR generators quietly turn your code into a short link that goes dead if the account lapses. Here is how to spot that, and a free tool that makes a code that works forever.',
    heading: 'How to make a QR code',
    dek: 'A QR code from some free generators stops working the moment their account expires, because it points at a short link, not your content. Here is how to make one that never does.',
    keywords: ['how to make a qr code', 'qr code generator free', 'make a qr code for wifi', 'free qr code generator no expiration', 'static qr code generator'],
    updated: '2026-09-30',
    tools: ['qr-code-generator', 'wifi-qr-code-generator', 'vcard-qr-code-generator'],
    sections: [
      {
        h: 'Static vs dynamic QR codes',
        p: [
          'A static QR code encodes your actual content, a URL, Wi-Fi details or a contact card, directly in its pattern; it works forever because there is no server involved in reading it. A dynamic QR code instead encodes a short link the generator controls, which redirects to your real content; that lets the company track scans and let you change the destination later, but the code stops working the moment their service goes down or your free plan expires.',
        ],
      },
      {
        h: 'Free QR generators that expire',
        p: [
          'Many popular QR code sites default to a dynamic code without saying so clearly, and print a warning only after your free trial ends: the printed poster or menu with that code now leads nowhere, because the underlying redirect was switched off. For anything printed and left up for months or years, like a menu, a plaque or packaging, that is a real risk.',
        ],
      },
      {
        h: 'In design software',
        p: [
          'Canva and similar design tools can generate a QR code inside a design, which is convenient when the code is already part of a flyer, but most route through the same kind of short-link service under the hood, with the same expiry risk if you later cancel a plan tied to it.',
        ],
      },
      {
        h: 'Making a code that never expires',
        p: [
          'Stayput\'s [QR code generator](/tools/qr-code-generator) builds a static code directly in the browser: for a link, [Wi-Fi network](/wifi-qr-code-generator), [contact card](/vcard-qr-code-generator), email or phone number. Nothing is sent to a server to generate it, so there is no account to lapse and no redirect to go dark; the code is only as permanent as the content stays valid, such as a Wi-Fi password that later changes.',
        ],
      },
    ],
    faq: [
      { q: 'Why did my QR code stop working after a year?', a: 'It was likely a dynamic code pointing at a short link controlled by the generator\'s service; once that service stopped redirecting, whether from an expired plan or the company shutting down, the code led nowhere.' },
      { q: 'How can I tell if a QR code generator makes a static or dynamic code?', a: 'Scan the result before printing anything: if the URL shown is the generator\'s own short domain rather than your actual link, it is dynamic. A tool that builds the code entirely in your browser, with no account, is generating a static one.' },
      { q: 'Can I make a Wi-Fi QR code without typing my password into a website?', a: 'Yes, with a browser-based generator like Stayput\'s Wi-Fi QR code page, which builds the code on your device and never sends the password anywhere.' },
      { q: 'Does a static QR code cost anything or need an account?', a: 'No. Since nothing is generated or stored on a server, there is no plan to pay for and no account needed to keep it working.' },
    ],
  },
  {
    slug: 'how-to-blur-a-video-background',
    title: 'How to Blur a Video Background Without a Green Screen',
    description: 'Video calls blur backgrounds live, but a video you already recorded keeps every detail of the room. Here is how to blur it after the fact, free and without uploading the clip.',
    heading: 'How to blur a video background',
    dek: 'Portrait-mode blur for video calls exists, but a clip you already filmed keeps the room in full detail. Here is how to blur it afterward, for free, on your own device.',
    keywords: ['how to blur a video background', 'blur video background free', 'blur background of video online', 'portrait mode video editor', 'blur video background without green screen'],
    updated: '2026-09-30',
    tools: ['video-background-remover', 'blur-video-background', 'green-screen-video'],
    sections: [
      {
        h: 'Why live blur does not help an already-recorded clip',
        p: [
          'Zoom, Teams and Meet blur the background live during a call using the person\'s outline detected frame by frame, but that only applies while the call is running; a video already saved to your camera roll, like a selfie clip for a job application or a recording of an old call, has no such option built in.',
        ],
      },
      {
        h: 'In a video editor',
        p: [
          'Premiere Pro and DaVinci Resolve can key out or blur a background using masking and tracking, and do it well, but need a green screen for a clean result, or a lot of manual masking work without one, plus the time to learn a full editor for what might be a single clip.',
        ],
      },
      {
        h: 'Mobile apps',
        p: [
          'Some phone camera apps offer a portrait-mode video option, but only while recording; it cannot be applied afterward to a video shot without it, and the effect is usually locked to that phone\'s specific camera app rather than any video you drop in.',
        ],
      },
      {
        h: 'Blurring an existing video without uploading it',
        p: [
          'Stayput\'s [video background remover](/tools/video-background-remover) finds the person in each frame with an AI model running in the browser tab, then [blurs everything else](/blur-video-background), fills it with a flat colour, or puts a picture behind them, with no green screen needed and no upload. It can also do the opposite: [paint the background solid green](/green-screen-video) so the result can be keyed out properly in a real video editor afterward.',
        ],
      },
    ],
    faq: [
      { q: 'Can I blur the background of a video I already recorded?', a: 'Yes, with a tool that finds the person in each frame after the fact, like Stayput\'s video background remover, rather than only during a live call.' },
      { q: 'Do I need a green screen to blur a video background?', a: 'No. An AI person-detection model finds the outline of the person without one; a physical green screen is only needed for the cleanest results in a traditional chroma-key workflow.' },
      { q: 'Does it work with more than one person in frame?', a: 'Yes, everyone the model recognizes as a person stays sharp; everything else is treated as background.' },
      { q: 'Can I put a green background behind someone instead of blurring it?', a: 'Yes, Stayput\'s green screen video option paints a solid green behind the person instead, ready to key out in an editor like Premiere or OBS.' },
    ],
  },
  {
    slug: 'how-to-fill-out-a-pdf-form',
    title: 'How to Fill Out a PDF Form Without Uploading It',
    description: 'A tax form, a job application or a rental contract asks for personal details, and most free "fill PDF" sites are upload-first. Here is how to fill one out, and a tool that never sends the file anywhere.',
    heading: 'How to fill out a PDF form',
    dek: 'Filling in a form that carries your income, your ID number or your address means thinking about where that file goes. Here is how to fill it out on your own device instead.',
    keywords: ['how to fill out a pdf form', 'fill pdf form online free', 'fill in pdf form without printing', 'edit pdf form fields', 'fill pdf form no upload'],
    updated: '2026-09-30',
    tools: ['fill-pdf-form'],
    sections: [
      {
        h: 'Fillable vs. flat PDFs',
        p: [
          'A "fillable" PDF has real form fields built in: text boxes, checkboxes and dropdowns the file itself defines, which is why clicking into one in a PDF reader shows a cursor and a box outline. A "flat" PDF, often an old scanned form, has none of that: the fields are just printed lines and boxes with no way to type into them directly, so filling one out means either printing it or placing text over the image by hand.',
        ],
      },
      {
        h: 'In Adobe Acrobat',
        p: [
          'Acrobat Reader (free) can fill in a form that already has fields, tick its boxes and save the result, which covers most fillable government and business forms. For a flat PDF with no real fields, Acrobat needs the paid Pro tier\'s **Prepare Form** tool to add them first.',
        ],
      },
      {
        h: 'Printing and scanning back',
        p: [
          'The older method, printing the PDF, filling it by hand and scanning it back, still works for a flat form but produces a lower-quality result than typed text, and needs both a printer and a scanner (or a phone scanning app) on hand.',
        ],
      },
      {
        h: 'Filling a form without uploading it',
        p: [
          'Stayput\'s [fill PDF form](/tools/fill-pdf-form) tool opens the document in the browser tab: type into its fields, tick its boxes and choose from its dropdowns if it already has them, or place typed text anywhere on a flat, scanned form that does not. The filled PDF saves straight from the tab, with the original file never uploaded to a server at any point, which matters for a form asking for a Social Security number, a bank account or a signature.',
        ],
      },
    ],
    faq: [
      { q: 'What is the difference between a fillable and a flat PDF?', a: 'A fillable PDF has real form fields built in, so a reader can type directly into it. A flat PDF, often an old scan, is just an image of a form with no fields, so text has to be placed over it by hand instead.' },
      { q: 'Can I fill out a PDF form for free without uploading it?', a: 'Yes, Stayput\'s fill PDF form tool works on the document in your browser tab and never sends the file to a server.' },
      { q: 'Can I fill in a scanned form that has no real fields?', a: 'Yes, by placing typed text directly onto the page at the right spot, which Stayput\'s tool supports for forms without built-in fields.' },
      { q: 'Does filling out a form this way keep my answers editable later?', a: 'It depends on whether the form\'s fields stay live in the saved file or get flattened into the page; check the tool\'s save option if you need to come back and change an answer.' },
    ],
  },
  {
    slug: 'how-to-record-your-screen',
    title: 'How to Record Your Screen (Free, No Software to Install)',
    description: 'Recording your screen used to mean installing an app with a watermark or a time limit on its free tier. Here is how to do it from the browser instead, with no install and no cap.',
    heading: 'How to record your screen',
    dek: 'A quick screen recording for a bug report, a tutorial or a demo does not need a downloaded app. Here is how to record it straight from your browser, free.',
    keywords: ['how to record your screen', 'screen recorder online free', 'record screen without downloading software', 'free screen recorder no watermark', 'record browser tab with audio'],
    updated: '2026-09-30',
    tools: ['screen-recorder', 'screen-recorder-with-audio'],
    sections: [
      {
        h: 'Built into Windows and macOS',
        p: [
          'Windows has the **Xbox Game Bar** (Win+G) for recording a single app window, though it cannot record the desktop or File Explorer. macOS has **Screenshot** (Shift+Cmd+5), which records the whole screen, a window, or a selected area, with audio, and needs no extra app. Both are solid for a quick local recording saved straight to disk.',
        ],
      },
      {
        h: 'Downloaded recording apps',
        p: [
          'OBS Studio is free, open-source and does everything a screen recorder needs, plus live streaming, but it has a real learning curve for a one-off recording: scenes, sources and audio mixing are more setup than most quick tutorials need. Loom and Camtasia are easier to start with but gate features like unlimited length or removing a watermark behind a paid plan.',
        ],
      },
      {
        h: 'Recording in the browser',
        p: [
          'Stayput\'s [screen recorder](/tools/screen-recorder) uses the browser\'s own screen-sharing permission to capture your whole screen, one window, or a browser tab, and can [record its audio plus your microphone at the same time](/screen-recorder-with-audio) for a narrated walkthrough. The video is written to a file directly in the tab as you record, with no length cap beyond your device\'s storage, no watermark, and no account, since nothing is uploaded to a server to make the recording.',
        ],
      },
    ],
    faq: [
      { q: 'Can I record my screen without installing anything?', a: 'Yes, a browser-based recorder like Stayput\'s uses the browser\'s built-in screen-sharing permission, so there is nothing to download or install.' },
      { q: 'Can I record my microphone along with the screen?', a: 'Yes, Stayput\'s screen recorder with audio option captures your microphone alongside the screen and its own sound for a narrated recording.' },
      { q: 'Is there a time limit on free screen recording?', a: 'Not with a browser-based tool like Stayput\'s: since nothing is uploaded or processed on a server, the only limit is how much storage your device has for the resulting file.' },
      { q: 'Does a browser screen recorder add a watermark?', a: 'No. Watermarks on free screen recorders are usually there to push a paid upgrade for hosted, server-processed recordings; a tool that just captures locally in the browser has no such tier to gate.' },
    ],
  },
  {
    slug: 'how-to-resize-a-video',
    title: 'How to Resize a Video (Change Its Resolution)',
    description: 'A platform that rejects a video for being too large in resolution or file size needs the actual pixel dimensions changed, not just compressed. Here is how, free and without uploading the file.',
    heading: 'How to resize a video',
    dek: 'Getting a video down from 4K to 1080p, or to an exact width and height a platform expects, is a different setting than just compressing it. Here is how, in the browser.',
    keywords: ['how to resize a video', 'resize video online free', 'change video resolution free', 'resize video to 1080p', 'video resizer no upload'],
    updated: '2026-09-30',
    tools: ['resize-video', 'compress-video'],
    sections: [
      {
        h: 'Resizing vs. compressing a video',
        p: [
          'Resizing changes a video\'s actual pixel dimensions, such as scaling 3840×2160 (4K) down to 1920×1080, which reduces file size as a side effect but is really about matching what a platform, a screen or an upload limit expects. Compressing keeps the same dimensions and instead reduces the bitrate or re-encodes more efficiently to shrink the file size. A video that is both too large in resolution and too big in file size usually benefits from both, in that order.',
        ],
      },
      {
        h: 'In a phone editing app',
        p: [
          'CapCut and iMovie can export at a lower resolution, but the option is usually tucked into export settings rather than presented as a plain resize, and iMovie in particular does not let you type an arbitrary custom width and height, only its own preset options.',
        ],
      },
      {
        h: 'With desktop software',
        p: [
          'HandBrake, a free open-source video transcoder, resizes and compresses in one pass with fine control, but it is a full application to download and learn for what might be a single video, and its many options can be confusing for someone who just wants "smaller, same video."',
        ],
      },
      {
        h: 'Resizing without uploading the video',
        p: [
          'Stayput\'s [resize video](/tools/resize-video) tool scales a video down (or to an exact width and height) directly in the browser tab: pick a common target like 1080p or 720p, or type exact dimensions, and it processes the file on your device with nothing uploaded. Pairing it with [compress video](/tools/compress-video) afterward, if the file is still too large for an upload limit, handles both problems without needing a full editor.',
        ],
      },
    ],
    faq: [
      { q: 'What is the difference between resizing and compressing a video?', a: 'Resizing changes the actual pixel dimensions (like 4K to 1080p); compressing keeps the same dimensions but reduces bitrate or re-encodes to shrink the file size. A too-large video sometimes needs both.' },
      { q: 'Can I resize a video to an exact width and height, not just a preset?', a: 'Yes, Stayput\'s resize video tool accepts common presets like 1080p and 720p, or a custom width and height you type in.' },
      { q: 'Does resizing a video lose quality?', a: 'Scaling down loses some fine detail, the same as with a photo, but a well-chosen resolution for the video\'s content and viewing size is usually not noticeable; scaling up does not add real detail, only makes the file bigger.' },
      { q: 'Is there a video resizer with no upload and no watermark?', a: 'Yes, a browser-based one like Stayput\'s processes the video on your device and adds no watermark, since there is no server cost to recover.' },
    ],
  },
  {
    slug: 'how-to-make-a-photo-collage',
    title: 'How to Make a Photo Collage (Free, No Watermark)',
    description: 'Many free collage makers watermark the download or cap how many photos you can combine. Here is how to lay out a grid or a stack of photos without either limit.',
    heading: 'How to make a photo collage',
    dek: 'A free collage app often means a watermark on the download, or a small cap on how many photos fit. Here is a browser-based option with neither limit.',
    keywords: ['how to make a photo collage', 'photo collage maker free no watermark', 'combine photos into one image free', 'collage maker online free', 'make a picture grid online'],
    updated: '2026-09-30',
    tools: ['collage-maker', 'combine-images', 'stitch-screenshots'],
    sections: [
      {
        h: 'Phone collage apps',
        p: [
          'Instagram\'s Layout app and similar phone apps make quick grid collages and are convenient since the photos are already on the phone, but most cap the free layout options or add a watermark or a small logo to the corner of the result unless you pay to remove it.',
        ],
      },
      {
        h: 'In Canva',
        p: [
          'Canva has ready-made collage templates and a lot of layout flexibility, but its free tier limits some templates and elements to Canva Pro, and it is more tool than needed for a simple grid of photos.',
        ],
      },
      {
        h: 'Making a collage in the browser',
        p: [
          'Stayput\'s [collage maker](/tools/collage-maker) arranges dropped photos into a [grid, a row, or a stack](/combine-images) with adjustable spacing and a background colour, entirely in the browser, with no watermark and no cap on how many photos go in beyond what your device can hold in memory. A specialised layout, [stitching screenshots together](/stitch-screenshots) end to end rather than in a grid, covers a long scrolling capture split across several images.',
        ],
      },
    ],
    faq: [
      { q: 'Is there a photo collage maker with no watermark?', a: 'Yes, Stayput\'s collage maker adds no watermark or logo to the result, since it has no paid tier to gate that behind.' },
      { q: 'How many photos can I put in one collage?', a: 'There is no fixed cap; the practical limit is how many photos your device can hold in memory at once while it lays out the grid.' },
      { q: 'Can I stack photos vertically instead of a grid?', a: 'Yes, Stayput\'s collage maker offers a grid, a row, or a vertical stack layout, with adjustable spacing between photos.' },
      { q: 'Can I combine several screenshots into one long image?', a: 'Yes, the stitch screenshots page joins them end to end in order, which suits a long scrolling capture split across multiple images better than a grid layout does.' },
    ],
  },
  {
    slug: 'how-to-extract-images-from-a-pdf',
    title: 'How to Extract Images From a PDF at Full Resolution',
    description: 'Screenshotting a picture inside a PDF loses quality and adds compression artefacts. Here is how to pull out the original image files instead, free and without uploading the document.',
    heading: 'How to extract images from a PDF',
    dek: 'A screenshot of a picture inside a PDF is a blurry copy of a copy. Here is how to get the original image file out instead, at its real resolution.',
    keywords: ['how to extract images from a pdf', 'extract images from pdf free', 'save images from pdf as jpg', 'extract pictures from pdf online', 'pull images out of pdf'],
    updated: '2026-09-30',
    tools: ['extract-pdf-images'],
    sections: [
      {
        h: 'Why a screenshot is the wrong way to do this',
        p: [
          'Taking a screenshot of a photo or chart inside a PDF captures it at your screen\'s resolution and re-compresses it as a new image, which is always a downgrade from what is actually stored in the file. A PDF stores each embedded image as its own file internally, usually a JPEG or PNG, at whatever resolution it was placed at, often much higher than a screenshot could ever capture.',
        ],
      },
      {
        h: 'In Adobe Acrobat',
        p: [
          'Acrobat Pro can export images from a PDF via **File → Export To → Image**, which pulls out embedded pictures at their stored resolution, but the feature needs a paid Acrobat subscription; the free Acrobat Reader has no image export option.',
        ],
      },
      {
        h: 'Command-line tools',
        p: [
          'Tools like `pdfimages`, part of the free Poppler utilities, extract every embedded image from a PDF at full resolution from the command line, which works well for someone comfortable with a terminal but is more setup than most people want for a single document.',
        ],
      },
      {
        h: 'Extracting images without uploading the PDF',
        p: [
          'Stayput\'s [extract images from PDF](/tools/extract-pdf-images) tool scans the document in the browser tab and saves every embedded picture as a separate PNG or JPG, at the resolution it was actually stored in the file, not a screenshot\'s resolution. It works on every image in the document at once, with nothing uploaded to a server to do it.',
        ],
      },
    ],
    faq: [
      { q: 'Why is a screenshot of a PDF image lower quality than the original?', a: 'A screenshot captures the image at your screen\'s resolution and re-compresses it, while the PDF itself stores the picture as its own file, usually at a higher resolution than any screenshot could reach.' },
      { q: 'Can I extract every image from a PDF at once?', a: 'Yes, Stayput\'s extract images from PDF tool finds and saves every embedded picture in the document in one pass.' },
      { q: 'What format do the extracted images come out as?', a: 'PNG or JPG, matching or closely approximating how the picture was originally stored in the PDF.' },
      { q: 'Does this work on a PDF made from a scan?', a: 'A scanned PDF is usually one full-page image per page rather than several embedded pictures, so extracting images from it saves each page as a picture rather than pulling out separate photos.' },
    ],
  },
  {
    slug: 'how-to-flatten-a-pdf',
    title: 'How to Flatten a PDF (Lock Form Fields and Signatures)',
    description: 'A filled-in PDF form or a signed contract can still be edited until it is flattened into the page. Here is what flattening actually does, and a free tool that does it without uploading the file.',
    heading: 'How to flatten a PDF',
    dek: 'A form you just filled in, or a document you just signed, stays editable until it is flattened. Here is what that means, and how to do it for free.',
    keywords: ['how to flatten a pdf', 'flatten pdf online free', 'lock pdf form fields', 'flatten pdf form fields', 'make pdf uneditable'],
    updated: '2026-09-30',
    tools: ['flatten-pdf', 'fill-pdf-form', 'sign-pdf'],
    sections: [
      {
        h: 'What flattening actually changes',
        p: [
          'A filled-in form field, a typed comment, a stamp or a drawn signature in a PDF usually stays as a separate, still-editable layer on top of the page, the way a sticky note sits on a document rather than being part of it. Flattening presses that layer permanently into the page itself, so it displays identically everywhere and can no longer be edited, moved or deleted, only viewed as part of the page content from then on.',
        ],
      },
      {
        h: 'Why it matters before sending a document',
        p: [
          'A form field or signature that has not been flattened can, depending on the PDF viewer, still be clicked into and changed by whoever receives the file, which is not what you want for a signed contract or a completed application. Flattening turns those interactive elements into plain, fixed page content before it goes out.',
        ],
      },
      {
        h: 'In Adobe Acrobat',
        p: [
          'Acrobat Pro has a **Flatten** option, usually reached through Print to PDF or a dedicated menu action depending on the version, which does the job well but needs a paid subscription; the free Acrobat Reader does not offer it.',
        ],
      },
      {
        h: 'Flattening without uploading the document',
        p: [
          'Stayput\'s [flatten PDF](/tools/flatten-pdf) tool presses filled [form fields](/tools/fill-pdf-form), comments, stamps and [signatures](/tools/sign-pdf) into the page directly in the browser tab, so the result looks the same in any viewer and cannot be edited back out. The underlying text elsewhere in the document stays selectable; only the interactive elements are locked in, and the file is never uploaded to do it.',
        ],
      },
    ],
    faq: [
      { q: 'What does flattening a PDF actually do?', a: 'It presses interactive elements like filled form fields, comments and signatures permanently into the page, so they display the same everywhere and can no longer be edited or moved.' },
      { q: 'Why would I flatten a PDF before sending it?', a: 'An unflattened form field or signature can sometimes still be edited by whoever opens the file, depending on their PDF viewer; flattening locks it in as fixed page content first.' },
      { q: 'Does flattening make the rest of the text uneditable too?', a: 'No, flattening specifically affects interactive elements like form fields and annotations; ordinary text in the document is unaffected and stays as it was.' },
      { q: 'Can I flatten a PDF for free without uploading it?', a: 'Yes, Stayput\'s flatten PDF tool works on the document in your browser tab and never sends it to a server.' },
    ],
  },
  {
    slug: 'how-to-increase-audio-volume',
    title: 'How to Increase the Volume of an Audio File Without Distortion',
    description: 'Cranking a volume slider on a quiet recording usually distorts the loud parts before the quiet parts become audible. Here is how normalization avoids that, and a free browser tool for it.',
    heading: 'How to increase audio volume',
    dek: 'Simply turning up a quiet recording clips the loud parts before the quiet parts get loud enough. Here is a better way, and a free tool that does it without uploading the file.',
    keywords: ['how to increase volume of audio', 'increase mp3 volume free', 'make audio louder online', 'normalize audio volume free', 'boost quiet recording volume'],
    updated: '2026-09-30',
    tools: ['volume-booster'],
    sections: [
      {
        h: 'Why a flat volume boost distorts the loud parts',
        p: [
          'Multiplying every sample in a recording by the same factor, which is what a plain "increase volume" slider does, raises the loudest parts as much as the quietest ones. If the quiet parts need much amplification to become audible, the already-loud parts get pushed past the maximum the format can represent and clip, producing a harsh, crackling distortion.',
        ],
      },
      {
        h: 'Normalization vs. a flat boost',
        p: [
          'Normalizing instead finds the loudest peak in the recording and raises the whole file only as much as that peak allows without clipping, which is safe but limited: a recording with one loud spike and mostly quiet speech still ends up quiet overall, since that one peak sets the ceiling. Dynamic range compression goes further, reducing the gap between loud and quiet parts first so the whole thing can then be pushed louder evenly, which is what most "loudness" tools actually do under the hood.',
        ],
      },
      {
        h: 'In a full audio editor',
        p: [
          'Audacity, free and open-source, has both a Normalize and an Amplify effect and does this properly, but it is a full application to download, install and learn for a job that is often just "make this one voice memo louder."',
        ],
      },
      {
        h: 'Boosting volume without uploading the file',
        p: [
          'Stayput\'s [volume booster](/tools/volume-booster) raises or lowers the loudness of an MP3, voice memo or video directly in the browser tab, with a normalize option that brings quiet audio up to a target loudness without clipping the peaks, and a batch mode that evens out a folder of recordings to the same level. Nothing is uploaded to process it.',
        ],
      },
    ],
    faq: [
      { q: 'Why does my quiet recording distort when I turn up the volume?', a: 'A flat volume increase raises loud and quiet parts by the same amount, so by the time the quiet parts are audible, the loud parts have been pushed past the format\'s maximum and clip into distortion.' },
      { q: 'What is audio normalization?', a: 'Raising a whole recording\'s volume by the largest amount possible without its loudest peak clipping, which is safer than a flat boost but still limited by that one peak.' },
      { q: 'Can I make several recordings the same volume at once?', a: 'Yes, Stayput\'s volume booster has a batch mode that normalizes a group of files to a matching loudness level in one pass.' },
      { q: 'Does boosting the volume work on a video\'s audio too?', a: 'Yes, Stayput\'s volume booster accepts video files and adjusts the audio track without needing to extract it first.' },
    ],
  },
  {
    slug: 'how-to-convert-a-photo-to-black-and-white',
    title: 'How to Convert a Photo to Black and White (Not Just Desaturated)',
    description: 'Removing the colour from a photo is only the first step; a genuinely good black-and-white photo also needs its tones remapped. Here is the difference, and a free browser tool that does both.',
    heading: 'How to convert a photo to black and white',
    dek: 'Just desaturating a colour photo often looks flat in black and white, because colours that looked different can turn into the same shade of grey. Here is why, and a free tool that fixes it.',
    keywords: ['how to convert photo to black and white', 'black and white photo converter free', 'convert image to grayscale online', 'make photo black and white free', 'photo to grayscale converter'],
    updated: '2026-09-30',
    tools: ['black-and-white-image'],
    sections: [
      {
        h: 'Why plain desaturation can look flat',
        p: [
          'The simplest way to remove colour, averaging the red, green and blue values of each pixel, ignores that the human eye does not perceive those colours as equally bright: a saturated red and a saturated green can average out to nearly the same grey even though they looked completely different in colour, which flattens contrast that was doing real work in the original photo.',
        ],
      },
      {
        h: 'How a proper conversion handles this',
        p: [
          'A weighted grayscale conversion, the kind built into most photo editors, gives more weight to green and less to blue when computing brightness, matching how human vision actually works, which keeps more of the original contrast intact. Beyond that, black-and-white photography traditionally used coloured filters (a red filter to darken blue sky, for example) to control how colours map to tones, an effect some black-and-white converters replicate digitally.',
        ],
      },
      {
        h: 'In Photoshop or Lightroom',
        p: [
          'Photoshop\'s **Black & White** adjustment layer and Lightroom\'s black-and-white panel both let you push individual colour channels lighter or darker in the conversion, which gives the most control, but both need a Creative Cloud subscription and some skill to use the sliders well.',
        ],
      },
      {
        h: 'Converting in the browser',
        p: [
          'Stayput\'s [black and white photo](/tools/black-and-white-image) tool offers grayscale, a higher-contrast look, pure black-and-white for scans and signatures, and a sepia tone, with a live preview so you can compare options before saving, and batch processing for more than one photo at a time. It runs entirely in the browser, so nothing is uploaded.',
        ],
      },
    ],
    faq: [
      { q: 'Why does my black and white photo look flat or low-contrast?', a: 'A simple desaturation can average different colours into nearly the same shade of grey, losing the contrast that was visible in the original. A weighted conversion that accounts for how the eye perceives colour keeps more of that contrast.' },
      { q: 'What is the difference between grayscale and pure black and white?', a: 'Grayscale keeps a full range of grey tones between black and white; pure black and white (sometimes called "threshold" or "1-bit") maps every pixel to either fully black or fully white, which suits scanned documents and signatures better than photos.' },
      { q: 'Can I convert several photos to black and white at once?', a: 'Yes, Stayput\'s black and white photo tool supports batch processing for multiple photos in one pass.' },
      { q: 'Does converting to black and white reduce the file size?', a: 'Slightly, since a grayscale image needs less colour data than a full-colour one, though the effect on file size is usually modest compared to other compression.' },
    ],
  },
];

export const guideBySlug = (slug: string): Guide | undefined => guides.find((g) => g.slug === slug);

/** "Is <service> safe?" guides, which read as a set. */
export const isSafetyGuide = (g: Guide): boolean => /^is-.+-safe$/.test(g.slug);

/**
 * Guides to suggest under another guide: other safety guides first when the
 * reader is on one, then the guides sharing the most tools, then other how-to guides
 * under a how-to guide. Ties go to the guides listed after this one (wrapping
 * around), which were usually written alongside it, so every guide is suggested
 * from somewhere rather than only the first few in the list.
 */
export function relatedGuides(guide: Guide, count = 4): Guide[] {
  const safety = isSafetyGuide(guide);
  const howTo = (g: Guide) => g.slug.startsWith('how-to-');
  const score = (g: Guide) => g.tools.filter((t) => guide.tools.includes(t)).length + (safety && isSafetyGuide(g) ? 10 : 0) + (howTo(guide) && howTo(g) ? 0.5 : 0);
  const own = guides.indexOf(guide);
  return guides
    .map((g, i) => ({ g, i: (i - own + guides.length) % guides.length, s: score(g) }))
    .filter(({ g }) => g.slug !== guide.slug)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, count)
    .map((x) => x.g);
}

/** Guides that point at a tool or landing page, for the "Guides" section on tool pages. */
export const guidesFor = (slugs: string[]): Guide[] => guides.filter((g) => g.tools.some((t) => slugs.includes(t)));
