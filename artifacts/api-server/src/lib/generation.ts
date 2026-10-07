import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db, creationsTable } from "@workspace/db";
import type { CreationInput } from "@workspace/api-zod";
import type { StudioBrand } from "./brand";
import { objectStorageClient, ObjectStorageService } from "./objectStorage";
import { ownedUpload } from "../routes/storage";
import { logger } from "./logger";

export const IMAGE_MODEL = "gemini-nano-banana-2.1";
export const VIDEO_MODEL = "gemini-omni-1.1-flash";
const googleBase = "https://generativelanguage.googleapis.com/v1beta";
const storage = new ObjectStorageService();
const exec = promisify(execFile);

interface ProviderOutput {
  type?: string;
  mime_type?: string;
  data?: string;
  uri?: string;
}
interface Interaction {
  id?: string;
  status?: string;
  steps?: { type?: string; content?: ProviderOutput[] }[];
  outputs?: ProviderOutput[];
  output_video?: ProviderOutput;
  error?: { message?: string };
  candidates?: { content?: { parts?: { thought?: boolean; text?: string; inlineData?: { data?: string; mimeType?: string } }[] } }[];
  promptFeedback?: { blockReason?: string };
}

function sanitizeMessage(message: string): string {
  const key = process.env.GEMINI_API_KEY;
  return (key ? message.replaceAll(key, "[clave protegida]") : message)
    .replace(/https?:\/\/\S+/g, "[URL del proveedor]").slice(0, 500);
}

async function googleJson(path: string, method: "POST" | "GET", body?: unknown) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Falta configurar GEMINI_API_KEY como secreto del servidor.");
  const response = await fetch(`${googleBase}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(300_000),
  });
  const payload = await response.json() as Interaction;
  if (!response.ok) {
    const detail = sanitizeMessage(payload.error?.message ?? `HTTP ${response.status}`);
    if (response.status === 429) throw new Error(`Google: cuota o límite alcanzado. Revisá la cuota y facturación de tu cuenta. ${detail}`);
    if (response.status === 403 || response.status === 401) throw new Error(`Google rechazó el acceso al modelo. Revisá los permisos de la clave. ${detail}`);
    if (response.status === 404) throw new Error(`El modelo no está disponible para esta cuenta o endpoint. ${detail}`);
    throw new Error(`Google (${response.status}): ${detail}`);
  }
  return payload;
}

function buildPrompt(input: CreationInput, brand: StudioBrand) {
  return [
    "Creá contenido audiovisual de marketing para CompeteZone, plataforma que conecta atletas y organizaciones para descubrir competencias, gestionar inscripciones y compartir resultados.",
    `Público: ${input.audience === "organizers" ? "organizadores, boxes, gimnasios, clubes y federaciones de Uruguay" : "atletas y equipos de CrossFit, entrenamiento funcional, HYROX y running"}.`,
    `Voz: ${brand.tone}. Promesa: ${brand.tagline}. Website: ${brand.website}.`,
    "Identidad: azul #0053B4, fondo oscuro #0F172A, blanco #FFFFFF y apoyo #0EA5E9. Acento #A8FF00 moderado. Tipografía legible estilo Inter.",
    "Mostrá esfuerzo, compañerismo y participación. No inventes testimonios, datos, resultados, eventos ni interfaces de la app. Las personas representadas deben ser adultas.",
    "En pantalla se escribe CompeteZone. En narración se pronuncia «Compit Zone». Usá voseo, un único CTA claro y textos legibles.",
    "No generes ni recrees el logo oficial: se agrega posteriormente si el usuario lo solicita. No agregues marcas ficticias.",
    input.kind === "video" ? "Generá un video corto con audio, sonidos naturales y narración rioplatense si la idea lo pide. No copies música comercial. Resolución 720p." : "Generá una imagen final para redes sociales.",
    `IDEA DEL USUARIO:\n${input.prompt}`,
  ].join("\n");
}

async function addOfficialLogo(bytes: Buffer, logo: Buffer, kind: string) {
  if (kind === "image") {
    const meta = await sharp(bytes).metadata();
    const width = meta.width ?? 1024;
    const height = meta.height ?? 1024;
    const margin = Math.round(width * .045);
    const resized = await sharp(logo).resize({ width: Math.round(width * .22), height: Math.round(height * .12), fit: "inside" }).png().toBuffer();
    const logoMeta = await sharp(resized).metadata();
    return sharp(bytes).composite([{ input: resized, left: margin, top: height - (logoMeta.height ?? 100) - margin }]).png().toBuffer();
  }
  const dir = await mkdtemp(join(tmpdir(), "competezone-"));
  try {
    const input = join(dir, "input.mp4"), logoFile = join(dir, "logo.png"), output = join(dir, "output.mp4");
    await writeFile(input, bytes);
    const probe = await exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", input], { timeout: 30_000 });
    const dimensions = JSON.parse(probe.stdout).streams?.[0] as { width: number; height: number };
    if (!dimensions?.width || !dimensions.height) throw new Error("No se pudo leer el tamaño del video.");
    await writeFile(logoFile, await sharp(logo).resize({ width: Math.round(dimensions.width * .22), height: Math.round(dimensions.height * .12), fit: "inside" }).png().toBuffer());
    // Overlay the original file, never ask the model to redraw an official logo.
    await exec("ffmpeg", ["-y", "-i", input, "-i", logoFile, "-filter_complex",
      "[0:v][1:v]overlay=x=main_w*0.045:y=main_h-overlay_h-main_w*0.045:format=auto[v]",
      "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "copy", "-movflags", "+faststart", output], { timeout: 120_000, maxBuffer: 1024 * 1024 });
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function saveGenerated(bytes: Buffer, mime: string) {
  const path = `/objects/generated/${randomUUID()}`;
  const full = `${storage.getPrivateObjectDir()}/${path.slice("/objects/".length)}`;
  const parts = full.replace(/^\//, "").split("/");
  const bucket = parts.shift()!;
  await objectStorageClient.bucket(bucket).file(parts.join("/")).save(bytes, {
    resumable: false, metadata: { contentType: mime },
  });
  return path;
}

export async function runGeneration(id: string, ownerId: string, input: CreationInput, brand: StudioBrand) {
  try {
    const refs = await Promise.all((input.referencePaths ?? []).map(path => ownedUpload(path, ownerId)));
    const prompt = buildPrompt(input, brand);
    let bytes: Buffer;
    let mime: string;
    if (input.kind === "image") {
      const payload = await googleJson(`/models/${IMAGE_MODEL}:generateContent`, "POST", {
        contents: [{ role: "user", parts: [
          ...refs.map(ref => ({ inlineData: { data: ref.bytes.toString("base64"), mimeType: ref.mime } })),
          { text: prompt },
        ] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: input.aspectRatio } },
      });
      const parts = payload.candidates?.[0]?.content?.parts ?? [];
      const image = parts.find((part: { inlineData?: { mimeType?: string }; thought?: boolean }) => part.inlineData?.mimeType?.startsWith("image/") && !part.thought)?.inlineData;
      if (!image?.data) throw new Error(`Google no devolvió una imagen. ${sanitizeMessage(payload.promptFeedback?.blockReason ?? parts.find((p: { text?: string }) => p.text)?.text ?? "La solicitud puede estar bloqueada por seguridad. Probá otra descripción.")}`);
      bytes = Buffer.from(image.data, "base64");
      mime = image.mimeType ?? "image/png";
    } else {
      let payload: Interaction = await googleJson("/interactions", "POST", {
        model: VIDEO_MODEL,
        input: [
          ...refs.map(ref => ({ type: "image", data: ref.bytes.toString("base64"), mime_type: ref.mime })),
          { type: "text", text: prompt },
        ],
        response_format: { type: "video", aspect_ratio: input.aspectRatio, resolution: "720p" },
      });
      const deadline = Date.now() + 300_000;
      while (payload.id && ["in_progress", "running", "pending"].includes(payload.status ?? "") && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        payload = await googleJson(`/interactions/${encodeURIComponent(payload.id)}`, "GET");
      }
      const outputs = [...(payload.outputs ?? []), ...(payload.steps ?? []).filter(step => step.type === "model_output").flatMap(step => step.content ?? [])];
      const video = payload.output_video ?? outputs.find(output => output.type === "video");
      if (video?.data) {
        bytes = Buffer.from(video.data, "base64");
      } else if (video?.uri) {
        const url = new URL(video.uri);
        // Only send the API key to Google's documented video retrieval endpoint.
        if (url.hostname !== "generativelanguage.googleapis.com") throw new Error("Google devolvió una dirección de video no admitida.");
        url.searchParams.set("alt", "media");
        const response = await fetch(url, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY! }, signal: AbortSignal.timeout(120_000) });
        if (!response.ok) throw new Error(`No se pudo recuperar el video de Google (${response.status}).`);
        bytes = Buffer.from(await response.arrayBuffer());
      } else {
        throw new Error(`Google no devolvió un video. ${sanitizeMessage(payload.error?.message ?? "Probá otra descripción o revisá los permisos del modelo Omni.")}`);
      }
      mime = "video/mp4";
    }
    if (!bytes.length || bytes.length > 150 * 1024 * 1024) throw new Error("El archivo generado está vacío o supera el tamaño admitido.");
    if (input.includeLogo && brand.logoPath) {
      const logo = await ownedUpload(brand.logoPath, ownerId);
      bytes = await addOfficialLogo(bytes, logo.bytes, input.kind);
      if (input.kind === "image") mime = "image/png";
    }
    const objectPath = await saveGenerated(bytes, mime);
    await db.update(creationsTable).set({ status: "completed", objectPath, error: null }).where(eq(creationsTable.id, id));
  } catch (error) {
    const message = error instanceof Error && error.name !== "TimeoutError"
      ? sanitizeMessage(error.message) : "La generación tardó demasiado. Revisá el historial de uso de Google antes de reintentar.";
    logger.warn({ creationId: id }, "Generation failed");
    await db.update(creationsTable).set({ status: "failed", error: message }).where(eq(creationsTable.id, id));
  }
}
