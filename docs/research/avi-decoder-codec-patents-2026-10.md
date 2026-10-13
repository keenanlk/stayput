# Codecs in the AVI decoder: patent-expiry evidence

Written 2026-10-13 for the AVI to MP4 tool. This is the evidence that was gathered to decide what goes into the FFmpeg-library decoder build in `vendor-builds/libav-avi/`. It is a risk note, not a legal opinion. The LGPL grants no patent licence, so each shipped codec has to be one whose patents are over.

Rule used: a codec is in the build only if there is a public source saying its essential patents have expired. Anything else is out, and the page names the codec in an error.

## Shipped

| Codec (FFmpeg name) | Where it appears in AVI | Evidence the patents are over | Sources |
|---|---|---|---|
| MPEG-4 Part 2 Visual, `mpeg4` (Xvid, DivX 4 to 6, FMP4, MP4V). `h263` comes with it: the two are one source file in FFmpeg and MPEG-4 Part 2 is a superset of baseline H.263. | Most Xvid and DivX files | The licence pool administered by Via LA (the MPEG-4 Visual Patent Portfolio) had its last patent expire on 2026-07-19 (Brazil, BR PI0109962-0). Last European patent EP 1 279 291 expired 2021-04-09; last US patents US 6,959,046 on 2022-12-07 and US 7,395,211 on 2023-11-14. Via LA took the licence page down on the day after expiry. | [Meta-Wiki: Have the patents for MPEG-4 Visual expired yet?](https://meta.wikimedia.org/wiki/Have_the_patents_for_MPEG-4_Visual_expired_yet%3F), [Linuxiac](https://linuxiac.com/the-last-mpeg-4-visual-patent-has-expired/), [It's FOSS](https://itsfoss.com/news/mpeg-4-visual-patent-expiry/) |
| Motion JPEG, `mjpeg` | Digital cameras, capture cards, screen recorders | Baseline JPEG (ISO/IEC 10918-1, 1992). The one patent claim made against it (Forgent, US 4,698,672) expired 2006-10-27 and was found invalid; Forgent dropped its claims in November 2006. The JPEG committee's explicit goal was a baseline free of royalties. | [NBC News: Forgent settles JPEG case](https://www.nbcnews.com/id/wbna15534260), [LWN](https://lwn.net/Articles/82586/), [Wikipedia: JPEG](https://en.wikipedia.org/wiki/JPEG) |
| MP3, `mp3` (MPEG-1/2 Audio Layer III) | The usual sound in Xvid AVIs | Technicolor and Fraunhofer ended the MP3 licensing programme on 2017-04-23 because the last US patent (US 6,009,399) expired on 2017-04-16. The European patents expired in 2012. | [Gigazine, 2017-05-02](https://gigazine.net/gsc_news/en/20170502-mp3-licensing-program-finished), [Digital Music News, 2017-05-12](https://www.digitalmusicnews.com/2017/05/12/the-death-of-mp3/) |
| MP2, `mp2` (MPEG-1 Audio Layer II) | DVD and TV rips | No unexpired essential patents have been listed since 2008; the standard is from 1993. | [Wikipedia: MPEG-1 Audio Layer II](https://en.wikipedia.org/wiki/MPEG-1_Audio_Layer_II) |
| AC-3 / Dolby Digital, `ac3` | DVD rips with surround sound | The last Dolby Digital patents expired in March 2017 (US 6,449,364 on 2017-03-14, US 5,890,106 on 2017-03-19). | [Gigazine, 2017-03-21](https://gigazine.net/gsc_news/en/20170321-ac-3-patent-expired), [CNX Software](https://cnx-software.com/?p=41924), [Android Police](https://www.androidpolice.com/2017/04/12/mx-player-adds-back-ac-3-codec-support-last-dolby-digital-patent-expired/) |
| PCM: `pcm_s16le`, `pcm_u8`, `pcm_alaw`, `pcm_mulaw` | Camera and capture AVIs | Uncompressed samples need no codec patent. A-law and mu-law are ITU-T G.711 (1972). | [ITU-T G.711](https://www.itu.int/rec/T-REC-G.711) |

## Left out on purpose

| Codec | Why |
|---|---|
| H.264 (AVC), AAC | Patents are alive and licensed through Via LA. Not decoded by this module. H.264 video or AAC sound inside an AVI shows a named error (`UnsupportedAviCodec`). |
| WMV1/2/3, VC-1, WMA (v1, v2, Pro, Voice, Lossless), ASF and FLV demuxers, VP6, Sorenson Spark (FLV), Nellymoser | Excluded by the brief (patent check pending). Not compiled in. |
| MS-MPEG4 v1, v2 and v3 ("DivX 3") | Microsoft's own variants. No public expiry source found, so they stay out until one is. A strong candidate to add: the filings date from 1998 to 2000. |
| MS ADPCM, IMA ADPCM | Probably expired (1990s designs) but no public source found. Out until one is. |
| MPEG-1 and MPEG-2 video | Not needed for AVI as it is commonly found; MPEG-2 patents expired in 2018 and could be added later with a source. |

## What is actually in the file

`vendor-builds/libav-avi/check-codecs.mjs` asks the built module which decoders and demuxers exist; its output is committed as `vendor-builds/libav-avi/dist/check-codecs-output.txt`. The configure flags are in `dist/ffmpeg-config.txt` (`--disable-everything`, then only the AVI demuxer, the parsers `mpeg4video`, `mpegaudio` and `ac3`, and the decoders listed above). FFmpeg's configure reported `LGPL version 2.1 or later` with `CONFIG_GPL 0` and `CONFIG_NONFREE 0`.
