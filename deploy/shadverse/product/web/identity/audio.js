// Microphone samples stay in this document. Only the preview player's source
// connects to the speakers. Both paths use the same audio measurements.
import sample from "./voice.mp3";
export class Signal {
  constructor(onEnd) {
    this.onEnd = onEnd;
    this.epoch = 0;
    this.mode = "off";
  }
  stop() {
    this.epoch++;
    if (this.source) {
      this.source.onended = null;
      this.source.disconnect();
      this.source = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.context) {
      this.context.close().catch(() => {});
      this.context = null;
    }
    this.analyser = null;
    this.mode = "off";
  }
  async start(mode) {
    this.stop();
    const epoch = this.epoch;
    const ctx = (this.context = new AudioContext());
    try {
      await ctx.resume();
      if (epoch !== this.epoch) return false;
      let source;
      if (mode === "mic") {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true },
          video: false,
        });
        if (epoch !== this.epoch) {
          stream.getTracks().forEach((track) => track.stop());
          return false;
        }
        this.stream = stream;
        source = ctx.createMediaStreamSource(stream);
        stream.getAudioTracks()[0].onended = () => this.finish(epoch);
      } else {
        const buffer = await ctx.decodeAudioData(sample.slice().buffer);
        if (epoch !== this.epoch) return false;
        source = ctx.createBufferSource();
        source.buffer = buffer;
        source.onended = () => this.finish(epoch);
      }
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.55;
      this.wave = new Float32Array(512);
      this.bins = new Uint8Array(256);
      source.connect(this.analyser);
      this.source = source;
      this.mode = mode;
      if (mode === "sample") {
        this.analyser.connect(ctx.destination);
        source.start();
      }
      return true;
    } catch (err) {
      if (epoch === this.epoch) {
        this.stop();
        throw err;
      }
      return false;
    }
  }
  finish(epoch) {
    if (epoch === this.epoch) {
      this.stop();
      this.onEnd();
    }
  }
  read() {
    if (!this.analyser) return [0, 0];
    this.analyser.getFloatTimeDomainData(this.wave);
    this.analyser.getByteFrequencyData(this.bins);
    let sum = 0,
      weight = 0,
      total = 0;
    for (const x of this.wave) sum += x * x;
    for (let i = 1; i < this.bins.length; i++) {
      total += this.bins[i];
      weight += i * this.bins[i];
    }
    return [
      Math.min(1, 4 * Math.sqrt(sum / this.wave.length)),
      total ? Math.min(1, weight / total / 64) : 0,
    ];
  }
}
