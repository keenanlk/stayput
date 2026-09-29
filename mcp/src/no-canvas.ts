// Stand-in for src/lib/image.ts when pdf.ts is bundled for Node. Only PDF
// compression uses canvasToBlob, and the server does not offer compression.
export function canvasToBlob(): Promise<Blob> {
  throw new Error('Canvas is not available outside the browser.');
}
