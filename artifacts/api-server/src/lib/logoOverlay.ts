import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const exec = promisify(execFile);

export async function prepareLogo(logo: Buffer, width: number, height: number) {
  // Keep the original artwork and colors; only remove its outer blank margins.
  const trimmed = await sharp(logo).rotate().trim({ threshold: 8 }).png().toBuffer();
  const { data, info } = await sharp(trimmed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let totalAlpha = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const alpha = data[i + 3] / 255;
    if (alpha < .1) continue;
    totalAlpha += alpha;
  }
  if (totalAlpha === 0) throw new Error("El archivo del logo es completamente transparente. Cargá un logo visible en Marca.");
  const background = "#FFFFFF";
  const padding = Math.max(8, Math.round(width * .015));
  const resized = await sharp(trimmed).resize({
    width: Math.round(width * .36),
    height: Math.round(height * .12),
    fit: "inside",
  }).png().toBuffer({ resolveWithObject: true });
  // The official artwork always sits on white, as requested by the brand owner.
  const plate = await sharp({
    create: {
      width: resized.info.width + padding * 2,
      height: resized.info.height + padding * 2,
      channels: 4,
      background,
    },
  }).composite([{ input: resized.data, left: padding, top: padding }]).png().toBuffer();
  return { plate, left: Math.round(width * .045), top: Math.round(height * .045) };
}

export async function addOfficialLogo(bytes: Buffer, logo: Buffer, kind: string) {
  if (kind === "image") {
    const normalized = await sharp(bytes).rotate().toBuffer();
    const meta = await sharp(normalized).metadata();
    if (!meta.width || !meta.height) throw new Error("No se pudo leer el tamaño de la imagen.");
    const { plate, left, top } = await prepareLogo(logo, meta.width, meta.height);
    return sharp(normalized).composite([{ input: plate, left, top }]).png().toBuffer();
  }
  const dir = await mkdtemp(join(tmpdir(), "competezone-"));
  try {
    const input = join(dir, "input.mp4"), logoFile = join(dir, "logo.png"), output = join(dir, "output.mp4");
    await writeFile(input, bytes);
    const probe = await exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", input], { timeout: 30_000 });
    const dimensions = JSON.parse(probe.stdout).streams?.[0] as { width: number; height: number };
    if (!dimensions?.width || !dimensions.height) throw new Error("No se pudo leer el tamaño del video.");
    const { plate, left, top } = await prepareLogo(logo, dimensions.width, dimensions.height);
    await writeFile(logoFile, plate);
    // Explicitly repeat the logo's frame to the end. Copy the existing audio,
    // keep the source duration and produce a broadly playable MP4.
    await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-i", input, "-i", logoFile, "-filter_complex",
      `[0:v][1:v]overlay=x=${left}:y=${top}:eof_action=repeat:repeatlast=1:format=auto[v]`,
      "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "fast", "-crf", "20",
      "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output],
      { timeout: 120_000, maxBuffer: 1024 * 1024 });
    return await readFile(output);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("El archivo del logo")) throw error;
    throw new Error("No se pudo incorporar el logo oficial al video. La creación no se publicará sin el logo solicitado.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
