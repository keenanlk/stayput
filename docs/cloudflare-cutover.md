# Moving stayput.dev from Vercel to Cloudflare

What has to be done by hand, in order. Vercel keeps serving production until step 5, and nothing before
step 5 can affect visitors. Rollback is at the end.

## How it works

- `npm run build`, then `scripts/cloudflare-assets.mjs`, which generates `dist/_redirects`, `dist/_headers`,
  `dist/.assetsignore` and `dist/.cloudflare/oversize.json` from `vercel.json` and what is in `dist/`.
- Everything under 25 MiB is a Workers static asset. Bigger files are in R2 and served by `worker/` at the same URLs.
- CI deploys the `dist` artifact that passed `build-and-test`, after uploading any new big files.
- R2 keys are `<path>@<sha256>`. Objects are only ever added, so a preview, a rollback or a half-finished deploy
  can't change the bytes production serves. Old objects stay until someone deletes them (see "Later").

## 1. Before merging the PR

### Cloudflare account

1. Enable R2 in the dashboard (**R2 object storage**). It asks for a payment method even on the free tier.
2. Create the bucket: `npx wrangler login`, then `npx wrangler r2 bucket create stayput-assets`.
3. Create an account API token (**Manage account > Account API tokens > Create Token > Custom**) with only:
   - Account > **Workers Scripts** > Edit
   - Account > **Workers R2 Storage** > Edit

   Scope it to this account. It needs no zone permissions, because the domain is attached in the dashboard in step 5.
   These two were enough for the first real deploy and R2 upload.

### GitHub

Add two repository secrets (**Settings > Secrets and variables > Actions**), or:

```sh
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
```

Add them before merging. Without them `deploy-production` skips with a warning, which is safe: Vercel still
deploys, and IndexNow still runs after the skipped job.

The Worker is created by the first deploy from `main`, so preview jobs on other open PRs fail until that has happened.

## 2. Merge, then test on workers.dev

The merge deploys to `https://stayput.<your-subdomain>.workers.dev`. Vercel is untouched. Run the checks below
with `H=` set to that URL.

```sh
M=/models/isnet-general-use-int8w.onnx

# A big file: 206, Content-Range bytes 0-9/46535524, no Content-Encoding, the CSP, immutable Cache-Control
curl -sD - -o /dev/null -r 0-9 -H 'Accept-Encoding: br, gzip' "$H$M"

# A full download matches src/data/model-manifest.json (a3b47c80...)
curl -s "$H$M" | shasum -a 256

# The ranged .wasm: no Content-Encoding. (`wrangler dev` does compress this; Cloudflare's docs say the edge does not.)
curl -sD - -o /dev/null -r 0-9 -H 'Accept-Encoding: br, gzip' "$H/vendor/onnxruntime-web@1.30.0/ort-wasm-simd-threaded.asyncify.wasm"

# A model under 25 MiB, served as a static asset: expect 200 and the whole file, because static assets ignore Range
curl -sD - -o /dev/null -r 0-9 -H 'Accept-Encoding: br, gzip' "$H/models/selfie_segmenter.tflite"

# Redirect, 404 page, security headers
curl -sD - -o /dev/null "$H/upscale-image"
curl -sD - -o /dev/null "$H/nope"
```

Then in a browser on the workers.dev URL, run one tool of each model kind: remove background, transcribe, vocal
remover. Watch the console for CSP errors. `src/lib/model-fetch.ts` copes if static assets ignore Range (it
refetches and skips what it has), but that path has only been tested locally.

## 3. Add the zone (nothing changes yet)

1. **Add a domain** in Cloudflare, choose stayput.dev, Free plan. Cloudflare scans the DNS.
2. Compare every record with the Namecheap panel, not just with the scan. Public DNS showed these on 2026-11-01:

   | Name | Type | Value | Note |
   | --- | --- | --- | --- |
   | `@` | A | `216.150.1.1` | Vercel. Keep it **DNS only (grey cloud)** for now |
   | `www` | CNAME | `a0dbf1b4992d9df3.vercel-dns-016.com` | Vercel. **DNS only** for now |
   | `@` | MX | five `eforward` hosts, below | Mail, must not be proxied |
   | `@` | TXT | `v=spf1 include:spf.efwd.registrar-servers.com ~all` | Mail |
   | `@` | TXT | `google-site-verification=nu6sCzOSTOr6cHoXj831pIpgJaT6J7EfmuEajynrAAE` | Search Console |

   MX records: priority 10 `eforward1`, `eforward2`, `eforward3`; 15 `eforward4`; 20 `eforward5`, all
   `.registrar-servers.com`.

   DNS can't be listed from outside, so this table is what was found, not proof nothing else exists. Subdomains in
   particular (DKIM selectors, `_vercel` TXT verification) only show up in the Namecheap panel.
3. **Mail:** those MX records are Namecheap's Email Forwarding, which may stop working or lose its settings page
   once the domain leaves Namecheap's nameservers. Check with Namecheap first. Write down every alias. If it won't
   carry over, set up Cloudflare Email Routing with the same aliases. Send a test message after step 4.
4. Turn off anything that rewrites pages or `robots.txt`, because the CSP and the privacy page depend on the site
   being served unmodified: Rocket Loader, Email Address Obfuscation, Web Analytics automatic setup, and
   the managed `robots.txt` / AI bot blocking. Compare `https://<zone>/robots.txt` after cutover with `public/robots.txt`.

## 4. Switch nameservers

The domain still points at Vercel afterwards, so this step moves DNS only.

1. **stayput.dev has DNSSEC on** (a DS record is published). Turn it off at Namecheap and **wait at least 24 hours**
   (the DS TTL, plus a margin) before changing nameservers. Doing it the other way round makes the domain fail to
   resolve for every validating resolver.
2. A few hours before, lower the TTLs in the Namecheap panel if it allows it.
3. In Namecheap, set Custom DNS to the two nameservers Cloudflare assigned.
4. Wait for the zone to show **Active**. Check `dig NS stayput.dev`, that the site still loads with `server: Vercel`, and
   that test mail arrives.
5. Re-enable DNSSEC later, from Cloudflare, once everything has settled.

## 5. Point the domain at the Worker

This is the actual cutover.

1. In the Worker: **Settings > Domains & Routes > Add > Custom Domain**, `stayput.dev`. Remove the apex A record
   first if the dashboard asks. Cloudflare creates the DNS record and certificate. Note the old A value for rollback.
2. `www`: Vercel redirects it today, and that stops when it moves. Replace the CNAME with a proxied `AAAA` record to
   `100::` and add a **Redirect Rule**: hostname `www.stayput.dev` to `https://stayput.dev${path}`, 308, keep the query string.
3. Check `curl -sI https://stayput.dev/ | grep -i server` says cloudflare, rerun the step 2 checks with
   `H=https://stayput.dev`, and rerun them in a browser.
4. Check the edge cache on the real domain (it works on workers.dev). Request a big file twice from the same
   place: the second response should have `X-Stayput-Source: cache`. If it stays `r2`, the site still works but
   every read costs an R2 operation.

## 6. Clean-up PR after cutover

- `wrangler.jsonc`: `"workers_dev": false`, so the site isn't also at a second indexable address.
- `src/pages/privacy.astro`: it says "served from our host (Vercel)", which stays true until step 5. Change it then,
  and check the rest of the page against what Cloudflare logs.
- Leave `vercel.json`. The Cloudflare rules, `scripts/serve.mjs`, `scripts/check-links.mjs` and several tests read it.
  Delete it only if those move to something else. Its `ignoreCommand` and `scripts/vercel-ignore.sh` can go once
  Vercel is off.

## Known differences from Vercel

- `/page/` and `/page.html` redirect with 307 instead of 308 (Cloudflare's built-in `html_handling`, not configurable).
  Canonical tags still name the right URL. `_redirects` sources do get 308, with and without a trailing slash.
- `.onnx` and `.tflite` files under 25 MiB have no `Content-Type` (Vercel sends `application/octet-stream`), because
  wrangler has no type for those extensions. The loaders read them with `fetch` and don't look at it.
- Models under 25 MiB ignore Range (confirmed on workers.dev): a ranged request gets 200 and the whole file. A dropped
  download still finishes, because `model-fetch.ts` refetches and skips what it has, but it re-downloads those bytes.
- Each edge location caches big files separately, so a location's first reader of a file comes from R2.
- `run_worker_first` must match the big files in `dist/`. When a file crosses 25 MiB, or an
  onnxruntime-web upgrade changes the `/vendor/` path, CI fails until you run
  `node scripts/cloudflare-assets.mjs --write-config` and commit `wrangler.jsonc`.

## Rollback

Keep the Vercel project and its domain settings untouched until the site has been stable on Cloudflare for a couple of
weeks. It keeps deploying from `main` throughout, so it is always current.

| What went wrong | What to do | Takes |
| --- | --- | --- |
| A bad deploy | `npx wrangler rollback`, or **Deployments** in the dashboard. Big files from older deploys are still in R2. | Seconds |
| The site is broken on Cloudflare (after step 5) | Remove the Worker's Custom Domain, then re-add `@` A `216.150.1.1` and the `www` CNAME as **DNS only**, and delete the www Redirect Rule. | Minutes |
| DNS itself is the problem (after step 4) | In Namecheap, set the domain back to Namecheap BasicDNS and confirm the records and mail are still there. Keep DNSSEC off until it has settled. | Up to 48 hours |
| A pipeline problem, site fine | Delete the `CLOUDFLARE_API_TOKEN` secret. The deploy job then skips with a warning. | Seconds |

## Later

- `wrangler r2 object delete --remote` can remove old `<path>@<sha256>` objects. Only delete a hash that no Worker version
  you might roll back to still refers to. The bucket is about 250 MB today, inside R2's free 10 GB.
- PR previews use production's bucket and the production Worker's bindings, as Version URLs always do. They add objects
  when a PR changes a big file, and those stay until deleted.
