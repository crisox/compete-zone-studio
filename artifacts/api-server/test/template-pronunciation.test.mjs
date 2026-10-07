import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const compiled = await build({
  entryPoints: ["src/lib/templatePronunciation.ts"], bundle: true,
  platform: "node", format: "esm", write: false,
});
const { normalizeTemplatePronunciation: normalize } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`,
);
const base = await build({ entryPoints: ["src/lib/brand.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { templates } = await import(`data:text/javascript;base64,${Buffer.from(base.outputFiles[0].text).toString("base64")}`);

test("spoken brand and URL become phonetic while visible CTA stays literal", () => {
  const source = "Locución rioplatense: «Organizá con Compete Zone. Visitá competezone.fit». Texto en pantalla: «Visitá competezone.fit». CTA único en pantalla: «competezone.fit».";
  const result = normalize(source, "video");
  assert.match(result, /«Organizá con compit son\. Visitá compit son punto fit»/);
  assert.match(result, /Texto en pantalla: «Visitá competezone\.fit»/);
  assert.match(result, /CTA único en pantalla: «competezone\.fit»/);
});
test("legacy Compit Zone and multiple closing voice passages are corrected", () => {
  const result = normalize("Locución: «Compit Zone». Cierre con locución: «Cerrá con CompeteZone». CTA hablado: «Visitá competezone.fit». CTA visible: «competezone.fit».", "video");
  assert.doesNotMatch(result, /Compit Zone/);
  assert.match(result, /Cierre con locución: «Cerrá con compit son»/);
  assert.match(result, /CTA hablado: «Visitá compit son punto fit»/);
  assert.match(result, /CTA visible: «competezone\.fit»/);
});
test("unquoted multiline voice script is normalized without touching visual copy", () => {
  const result = normalize("Locución:\nOrganizá en CompeteZone.\nVisitá competezone.fit.\nTexto en pantalla: «competezone.fit».\nCTA visible: competezone.fit", "video");
  assert.match(result, /Organizá en compit son\./);
  assert.match(result, /Visitá compit son punto fit\./);
  assert.match(result, /Texto en pantalla: «competezone\.fit»/);
  assert.match(result, /CTA visible: competezone\.fit/);
});
test("repeated normalization is idempotent and never rewrites static image copy", () => {
  const source = "Narración: «Competí con CompeteZone». CTA visible: «competezone.fit».";
  const result = normalize(source, "video");
  assert.equal(normalize(result, "video"), result);
  assert.equal(normalize(source, "image"), source);
  assert.ok(result.length <= 4000);
});
test("built-in video templates contain a phonetic spoken CTA and literal visible CTA", () => {
  for (const template of templates.filter(t => t.kind === "video")) {
    assert.match(template.prompt, /CTA hablado: «[^»]*compit son punto fit»/);
    assert.match(template.prompt, /CTA visible: «[^»]*competezone\.fit»/);
    assert.match(template.prompt, /PRONUNCIACIÓN — SOLO AUDIO/);
  }
});
