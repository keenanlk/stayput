declare module 'pdfmake/build/pdfmake' {
  const pdfMake: {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    addFonts(fonts: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>): void;
    createPdf(definition: unknown): { getBuffer(): Promise<Uint8Array> };
  };
  export default pdfMake;
}
declare module 'pdfmake/build/vfs_fonts' {
  const vfs: Record<string, string>;
  export default vfs;
}
