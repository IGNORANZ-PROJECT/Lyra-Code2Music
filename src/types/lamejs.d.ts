declare module "lamejs" {
  export class Mp3Encoder {
    constructor(channels: number, sampleRate: number, kbps: number);
    encodeBuffer(left: Int16Array, right?: Int16Array): Uint8Array;
    flush(): Uint8Array;
  }
}

declare module "lamejs/src/js/MPEGMode.js" {
  const MPEGMode: unknown;
  export default MPEGMode;
}

declare module "lamejs/src/js/Lame.js" {
  const Lame: unknown;
  export default Lame;
}

declare module "lamejs/src/js/BitStream.js" {
  const BitStream: unknown;
  export default BitStream;
}

declare module "lamejs/src/js/Encoder.js" {
  const Encoder: unknown;
  export default Encoder;
}

declare module "lamejs/src/js/Version.js" {
  const Version: unknown;
  export default Version;
}

declare module "lamejs/src/js/VBRTag.js" {
  const VBRTag: unknown;
  export default VBRTag;
}

declare module "lamejs/src/js/Presets.js" {
  const Presets: unknown;
  export default Presets;
}

declare module "lamejs/src/js/GainAnalysis.js" {
  const GainAnalysis: unknown;
  export default GainAnalysis;
}

declare module "lamejs/src/js/QuantizePVT.js" {
  const QuantizePVT: unknown;
  export default QuantizePVT;
}

declare module "lamejs/src/js/Quantize.js" {
  const Quantize: unknown;
  export default Quantize;
}

declare module "lamejs/src/js/Takehiro.js" {
  const Takehiro: unknown;
  export default Takehiro;
}

declare module "lamejs/src/js/Reservoir.js" {
  const Reservoir: unknown;
  export default Reservoir;
}
