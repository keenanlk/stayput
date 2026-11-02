import { wantVendor } from './vendor';

// Import this from a module that can write MP3, so the encoder is cached after one visit.
// Pages that only decode audio or format a duration must not import it.
wantVendor('lame');
