# Contributing to Stayput

Thanks for looking. Bug reports, fixes and new tools are welcome. A few ground rules keep the project what it is.

## The one rule

**No change may cause a user's file, or anything derived from it, to leave the browser.** No upload endpoints, no "just for this format" server fallbacks, no third-party APIs that receive file data, no analytics that include file names or sizes finer than the existing buckets. If a feature cannot be done in the browser, it waits until it can.

Related: the Content-Security-Policy in `vercel.json` and `public/_headers` deliberately restricts `connect-src`. Widening it needs a very good reason.

## Ground rules

- Free forever: no accounts, no limits, no watermarks, no paid tier, no ads.
- Every tool is a page with its own URL, real explanatory copy and a FAQ. Copy is plain and calm: say what happens, do not sell.
- Batch by default. Tools accept many files and zip the outputs when there is more than one.
- Work in a way that keeps the page responsive on a phone: process files one at a time and release buffers between them.
- Accessibility is not optional: labelled controls, keyboard operation, visible focus, live regions for progress and results.

## Setting up

```bash
npm install
npm run dev
```

See the README for the test setup. Please run `npm run check`, `npm run build` and `npm test` before opening a pull request. CI runs the same.

## Adding a tool

Follow "Adding a tool" in the README. Keep the shell (`src/lib/shell.ts`) generic; tool-specific behaviour belongs in the tool's own module.

## Reporting bugs

Open an issue with the tool name, the browser and OS, and what happened. Do not attach the file that failed unless it contains nothing private; a description of it (format, size, where it came from) is usually enough to reproduce.

## Security

If you find a way for a file to leave the browser, or any other security problem, please open a private security advisory on GitHub rather than a public issue.

## License

By contributing you agree that your contribution is licensed under the MIT license, like the rest of the project.
