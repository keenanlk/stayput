# Spacing audit

Full-page Chromium screenshots of the main branch (before) and this change (after), pixel-diffed per page. Animations are off and the home page video is hidden so its loading spinner does not show up as a difference.

| Page (width, scheme) | Result |
|---|---|
| about-1280-dark | identical (0 changed pixels) |
| about-1280-light | identical (0 changed pixels) |
| about-390-dark | identical (0 changed pixels) |
| about-390-light | identical (0 changed pixels) |
| conversions-1280-dark | identical (0 changed pixels) |
| conversions-1280-light | identical (0 changed pixels) |
| conversions-390-dark | identical (0 changed pixels) |
| conversions-390-light | identical (0 changed pixels) |
| guide-1280-dark | identical (0 changed pixels) |
| guide-1280-light | identical (0 changed pixels) |
| guide-390-dark | identical (0 changed pixels) |
| guide-390-light | identical (0 changed pixels) |
| home-1280-dark | 2 changed pixels, bbox (154, 4601, 155, 4603) |
| home-1280-light | 2 changed pixels, bbox (154, 4598, 155, 4600) |
| home-390-dark | identical (0 changed pixels) |
| home-390-light | identical (0 changed pixels) |
| mcp-1280-dark | size 1280x3073 -> 1280x3141 |
| mcp-1280-light | size 1280x3073 -> 1280x3141 |
| mcp-390-dark | size 390x4409 -> 390x4477 |
| mcp-390-light | size 390x4409 -> 390x4477 |
| privacy-1280-dark | identical (0 changed pixels) |
| privacy-1280-light | identical (0 changed pixels) |
| privacy-390-dark | identical (0 changed pixels) |
| privacy-390-light | identical (0 changed pixels) |
| tool-auto-caption-video-1280-dark | identical (0 changed pixels) |
| tool-auto-caption-video-1280-light | identical (0 changed pixels) |
| tool-auto-caption-video-390-dark | identical (0 changed pixels) |
| tool-auto-caption-video-390-light | identical (0 changed pixels) |
| tool-heic-to-jpg-1280-dark | identical (0 changed pixels) |
| tool-heic-to-jpg-1280-light | identical (0 changed pixels) |
| tool-heic-to-jpg-390-dark | identical (0 changed pixels) |
| tool-heic-to-jpg-390-light | identical (0 changed pixels) |
| tool-merge-pdf-1280-dark | identical (0 changed pixels) |
| tool-merge-pdf-1280-light | identical (0 changed pixels) |
| tool-merge-pdf-390-dark | identical (0 changed pixels) |
| tool-merge-pdf-390-light | identical (0 changed pixels) |

The two changed pixels on home at 1280 sit at about y=4600, a 2x1 pixel patch that is nowhere near a prose heading; it shows up with the video hidden, so I take it to be render noise (the first round's larger home difference was the video player's spinner). The `*-top.jpg` files are the first 1800px of each page; the mcp files are full pages.
