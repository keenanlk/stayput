// Vite's worker import, used by the site's pdf.ts for pdf.js. The server never
// loads pdf.js, so only the type is needed.
declare module '*?worker' {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
