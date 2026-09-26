/**
 * The PDF standard security handler (ISO 32000-2 section 7.6), on top of
 * pdf-lib's parser and writer. `decryptPdf` opens a password-protected file
 * with the user or owner password and writes it back without encryption;
 * `encryptPdf` protects a file with AES-256 (revision 6), the current
 * standard that Acrobat, Preview, Chrome, Firefox and pdf.js all open.
 * Everything runs in memory in the tab; passwords never leave it.
 */
import type * as PdfLib from 'pdf-lib';
import { aesCbcDecrypt, aesCbcDecryptRaw, aesCbcEncrypt, aesCbcEncryptRaw, aesEcbBlock, concat, equal, latin1, md5, randomBytes, rc4, sha, utf8 } from './pdfcrypt';

const PAD = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

export class WrongPasswordError extends Error {
  constructor() {
    super('That password does not open this PDF. Check it and try again.');
    this.name = 'WrongPasswordError';
  }
}
export class NotEncryptedError extends Error {
  constructor() {
    super('This PDF is not password-protected, so there is nothing to unlock.');
    this.name = 'NotEncryptedError';
  }
}

type Cipher = 'rc4' | 'aes' | 'identity';

interface Security {
  key: Uint8Array;
  /** Revision of the security handler. */
  r: number;
  strings: Cipher;
  streams: Cipher;
  encryptMetadata: boolean;
}

/* ------------------------------------------------------------------ */
/* Key computation for revisions 2 to 4 (RC4 and AES-128)              */
/* ------------------------------------------------------------------ */
const padPassword = (pw: Uint8Array) => concat(pw, PAD).subarray(0, 32);

function keyFromUserPassword(pw: Uint8Array, o: Uint8Array, p: number, id0: Uint8Array, r: number, length: number, encryptMetadata: boolean): Uint8Array {
  const pBytes = new Uint8Array(4);
  new DataView(pBytes.buffer).setInt32(0, p, true);
  let parts = [padPassword(pw), o.subarray(0, 32), pBytes, id0];
  if (r >= 4 && !encryptMetadata) parts.push(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
  let hash = md5(concat(...parts));
  const n = r === 2 ? 5 : length / 8;
  if (r >= 3) for (let i = 0; i < 50; i++) hash = md5(hash.subarray(0, n));
  return hash.subarray(0, n);
}

function userPasswordMatches(key: Uint8Array, u: Uint8Array, id0: Uint8Array, r: number): boolean {
  if (r === 2) return equal(rc4(key, PAD), u.subarray(0, 32));
  let x = rc4(key, md5(concat(PAD, id0)));
  for (let i = 1; i <= 19; i++) x = rc4(key.map((b) => b ^ i), x);
  return equal(x, u.subarray(0, 16));
}

/** Algorithm 7: recover the user password from the owner password. */
function userPasswordFromOwner(owner: Uint8Array, o: Uint8Array, r: number, length: number): Uint8Array {
  let hash = md5(padPassword(owner));
  const n = r === 2 ? 5 : length / 8;
  if (r >= 3) for (let i = 0; i < 50; i++) hash = md5(hash.subarray(0, n));
  const key = hash.subarray(0, n);
  let x = o.subarray(0, 32);
  if (r === 2) x = rc4(key, x);
  else for (let i = 19; i >= 0; i--) x = rc4(key.map((b) => b ^ i), x);
  return x;
}

/* ------------------------------------------------------------------ */
/* Revisions 5 and 6 (AES-256)                                         */
/* ------------------------------------------------------------------ */
/** Hash algorithm 2.B (revision 6), or plain SHA-256 for revision 5. */
async function hash256(pw: Uint8Array, salt: Uint8Array, udata: Uint8Array, r: number): Promise<Uint8Array> {
  let k = await sha(256, concat(pw, salt, udata));
  if (r === 5) return k;
  for (let i = 0; ; i++) {
    const k1 = concat(pw, k, udata);
    const rep = new Uint8Array(k1.length * 64);
    for (let j = 0; j < 64; j++) rep.set(k1, j * k1.length);
    const e = aesCbcEncryptRaw(k.subarray(0, 16), k.subarray(16, 32), rep);
    let sum = 0;
    for (let j = 0; j < 16; j++) sum += e[j]!;
    const mod = sum % 3;
    k = await sha(mod === 0 ? 256 : mod === 1 ? 384 : 512, e);
    if (i >= 63 && e[e.length - 1]! <= i - 32) break;
  }
  return k.subarray(0, 32);
}

const truncateUtf8 = (s: string) => utf8(s).subarray(0, 127);

async function keyFromPassword256(pw: Uint8Array, o: Uint8Array, u: Uint8Array, oe: Uint8Array, ue: Uint8Array, r: number): Promise<Uint8Array | undefined> {
  const uValidation = u.subarray(32, 40);
  const uKeySalt = u.subarray(40, 48);
  if (equal(await hash256(pw, uValidation, new Uint8Array(0), r), u.subarray(0, 32))) {
    const ik = await hash256(pw, uKeySalt, new Uint8Array(0), r);
    return aesCbcDecryptRaw(ik, new Uint8Array(16), ue.subarray(0, 32));
  }
  const oValidation = o.subarray(32, 40);
  const oKeySalt = o.subarray(40, 48);
  const u48 = u.subarray(0, 48);
  if (equal(await hash256(pw, oValidation, u48, r), o.subarray(0, 32))) {
    const ik = await hash256(pw, oKeySalt, u48, r);
    return aesCbcDecryptRaw(ik, new Uint8Array(16), oe.subarray(0, 32));
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Object-level encryption                                             */
/* ------------------------------------------------------------------ */
const AES_SALT = new Uint8Array([0x73, 0x41, 0x6c, 0x54]);

function objectKey(sec: Security, cipher: Cipher, num: number, gen: number): Uint8Array {
  if (sec.r >= 5) return sec.key;
  const extra = new Uint8Array([num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, gen & 0xff, (gen >> 8) & 0xff]);
  const parts = [sec.key, extra];
  if (cipher === 'aes') parts.push(AES_SALT);
  const hash = md5(concat(...parts));
  return hash.subarray(0, Math.min(sec.key.length + 5, 16));
}

function decryptBytes(sec: Security, cipher: Cipher, num: number, gen: number, data: Uint8Array): Uint8Array {
  if (cipher === 'identity') return data;
  const key = objectKey(sec, cipher, num, gen);
  return cipher === 'aes' ? aesCbcDecrypt(key, data) : rc4(key, data);
}

function encryptBytes(sec: Security, cipher: Cipher, num: number, gen: number, data: Uint8Array): Uint8Array {
  if (cipher === 'identity') return data;
  const key = objectKey(sec, cipher, num, gen);
  return cipher === 'aes' ? aesCbcEncrypt(key, data) : rc4(key, data);
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** Replace every string inside an object (dicts and arrays, recursively). */
function mapStrings(lib: typeof PdfLib, obj: PdfLib.PDFObject, fn: (bytes: Uint8Array) => Uint8Array): void {
  const { PDFDict, PDFArray, PDFString, PDFHexString, PDFStream } = lib;
  const visit = (o: PdfLib.PDFObject): PdfLib.PDFObject => {
    if (o instanceof PDFString || o instanceof PDFHexString) return PDFHexString.of(toHex(fn(o.asBytes())));
    if (o instanceof PDFArray) {
      for (let i = 0; i < o.size(); i++) o.set(i, visit(o.get(i)));
    } else if (o instanceof PDFDict) {
      for (const [k, v] of o.entries()) o.set(k, visit(v));
    } else if (o instanceof PDFStream) {
      visit(o.dict);
    }
    return o;
  };
  visit(obj);
}

/* ------------------------------------------------------------------ */
/* Reading the /Encrypt dictionary                                     */
/* ------------------------------------------------------------------ */
function bytesOf(lib: typeof PdfLib, o: PdfLib.PDFObject | undefined): Uint8Array {
  if (o instanceof lib.PDFString || o instanceof lib.PDFHexString) return o.asBytes();
  return new Uint8Array(0);
}
function numberOf(lib: typeof PdfLib, o: PdfLib.PDFObject | undefined, fallback: number): number {
  return o instanceof lib.PDFNumber ? o.asNumber() : fallback;
}
function nameOf(lib: typeof PdfLib, o: PdfLib.PDFObject | undefined): string {
  return o instanceof lib.PDFName ? o.decodeText() : '';
}

async function securityFor(lib: typeof PdfLib, context: PdfLib.PDFContext, password: string): Promise<Security> {
  const encRef = context.trailerInfo.Encrypt;
  const enc = encRef ? context.lookup(encRef) : undefined;
  if (!(enc instanceof lib.PDFDict)) throw new NotEncryptedError();
  const n = (k: string) => enc.get(lib.PDFName.of(k));
  if (nameOf(lib, n('Filter')) !== 'Standard') throw new Error('This PDF uses a security handler this tool does not support (certificate encryption).');
  const v = numberOf(lib, n('V'), 0);
  const r = numberOf(lib, n('R'), 2);
  let length = numberOf(lib, n('Length'), 40);
  const p = numberOf(lib, n('P'), -1) | 0;
  const o = bytesOf(lib, n('O'));
  const u = bytesOf(lib, n('U'));
  const em = n('EncryptMetadata');
  const encryptMetadata = !(em instanceof lib.PDFBool && !em.asBoolean());
  const idArr = context.trailerInfo.ID ? context.lookup(context.trailerInfo.ID) : undefined;
  const id0 = idArr instanceof lib.PDFArray && idArr.size() > 0 ? bytesOf(lib, context.lookup(idArr.get(0))) : new Uint8Array(0);

  let strings: Cipher = 'rc4';
  let streams: Cipher = 'rc4';
  if (v >= 4) {
    const cf = n('CF');
    const cfDict = cf instanceof lib.PDFDict ? cf : cf ? context.lookup(cf) : undefined;
    const filterCipher = (nm: string): Cipher => {
      if (nm === 'Identity') return 'identity';
      const f = cfDict instanceof lib.PDFDict ? cfDict.get(lib.PDFName.of(nm)) : undefined;
      const fd = f instanceof lib.PDFDict ? f : f ? context.lookup(f) : undefined;
      const cfm = fd instanceof lib.PDFDict ? nameOf(lib, fd.get(lib.PDFName.of('CFM'))) : '';
      if (fd instanceof lib.PDFDict) {
        const l = numberOf(lib, fd.get(lib.PDFName.of('Length')), 0);
        if (l > 0) length = l <= 40 ? l * 8 : l;
      }
      if (cfm === 'AESV2' || cfm === 'AESV3') return 'aes';
      if (cfm === 'None') return 'identity';
      return 'rc4';
    };
    strings = filterCipher(nameOf(lib, n('StrF')) || 'Identity');
    streams = filterCipher(nameOf(lib, n('StmF')) || 'Identity');
  }

  let key: Uint8Array | undefined;
  if (r >= 5) {
    key = await keyFromPassword256(truncateUtf8(password), o, u, bytesOf(lib, n('OE')), bytesOf(lib, n('UE')), r);
  } else {
    const pw = latin1(password);
    const tryUser = (candidate: Uint8Array) => {
      const k = keyFromUserPassword(candidate, o, p, id0, r, length, encryptMetadata);
      return userPasswordMatches(k, u, id0, r) ? k : undefined;
    };
    key = tryUser(pw) ?? tryUser(userPasswordFromOwner(pw, o, r, length));
  }
  if (!key) throw new WrongPasswordError();
  return { key, r, strings, streams, encryptMetadata };
}

/* ------------------------------------------------------------------ */
/* Decrypt                                                             */
/* ------------------------------------------------------------------ */
export interface UnlockResult {
  bytes: Uint8Array;
  pages: number;
  /** What the file was protected with, for the results note. */
  method: string;
}

/**
 * Open an encrypted PDF and write it back with no encryption. The password
 * may be the user (open) password or the owner (permissions) password; an
 * empty password unlocks files that only restrict printing or copying.
 */
export async function decryptPdf(lib: typeof PdfLib, bytes: Uint8Array, password: string): Promise<UnlockResult> {
  const { PDFDocument, PDFParser, PDFRawStream, PDFName, PDFObjectStreamParser, PDFXRefStreamParser } = lib;
  // First pass: read the trailer to find the encryption dictionary. Object
  // streams cannot be parsed yet (they are encrypted), which pdf-lib tolerates.
  const warn = console.warn;
  console.warn = () => {};
  let probe: PdfLib.PDFDocument;
  try {
    probe = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } finally {
    console.warn = warn;
  }
  const sec = await securityFor(lib, probe.context, password);
  const encRef = probe.context.trailerInfo.Encrypt;
  const encNum = encRef instanceof lib.PDFRef ? encRef.objectNumber : -1;

  // Second pass: parse again, decrypting each indirect object as it is read so
  // object streams and cross-reference streams are handled the way the
  // parser expects.
  const parser = PDFParser.forBytesWithOptions(bytes, Infinity, false, false) as unknown as ParserInternals;
  parser.parseIndirectObject = async function () {
    const ref = this.parseIndirectObjectHeader();
    this.skipWhitespaceAndComments();
    let object = this.parseObject();
    this.skipWhitespaceAndComments();
    this.matchKeyword(ENDOBJ);
    const num = ref.objectNumber;
    const gen = ref.generationNumber;
    const isXref = object instanceof PDFRawStream && object.dict.get(PDFName.of('Type')) === PDFName.of('XRef');
    if (num !== encNum && !isXref) {
      mapStrings(lib, object, (b) => decryptBytes(sec, sec.strings, num, gen, b));
      if (object instanceof PDFRawStream) {
        const isMetadata = object.dict.get(PDFName.of('Type')) === PDFName.of('Metadata');
        if (!(isMetadata && !sec.encryptMetadata)) {
          const dec = decryptBytes(sec, sec.streams, num, gen, object.contents);
          object = PDFRawStream.of(object.dict, dec);
        }
      }
    }
    if (object instanceof PDFRawStream && object.dict.get(PDFName.of('Type')) === PDFName.of('ObjStm')) {
      await PDFObjectStreamParser.forStream(object, this.shouldWaitForTick).parseIntoContext();
    } else if (isXref) {
      PDFXRefStreamParser.forStream(object as PdfLib.PDFRawStream).parseIntoContext();
    } else {
      this.context.assign(ref, object);
    }
    return ref;
  };
  const context = await parser.parseDocument();
  delete context.trailerInfo.Encrypt;
  if (encNum >= 0) context.delete(lib.PDFRef.of(encNum));
  const doc = newDocument(lib, context);
  const out = await doc.save({ useObjectStreams: true });
  const method = sec.r >= 5 ? 'AES-256' : sec.streams === 'aes' ? 'AES-128' : `RC4 ${sec.key.length * 8}-bit`;
  return { bytes: out, pages: doc.getPageCount(), method };
}

/** The keyword bytes for "endobj", as pdf-lib's parser matches them. */
const ENDOBJ = new Uint8Array([0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a]);

interface ParserInternals {
  parseIndirectObjectHeader(): PdfLib.PDFRef;
  skipWhitespaceAndComments(): void;
  parseObject(): PdfLib.PDFObject;
  matchKeyword(k: Uint8Array): boolean;
  shouldWaitForTick: () => boolean;
  context: PdfLib.PDFContext;
  parseIndirectObject(): Promise<PdfLib.PDFRef>;
  parseDocument(): Promise<PdfLib.PDFContext>;
}

function newDocument(lib: typeof PdfLib, context: PdfLib.PDFContext): PdfLib.PDFDocument {
  // pdf-lib's constructor is private in its typings but is the only way to
  // wrap an already parsed context.
  const Ctor = lib.PDFDocument as unknown as new (c: PdfLib.PDFContext, ignoreEncryption: boolean, updateMetadata: boolean) => PdfLib.PDFDocument;
  return new Ctor(context, true, false);
}

/* ------------------------------------------------------------------ */
/* Encrypt                                                             */
/* ------------------------------------------------------------------ */
export interface ProtectOptions {
  /** Needed to open the file. May be empty when an owner password is set. */
  userPassword: string;
  /** Needed to change permissions. Defaults to the user password. */
  ownerPassword?: string;
  allowPrinting?: boolean;
  allowCopying?: boolean;
  allowEditing?: boolean;
}

export function permissionBits(o: ProtectOptions): number {
  // Bits 1-2 reserved (must be 0), bits 7-8 and 13-32 must be 1.
  let p = -1 & ~0b11; // start with everything allowed except the reserved bits
  p &= ~0b11; // keep reserved bits clear
  if (!o.allowPrinting) p &= ~(1 << 2) & ~(1 << 11); // print, high-quality print
  if (!o.allowEditing) p &= ~(1 << 3) & ~(1 << 5) & ~(1 << 8) & ~(1 << 10); // modify, annotate, fill forms, assemble
  if (!o.allowCopying) p &= ~(1 << 4) & ~(1 << 9); // copy, accessibility copy
  return p | 0;
}

/**
 * Protect a PDF with AES-256 (revision 6). The document is rewritten with
 * every string and stream encrypted under a fresh random file key, which is
 * itself wrapped by the password hashes in the /Encrypt dictionary.
 */
export async function encryptPdf(lib: typeof PdfLib, bytes: Uint8Array, opts: ProtectOptions): Promise<{ bytes: Uint8Array; pages: number }> {
  const { PDFDocument, PDFStream, PDFRawStream, PDFName, PDFNumber, PDFDict, PDFHexString, PDFArray, PDFBool } = lib;
  const doc = await PDFDocument.load(bytes);
  const context = doc.context;
  const userPw = truncateUtf8(opts.userPassword);
  const ownerPw = truncateUtf8(opts.ownerPassword || opts.userPassword);
  const p = permissionBits(opts);

  const fileKey = randomBytes(32);
  const uValidation = randomBytes(8);
  const uKeySalt = randomBytes(8);
  const uHash = await hash256(userPw, uValidation, new Uint8Array(0), 6);
  const u = concat(uHash, uValidation, uKeySalt);
  const uIntermediate = await hash256(userPw, uKeySalt, new Uint8Array(0), 6);
  const ue = aesCbcEncryptRaw(uIntermediate, new Uint8Array(16), fileKey);
  const oValidation = randomBytes(8);
  const oKeySalt = randomBytes(8);
  const oHash = await hash256(ownerPw, oValidation, u, 6);
  const o = concat(oHash, oValidation, oKeySalt);
  const oIntermediate = await hash256(ownerPw, oKeySalt, u, 6);
  const oe = aesCbcEncryptRaw(oIntermediate, new Uint8Array(16), fileKey);
  const permsPlain = new Uint8Array(16);
  new DataView(permsPlain.buffer).setInt32(0, p, true);
  permsPlain.set([0xff, 0xff, 0xff, 0xff, 0x54, 0x61, 0x64, 0x62], 4);
  permsPlain.set(randomBytes(4), 12);
  const perms = aesEcbBlock(fileKey, permsPlain);

  const sec: Security = { key: fileKey, r: 6, strings: 'aes', streams: 'aes', encryptMetadata: true };

  // Flush pdf-lib's own pending work (form appearances) before touching objects.
  doc.getForm().updateFieldAppearances?.();
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    const num = ref.objectNumber;
    const gen = ref.generationNumber;
    mapStrings(lib, object, (b) => encryptBytes(sec, 'aes', num, gen, b));
    if (object instanceof PDFStream) {
      const plain = object instanceof PDFRawStream ? object.contents : object.getContents();
      const dict = object.dict;
      // Streams built by pdf-lib set their own filters when serialised; keep them.
      if (!(object instanceof PDFRawStream)) object.updateDict();
      const enc = encryptBytes(sec, 'aes', num, gen, plain);
      const raw = PDFRawStream.of(dict, enc);
      dict.set(PDFName.of('Length'), PDFNumber.of(enc.length));
      context.assign(ref, raw);
    }
  }

  const hex = (b: Uint8Array) => PDFHexString.of(toHex(b));
  const stdCf = PDFDict.withContext(context);
  stdCf.set(PDFName.of('CFM'), PDFName.of('AESV3'));
  stdCf.set(PDFName.of('AuthEvent'), PDFName.of('DocOpen'));
  stdCf.set(PDFName.of('Length'), PDFNumber.of(32));
  const cf = PDFDict.withContext(context);
  cf.set(PDFName.of('StdCF'), stdCf);
  const encDict = PDFDict.withContext(context);
  encDict.set(PDFName.of('Filter'), PDFName.of('Standard'));
  encDict.set(PDFName.of('V'), PDFNumber.of(5));
  encDict.set(PDFName.of('R'), PDFNumber.of(6));
  encDict.set(PDFName.of('Length'), PDFNumber.of(256));
  encDict.set(PDFName.of('CF'), cf);
  encDict.set(PDFName.of('StmF'), PDFName.of('StdCF'));
  encDict.set(PDFName.of('StrF'), PDFName.of('StdCF'));
  encDict.set(PDFName.of('O'), hex(o));
  encDict.set(PDFName.of('U'), hex(u));
  encDict.set(PDFName.of('OE'), hex(oe));
  encDict.set(PDFName.of('UE'), hex(ue));
  encDict.set(PDFName.of('P'), PDFNumber.of(p));
  encDict.set(PDFName.of('Perms'), hex(perms));
  encDict.set(PDFName.of('EncryptMetadata'), PDFBool.True);
  context.trailerInfo.Encrypt = context.register(encDict);
  const idArr = context.trailerInfo.ID ? context.lookup(context.trailerInfo.ID) : undefined;
  const id0 = idArr instanceof PDFArray && idArr.size() > 0 ? bytesOf(lib, context.lookup(idArr.get(0))) : randomBytes(16);
  const ids = PDFArray.withContext(context);
  ids.push(hex(id0));
  ids.push(hex(randomBytes(16)));
  context.trailerInfo.ID = ids;

  // Object streams would hold unencrypted copies of the objects, so write
  // every object on its own.
  const out = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
  return { bytes: out, pages: doc.getPageCount() };
}
