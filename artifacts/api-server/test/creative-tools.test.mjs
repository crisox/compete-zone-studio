import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

async function load(path) {
  const compiled = await build({ entryPoints: [path], bundle: true, platform: "node", format: "esm", write: false });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
}
const { visualVariantPrompt, variantSchema } = await load("src/lib/visualVariant.ts");
const { speechPlanPrompt, speechPlanSchema, validatedSpeechText } = await load("src/lib/speechPlan.ts");
const { buildPrompt } = await load("src/lib/creativePrompt.ts");
const input = {
  title: "Menos planillas, más competencia",
  prompt: "Un organizador deja las planillas. Narración: «Tu próxima competencia merece más atención que tus planillas. Menos vueltas. Más competencia». Cerrá con «Organizá tu competencia en competezone.fit».",
  kind: "video", audience: "organizers", aspectRatio: "16:9", includeLogo: true,
};
const brand = { tone: "Voseo, deportivo", tagline: "Menos vueltas. Más competencia.", website: "competezone.fit" };

test("visual variant is grounded in title and idea and preserves content, audience and format", () => {
  const prompt = visualVariantPrompt(input, brand.tone);
  assert.match(prompt, /Menos planillas, más competencia/);
  assert.match(prompt, /Tu próxima competencia merece más atención/);
  assert.match(prompt, /Mantené exactamente el mismo tema/);
  assert.match(prompt, /Público: organizers; formato: video/);
  assert.match(prompt, /Relación de aspecto elegida: 16:9/);
  assert.match(prompt, /Cambiá de forma sustancial la puesta en escena/);
  assert.match(prompt, /máximo 18 palabras/);
});

test("variants cannot overflow creator fields or return blank output", () => {
  assert.equal(variantSchema.safeParse({ title: input.title, prompt: input.prompt, changes: "Cambia la luz y los encuadres." }).success, true);
  assert.equal(variantSchema.safeParse({ title: " ", prompt: input.prompt, changes: "Cambia la luz." }).success, false);
  assert.equal(variantSchema.safeParse({ title: "A".repeat(101), prompt: input.prompt, changes: "Cambia la luz." }).success, false);
  assert.equal(variantSchema.safeParse({ title: input.title, prompt: "A".repeat(4001), changes: "Cambia la luz." }).success, false);
});

test("speech planning caps spoken words without truncating a valid script", () => {
  assert.equal(speechPlanSchema.safeParse({ spokenWords: Array(19).fill("palabra") }).success, false);
  assert.equal(speechPlanSchema.safeParse({ spokenWords: ["dos palabras"] }).success, false);
  assert.equal(speechPlanSchema.safeParse({ spokenWords: [] }).success, true);
  const words = ["Organizá", "tu", "competencia", "en", "compit", "son", "punto", "fit."];
  assert.equal(validatedSpeechText(words), "Organizá tu competencia en compit son punto fit.");
  assert.equal(validatedSpeechText(["Visitá", "competezone.fit."]), "Visitá compit son punto fit.");
  assert.throws(() => validatedSpeechText([...Array(17).fill("palabra"), "competezone.fit"]));
});

test("video gets a single complete validated voice script and closing time", () => {
  const prompt = buildPrompt(input, brand, "Organizá tu competencia en compit son punto fit.");
  assert.match(prompt, /GUIÓN HABLADO FINAL — PRIORIDAD/);
  assert.match(prompt, /Sustituye toda narración, diálogo y CTA hablado/);
  assert.match(prompt, /terminá antes de 8,5 segundos/);
  assert.match(prompt, /segundo 8,5 al 10/);
  const silent = buildPrompt(input, brand, "");
  assert.match(silent, /AUDIO FINAL: sin narración ni diálogo/);
  assert.match(speechPlanPrompt(input, brand), /Preferí 12 a 16 palabras/);
});
