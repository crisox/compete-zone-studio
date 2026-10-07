import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { buildPrompt, describeColors } from "../src/lib/creativePrompt.ts";
import { prepareLogo, addOfficialLogo } from "../src/lib/logoOverlay.ts";

const exec = promisify(execFile);
const brand = {
  name: "CompeteZone", tagline: "Menos vueltas. Más competencia.",
  website: "competezone.fit", tone: "Rioplatense. Paleta #0F172A y #0EA5E9.",
  colors: ["#0053B4"], logoPath: "/objects/uploads/example", logoUrl: "/api/example",
};
const input = {
  title: "Prueba", prompt: "Atletas con fondo #0F172A, acentos #0EA5E9 y CTA «Competí».",
  kind: "video", audience: "athletes", aspectRatio: "9:16", includeLogo: true,
};

test("Omni receives color descriptions, never hexadecimal tokens", () => {
  const prompt = buildPrompt(input, brand);
  assert.doesNotMatch(prompt, /#[a-f\d]{3,8}\b/i);
  assert.match(prompt, /azul noche/);
  assert.match(prompt, /celeste luminoso/);
  assert.match(prompt, /«Competí»/);
  assert.match(prompt, /carteles, banderas/);
  assert.doesNotMatch(describeColors("#ABC #12345678 #abcd #0053B4"), /#/);
});

const artwork = (color) => sharp(Buffer.from(
  `<svg width="360" height="70"><rect x="20" y="15" width="320" height="40" fill="${color}"/></svg>`,
)).png().toBuffer();

test("black artwork gets a light contrast plate, white artwork gets a dark plate", async () => {
  for (const [color, expected] of [["black", 255], ["white", 15]]) {
    const { plate } = await prepareLogo(await artwork(color), 720, 1280);
    const { data } = await sharp(plate).raw().toBuffer({ resolveWithObject: true });
    assert.equal(data[0], expected);
  }
});

test("empty transparent artwork cannot silently produce a logo-less creation", async () => {
  const empty = await sharp({ create: { width: 80, height: 20, channels: 4, background: "#00000000" } }).png().toBuffer();
  await assert.rejects(prepareLogo(empty, 720, 1280));
});

test("image output includes the original artwork with visible contrast", async () => {
  const source = await sharp({ create: { width: 720, height: 1280, channels: 3, background: "#0F172A" } }).png().toBuffer();
  const bytes = await addOfficialLogo(source, await artwork("black"), "image");
  const { data } = await sharp(bytes).extract({ left: 34, top: 60, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[0], 255);
});

test("video logo stays visible through the last frame and preserves audio and duration", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cz-overlay-test-"));
  try {
    const source = join(dir, "source.mp4");
    await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=navy:s=360x640:r=24:d=2",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source]);
    const { writeFile } = await import("node:fs/promises");
    const output = join(dir, "output.mp4");
    await writeFile(output, await addOfficialLogo(await readFile(source), await artwork("black"), "video"));
    const probe = async (path) => JSON.parse((await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", path])).stdout);
    const before = await probe(source), after = await probe(output);
    assert.ok(after.streams.some((stream) => stream.codec_type === "audio"));
    assert.ok(Math.abs(Number(before.format.duration) - Number(after.format.duration)) < .05);
    const audioHash = async (path) => (await exec("ffmpeg", ["-v", "error", "-i", path, "-map", "0:a:0", "-c", "copy", "-f", "hash", "-"])).stdout;
    assert.equal(await audioHash(source), await audioHash(output));
    for (const seconds of ["0", "1", "1.9"]) {
      const png = join(dir, `frame-${seconds}.png`);
      await exec("ffmpeg", ["-v", "error", "-ss", seconds, "-i", output, "-frames:v", "1", "-y", png]);
      const { data } = await sharp(png).extract({ left: 18, top: 32, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
      assert.ok(data[0] > 220, `logo contrast plate missing at ${seconds}s`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
