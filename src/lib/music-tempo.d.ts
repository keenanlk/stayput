declare module 'music-tempo' {
  export default class MusicTempo {
    constructor(audioData: Float32Array | number[], params?: Record<string, number>);
    tempo: number;
    beats: number[];
  }
}
