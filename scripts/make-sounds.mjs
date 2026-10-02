import { mkdirSync, writeFileSync } from "node:fs";

const rate = 22050;
function wav(samples) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + samples.length * 2, 4);
  data.write("WAVE", 8);
  data.write("fmt ", 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) =>
    data.writeInt16LE(
      Math.max(-32767, Math.min(32767, Math.round(v * 32767))),
      44 + i * 2,
    ),
  );
  return data;
}
function env(t, a, h) {
  if (t < a) return t / a;
  return Math.exp(-(t - a) / h);
}
function noise(n, attack, hold, amp) {
  const out = [];
  for (let i = 0; i < n; i++)
    out.push((Math.random() * 2 - 1) * amp * env(i / rate, attack, hold));
  return out;
}

mkdirSync("public/assets/sounds", { recursive: true });
writeFileSync(
  "public/assets/sounds/shot.wav",
  wav(noise(rate * 0.12, 0.005, 0.04, 0.7)),
);
writeFileSync(
  "public/assets/sounds/hit.wav",
  wav(noise(rate * 0.16, 0.004, 0.05, 0.55)),
);
const boom = [];
for (let i = 0; i < rate * 0.45; i++) {
  const t = i / rate;
  boom.push(
    (Math.random() * 2 - 1) * 0.8 * env(t, 0.01, 0.16) +
      Math.sin(t * 180) * 0.25 * env(t, 0.01, 0.2),
  );
}
writeFileSync("public/assets/sounds/explosion.wav", wav(boom));
const water = [];
for (let i = 0; i < rate * 2; i++) {
  const t = i / rate;
  water.push(
    (Math.random() * 2 - 1) * 0.15 * (0.6 + 0.4 * Math.sin(t * 3)) +
      Math.sin(t * 90) * 0.04,
  );
}
writeFileSync("public/assets/sounds/water.wav", wav(water));
console.log("wrote public/assets/sounds/*.wav");
