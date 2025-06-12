declare module 'react-native-audio-record' {
  interface InitOptions {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number;
    wavFile?: string;
  }

  interface AudioRecord {
    init: (options: InitOptions) => void;
    start: () => void;
    stop: () => Promise<string>; // returns file path
    on: (event: 'data', cb: (chunk: string) => void) => void;
  }

  const instance: AudioRecord;
  export default instance;
} 