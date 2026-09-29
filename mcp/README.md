# StayPut MCP server

Local PDF and photo tools for Claude, Cursor, VS Code and any other app that speaks the [Model Context Protocol](https://modelcontextprotocol.io). Ask your assistant to merge PDFs, pull out pages, or remove the GPS location from a photo, and it does the work on your own machine.

It runs the same code as [stayput.dev](https://stayput.dev), the browser version. **Your files are read from disk and written back to disk; nothing is uploaded, and the server makes no network requests.** It is free and open source (MIT), with no account and no API key.

## Tools

| Tool | What it does |
| --- | --- |
| `merge_pdfs` | Combine PDFs into one, in the order given |
| `extract_pdf_pages` | Keep only some pages, reorder them ("3,1,2") or drop pages |
| `split_pdf` | Split into one file per page, or every N pages |
| `rotate_pdf` | Rotate all pages or chosen pages by 90, 180 or 270 degrees |
| `number_pdf_pages` | Stamp page numbers, e.g. "Page {n} of {total}" |
| `pdf_info` | Page count, page sizes and title |
| `images_to_pdf` | JPG and PNG images into one PDF, one per page, no re-compression |
| `inspect_image_metadata` | Show GPS location, camera, capture time and other hidden metadata in a photo |
| `strip_image_metadata` | Write a copy of a JPG, PNG or WebP with EXIF, GPS, XMP and comments removed, without re-encoding |

Every tool writes a **new** file and returns its path. Input files are never modified, and an existing file is never overwritten (you get `file-1.pdf` instead). Encrypted PDFs (bank statements, forms with printing restrictions) are decrypted locally with qpdf; for PDFs that need a password to open, the assistant passes it in the `password` argument.

## Install

Requires Node.js 20 or newer.

**Claude Code**

```sh
claude mcp add stayput -- npx -y stayput-mcp
```

**Claude Desktop, Cursor, Windsurf and other JSON configs** (`claude_desktop_config.json`, `.cursor/mcp.json`, ...)

```json
{
  "mcpServers": {
    "stayput": {
      "command": "npx",
      "args": ["-y", "stayput-mcp"]
    }
  }
}
```

**VS Code**

```sh
code --add-mcp '{"name":"stayput","command":"npx","args":["-y","stayput-mcp"]}'
```

Then ask things like:

- "Merge invoice-march.pdf and invoice-april.pdf in ~/Downloads"
- "Take pages 2 to 5 out of contract.pdf"
- "Does IMG_2041.jpg have a location in it? If so, make a copy without it"
- "Number the pages of thesis.pdf, starting on page 3"

Relative paths are resolved from the folder the server was started in, so absolute paths or `~/...` are the safest thing to give it.

## Not covered here

HEIC, WebP and AVIF conversion, compression, PDF to image and PDF signing need a browser engine. They are on [stayput.dev](https://stayput.dev), which works the same way: in your browser, nothing uploaded.

## Development

```sh
cd mcp
npm install
npm test   # builds dist/index.js and runs the end-to-end tests
```

The tests use the site's fixtures; generate them first from the repository root with `python3 tests/fixtures/make-fixtures.py && node tests/fixtures/make-pdf.mjs` (needs Pillow and pillow-heif).

The server imports the PDF and metadata code from `../src/lib` and bundles it with esbuild (`build.mjs`). Two browser-only modules are swapped at build time: `src/unlock.ts` loads qpdf from `node_modules` instead of a `<script>` tag, and `src/no-canvas.ts` stands in for the canvas helpers that only PDF compression uses.
