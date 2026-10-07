import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// Bundle the TS helpers in memory, avoiding generated files in the workspace.
const compiled = await build({
  entryPoints: ["src/lib/templatePlanning.ts"],
  bundle: true, platform: "node", format: "esm", write: false,
});
const { planningPrompt, proposedBatchSchema, filterNewTemplates, productFeatures, proposalJsonSchema } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const template = {
  title: "Cada esfuerzo cuenta", description: "Una pieza para descubrir los resultados de tu competencia.",
  prompt: "Atletas adultos al finalizar una competencia, CTA «Consultá los resultados publicados en competezone.fit».",
  audience: "athletes", kind: "image", category: "Resultados", feature: "results",
  angle: "Del esfuerzo vivido al resultado publicado por el organizador.",
  reason: "Se centra en la consulta de resultados en vez de invitar a encontrar un evento.",
};

test("planning includes existing ideas, verified features, audience and format filters", () => {
  const prompt = planningPrompt({ focus: "Promocionar resultados", audience: "athletes", kind: "image", count: 3 }, [template], "Voseo, claro");
  assert.match(prompt, /Cada esfuerzo cuenta/);
  assert.match(prompt, /results/);
  assert.match(prompt, /no prometer resultados en vivo/i);
  assert.match(prompt, /3 propuestas/);
  assert.match(prompt, /Público solicitado: athletes/);
  assert.match(prompt, /logo oficial.*transparencia/);
  assert.doesNotMatch(prompt, /sobre fondo blanco/);
  assert.match(prompt, /exactamente «compit son»/);
  assert.match(prompt, /exactamente «compit son punto fit»/);
  assert.match(prompt, /CTA visible «competezone\.fit»/);
  assert.match(prompt, /Interactions|JSON/);
  assert.equal(productFeatures.length, 4);
});

test("provider JSON must satisfy the schema and cannot invent product feature IDs", () => {
  assert.equal(proposedBatchSchema.safeParse({ suggestions: [template] }).success, true);
  assert.equal(proposedBatchSchema.safeParse({ suggestions: [{ ...template, feature: "live-ranking" }] }).success, false);
  assert.equal(proposedBatchSchema.safeParse({ suggestions: [] }).success, false);
  assert.equal(proposedBatchSchema.safeParse({ suggestions: Array(7).fill(template) }).success, false);
  assert.equal(proposalJsonSchema.type, "object");
});

test("duplicates across existing templates and the new batch are filtered", () => {
  assert.equal(filterNewTemplates([{ ...template, title: "Cada esfuerzo CUENTA!" }], [template]).length, 0);
  assert.equal(filterNewTemplates([{ ...template, title: "Nuevo nombre" }], [template]).length, 0);
  const next = { ...template, title: "El desafío empieza acá", prompt: "Descubrí eventos y encontrá tu próximo desafío en competezone.fit.", feature: "discovery", angle: "Un gancho basado en elegir un nuevo objetivo de entrenamiento." };
  assert.equal(filterNewTemplates([next, { ...next }], [template]).length, 1);
});
