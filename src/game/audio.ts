const FILES = {
  shot: "shot.wav",
  hit: "hit.wav",
  boom: "explosion.wav",
  water: "water.wav",
} as const;
export type SfxName = "shot" | "hit" | "boom";

/** Plays the WAV pack. If a file is missing, a short synthesized tone is used instead. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loop: AudioBufferSourceNode | null = null;
  muted = false;

  async load(base: string) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    await Promise.all(
      Object.entries(FILES).map(async ([name, file]) => {
        try {
          const res = await fetch(`${base}assets/sounds/${file}`);
          if (!res.ok) return;
          const decoded = await this.ctx!.decodeAudioData(
            await res.arrayBuffer(),
          );
          this.buffers.set(name, decoded);
        } catch {
          /* fallback tone on play */
        }
      }),
    );
  }

  resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  startAmbience() {
    if (!this.ctx || this.loop) return;
    const buffer = this.buffers.get("water");
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.18;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
    this.loop = src;
  }

  play(name: SfxName) {
    if (this.muted || !this.ctx) return;
    this.resume();
    const buffer = this.buffers.get(name);
    if (!buffer) {
      this.tone(name);
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = name === "boom" ? 0.55 : 0.4;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }

  private tone(name: SfxName) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = name === "shot" ? "square" : "sawtooth";
    o.frequency.value = name === "boom" ? 90 : name === "hit" ? 220 : 440;
    g.gain.setValueAtTime(0.08, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(
      0.001,
      this.ctx.currentTime + (name === "boom" ? 0.35 : 0.12),
    );
    o.connect(g).connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + 0.4);
  }

  dispose() {
    this.loop?.stop();
    this.loop = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}
