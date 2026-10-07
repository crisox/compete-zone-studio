import { z } from "zod/v4";
import type { CreationInput } from "@workspace/api-zod";
import type { StudioBrand } from "./brand";
import { describeColors } from "./creativePrompt";

export const speechPlanSchema = z.object({
  spokenWords: z.array(z.string().min(1).max(60).regex(/^\S+$/)).max(18),
});
export const speechPlanJsonSchema = z.toJSONSchema(speechPlanSchema);

export function speechPlanPrompt(input: CreationInput, brand: StudioBrand) {
  return [
    "Prepará SOLO el guion hablado final de un video publicitario de 10 segundos.",
    "Devolvé un objeto JSON con spokenWords: una lista de como máximo 18 palabras. Cada elemento es UNA palabra sin espacios; conservá puntuación natural al final de cada palabra.",
    "Si la idea no pide voz, narración o diálogo, o si pide explícitamente no tenerlos, devolvé una lista vacía. No conviertas el texto visible en voz automáticamente.",
    "Cuando se pide voz, condensá el beneficio y el CTA manteniendo el sentido del contenido. Español rioplatense con voseo, natural y claro. No inventes hechos, nuevas funcionalidades ni ofertas.",
    "El total de TODA la locución debe caber entre el segundo 0,5 y el 8,5 a ritmo natural. Preferí 12 a 16 palabras, máximo estricto 18 incluyendo la dirección web.",
    "Pronunciaciones OBLIGATORIAS: CompeteZone / Compete Zone = compit son (DOS palabras); competezone.fit = compit son punto fit (CUATRO palabras). Usá la versión fonética directamente en spokenWords, nunca el nombre o dominio escritos.",
    "Un único CTA. No agregues otra frase de marca, no repitas el beneficio ni el dominio, no incluyas nombres de personajes o etiquetas como Narrador en el guion.",
    `Tono: ${describeColors(brand.tone)}.`,
    `TÍTULO (solo contexto): ${describeColors(input.title)}`,
    `IDEA DEL VIDEO (datos originales): ${describeColors(input.prompt)}`,
  ].join("\n\n");
}

export function validatedSpeechText(words: string[]) {
  const text = words.join(" ")
    .replace(/\bcompete[\s-]?zone\.fit\b/gi, "compit son punto fit")
    .replace(/\b(?:compete[\s-]?zone|compit[\s-]?zone)\b/gi, "compit son");
  const count = text.trim().split(/\s+/).filter(Boolean).length;
  if (count > 18) throw new Error("La locución propuesta es demasiado larga para terminar completa en 10 segundos. No se solicitó el video; probá con un guion más breve.");
  return text;
}
