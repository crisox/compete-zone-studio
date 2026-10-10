import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { build } from "esbuild";
const compiled = await build({ entryPoints: ["src/lib/generationMetadata.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { safeMetadataJson, createGenerationMetadata, addRequestMetadata, legacyGenerationMetadata } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const input = { title: "Prueba", prompt: "Video de atletas adultos con narración.", kind: "video", audience: "athletes", aspectRatio: "16:9", includeLogo: true, referencePaths: ["/objects/uploads/test"] };
const brand = { name: "CompeteZone", tagline: "Competí", website: "competezone.fit", tone: "Rioplatense", logoPath: "/private-bucket/internal/logo.png" };

test("metadata retains the exact text/config while removing credentials and binary content", () => {
  const bytes = Buffer.from("fixture-photo");
  const secret = "not-a-real-api-key";
  const body = { model: "gemini-omni-1.1-flash", input: [
    { type: "image", mime_type: "image/png", data: bytes.toString("base64") },
    { type: "text", text: "Texto español\ncompit son punto fit" },
  ], response_format: { type: "video", aspect_ratio: "16:9", resolution: "720p" },
  headers: { authorization: secret }, apiKey: secret, note: ` accidental ${secret}` };
  const text = safeMetadataJson(body, secret), parsed = JSON.parse(text);
  assert.equal(parsed.input[1].text, body.input[1].text);
  assert.deepEqual(parsed.response_format, body.response_format);
  assert.match(parsed.input[0].data, new RegExp(createHash("sha256").update(bytes).digest("hex")));
  assert.match(parsed.input[0].data, /13 bytes/);
  assert.doesNotMatch(text, new RegExp(bytes.toString("base64")));
  assert.doesNotMatch(text, new RegExp(secret));
  assert.equal(parsed.headers, "[credencial omitida]");
});
test("capture stays immutable even if input, brand and request objects change later", () => {
  const requestBody = { model: "test", input: [{ type: "text", text: "Prompt final" }] };
  const m = createGenerationMetadata({ ...input }, { ...brand });
  const r = addRequestMetadata(m, "video-generation", "POST", "/interactions", "test", requestBody);
  requestBody.input[0].text = "Edited after submission";
  assert.equal(JSON.parse(r.payloadJson).input[0].text, "Prompt final");
  assert.doesNotMatch(m.brandSnapshotJson, /private-bucket/);
  assert.equal(m.speechScript, null);
  assert.equal(r.state, "prepared");
});
test("legacy videos expose only saved historical values, not invented Gemini requests", () => {
  const m = legacyGenerationMetadata({ ...input, model: "historical-model" });
  assert.equal(m.availability, "legacy");
  assert.equal(JSON.parse(m.originalInputJson).model, "historical-model");
  assert.equal(JSON.parse(m.originalInputJson).includeLogo, null);
  assert.equal(JSON.parse(m.originalInputJson).referencePaths, null);
  assert.equal(m.brandSnapshotJson, null);
  assert.equal(m.speechScript, null);
  assert.deepEqual(m.requests, []);
  assert.equal(m.resultJson, null);
});
