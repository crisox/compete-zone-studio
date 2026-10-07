import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, creationsTable } from "@workspace/db";
import type { CreationInput } from "@workspace/api-zod";
import type { StudioBrand } from "./brand";
import { objectStorageClient, ObjectStorageService } from "./objectStorage";
import { ownedUpload } from "../routes/storage";
import { logger } from "./logger";
import { buildPrompt } from "./creativePrompt";
import { addOfficialLogo, prepareLogo } from "./logoOverlay";
import { speechPlanSchema, speechPlanJsonSchema, speechPlanPrompt, validatedSpeechText } from "./speechPlan";

export const IMAGE_MODEL = "gemini-nano-banana-2.1";
export const VIDEO_MODEL = "gemini-omni-1.1-flash";
const googleBase = "https://generativelanguage.googleapis.com/v1beta";
const storage = new ObjectStorageService();

interface ProviderOutput {
  type?: string;
  mime_type?: string;
  data?: string;
  uri?: string;
  text?: string;
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

export function sanitizeMessage(message: string): string {
  const key = process.env.GEMINI_API_KEY;
  return (key ? message.replaceAll(key, "[clave protegida]") : message)
    .replace(/https?:\/\/\S+/g, "[URL del proveedor]").slice(0, 500);
}

export async function googleJson(path: string, method: "POST" | "GET", body?: unknown) {
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
    let officialLogo: Buffer | undefined;
    if (input.includeLogo) {
      if (!brand.logoPath) throw new Error("Cargá y guardá el logo oficial en Marca antes de generar.");
      officialLogo = (await ownedUpload(brand.logoPath, ownerId)).bytes;
      // Validate the artwork before making a paid provider request.
      await prepareLogo(officialLogo, 720, 1280);
    }
    let prompt = buildPrompt(input, brand);
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
      // Give Omni a single, validated short script instead of conflicting long
      // narration and CTA instructions that may run past the video boundary.
      const speechPayload = await googleJson("/interactions", "POST", {
        model: "gemini-3.8-flash", store: false, stream: false, background: false,
        input: speechPlanPrompt(input, brand),
        response_format: { type: "text", mime_type: "application/json", schema: speechPlanJsonSchema },
      });
      const speechContent = [...(speechPayload.outputs ?? []), ...(speechPayload.steps ?? []).filter(step => step.type === "model_output").flatMap(step => step.content ?? [])];
      const speechText = speechContent.filter(part => part.type === "text" && part.text).map(part => part.text).join("");
      let speechJson: unknown;
      try { speechJson = JSON.parse(speechText); } catch { throw new Error("No se pudo preparar una locución válida. No se solicitó el video para evitar un guion cortado."); }
      const speech = speechPlanSchema.safeParse(speechJson);
      if (!speech.success) throw new Error("No se pudo ajustar la locución al tiempo disponible. No se solicitó el video; probá una idea más breve.");
      prompt = buildPrompt(input, brand, validatedSpeechText(speech.data.spokenWords));
      let payload: Interaction = await googleJson("/interactions", "POST", {
        model: VIDEO_MODEL,
        background: false,
        store: false,
        stream: false,
        input: [
          ...refs.map(ref => ({ type: "image", data: ref.bytes.toString("base64"), mime_type: ref.mime })),
          { type: "text", text: prompt },
        ],
        response_format: { type: "video", aspect_ratio: input.aspectRatio, resolution: "720p" },
        generation_config: { video_config: { task: refs.length ? "reference_to_video" : "text_to_video" } },
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
    if (input.includeLogo) {
      if (!officialLogo) throw new Error("No se encontró el logo solicitado. No se guardará una creación sin logo.");
      bytes = await addOfficialLogo(bytes, officialLogo, input.kind);
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
