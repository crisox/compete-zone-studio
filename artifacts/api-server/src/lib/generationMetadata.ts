import { createHash } from "node:crypto";
import type { CreationInput, GenerationMetadata, ProviderRequestMetadata } from "@workspace/api-zod";
import type { StudioBrand } from "./brand";

// Snapshot bodies, not transport headers, response media, storage URLs or credentials.
export function safeMetadataJson(value: unknown, secret?: string): string {
  const safe = (item: unknown): unknown => {
    if (typeof item === "string") return secret ? item.replaceAll(secret, "[secreto omitido]") : item;
    if (Array.isArray(item)) return item.map(safe);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, val]) => {
      if (/^(?:headers|authorization|api[_-]?key|x-goog-api-key|cookie|access_token|refresh_token|password)$/i.test(key)) return [key, "[credencial omitida]"];
      if (key === "data" && typeof val === "string") {
        const bytes = Buffer.from(val, "base64");
        return [key, `[binario omitido: ${bytes.length} bytes; SHA-256 ${createHash("sha256").update(bytes).digest("hex")}]`];
      }
      return [key, safe(val)];
    }));
    return item;
  };
  return JSON.stringify(safe(value), null, 2);
}

export function createGenerationMetadata(input: CreationInput, brand: StudioBrand, secret?: string): GenerationMetadata {
  return {
    version: 1, availability: "recorded", recordedAt: new Date().toISOString(),
    originalInputJson: safeMetadataJson(input, secret),
    brandSnapshotJson: safeMetadataJson({ name: brand.name, tagline: brand.tagline, website: brand.website, tone: brand.tone }, secret),
    speechScript: null, requests: [],
    postProcessingJson: safeMetadataJson({
      logoRequested: Boolean(input.includeLogo), logoApplied: false,
      logoPlacement: input.includeLogo ? "esquina superior izquierda" : null,
      logoTransparency: "conservar el archivo original, sin fondos añadidos",
      note: "El logo oficial se superpone después de Gemini; no se incorpora automáticamente como referencia enviada.",
    }),
    resultJson: null,
    limitations: [
      "Los prompts y parámetros son una copia del cuerpo preparado para cada solicitud. No se guardan claves ni encabezados de autenticación.",
      "Las imágenes de referencia se omiten del JSON binario; se registra su tamaño y SHA-256. El orden y MIME se conservan.",
      "Los 10 segundos y el cierre de voz antes de 8,5 segundos se solicitan por prompt; no son una medición de la duración real.",
      "El guion de voz es el texto enviado, no una transcripción del audio generado.",
      "Una solicitud preparada se guarda antes de llamar a Google; sin respuesta puede corresponder a una interrupción y no confirma por sí sola que Google la procesó.",
    ],
  };
}

export function addRequestMetadata(
  metadata: GenerationMetadata, stage: ProviderRequestMetadata["stage"],
  method: ProviderRequestMetadata["method"], apiPath: string, model: string,
  body?: unknown, secret?: string,
) {
  const request: ProviderRequestMetadata = {
    stage, method, apiPath, model, requestedAt: new Date().toISOString(),
    state: "prepared", payloadJson: body === undefined ? null : safeMetadataJson(body, secret),
    respondedAt: null, interactionId: null,
  };
  metadata.requests.push(request);
  return request;
}

export function legacyGenerationMetadata(row: {
  title: string; prompt: string; kind: string; audience: string; aspectRatio: string; model: string;
}): GenerationMetadata {
  return {
    version: 1, availability: "legacy", recordedAt: null,
    originalInputJson: safeMetadataJson({
      title: row.title, prompt: row.prompt, kind: row.kind, audience: row.audience,
      aspectRatio: row.aspectRatio, model: row.model,
      includeLogo: null, referencePaths: null,
    }),
    brandSnapshotJson: null, speechScript: null, requests: [], postProcessingJson: null, resultJson: null,
    limitations: [
      "Este video es anterior al registro técnico. Solo se muestran los campos históricos que estaban guardados.",
      "No se conservó el prompt final enviado a Gemini, el guion de voz, las referencias ni la marca vigente. No se reconstruyen usando la configuración actual.",
    ],
  };
}
