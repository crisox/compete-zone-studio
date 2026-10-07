import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// Exercise the production orchestration without touching Google, storage or DB.
const mocks = {
  "@workspace/db": `export const creationsTable={id:"id"}; export const db={update:()=>({set:v=>({where:async()=>{globalThis.__metadataHarness.writes.push(structuredClone(v))}})})};`,
  "drizzle-orm": `export const eq=()=>true;`,
  "./objectStorage": `export class ObjectStorageService{getPrivateObjectDir(){return "/fixture-bucket/generated"}}; export const objectStorageClient={bucket:()=>({file:()=>({save:async()=>{}})})};`,
  "../routes/storage": `export const ownedUpload=async path=>({bytes:Buffer.from("fixture-image"),mime:"image/png"});`,
  "./logoOverlay": `export const prepareLogo=async()=>({});export const addOfficialLogo=async()=>Buffer.from("fixture-video-with-logo");`,
  "./logger": `export const logger={warn:()=>{}};`,
};
const compiled = await build({
  entryPoints: ["src/lib/generation.ts"], bundle: true, platform: "node", format: "esm", write: false,
  plugins: [{ name: "isolated-generation-test", setup(b) {
    b.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "fixture" } : null);
    b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }],
});
const { runGeneration } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const input = { title: "Fixture", prompt: "Un organizador con narración para su competencia.", kind: "video", audience: "organizers", aspectRatio: "16:9", includeLogo: true, referencePaths: ["/objects/uploads/fixture"] };
const brand = { name: "CompeteZone", tone: "Rioplatense", tagline: "Competí", website: "competezone.fit", logoPath: "/objects/uploads/logo-fixture" };

async function run(responses) {
  const originalFetch = globalThis.fetch, oldKey = process.env.GEMINI_API_KEY;
  const h = { writes: [], calls: [] }; globalThis.__metadataHarness = h;
  process.env.GEMINI_API_KEY = "isolated-test-key";
  globalThis.fetch = async (url, options) => {
    h.calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    const next = responses.shift();
    assert.ok(next, "Unexpected extra provider call");
    return { ok: next.ok ?? true, status: next.status ?? 200, json: async () => next.payload };
  };
  try { await runGeneration("fixture-id", "fixture-owner", input, brand); return h; }
  finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
    delete globalThis.__metadataHarness;
  }
}
test("complete video pipeline persists actual prepared payloads before calls and preserves trace after completion", async () => {
  const h = await run([
    { payload: { id: "speech-fixture", outputs: [{ type: "text", text: JSON.stringify({ spokenWords: ["Organizá", "en", "compit", "son", "punto", "fit."] }) }] } },
    { payload: { id: "video-fixture", output_video: { data: Buffer.from("fixture-provider-video").toString("base64") } } },
  ]);
  const last = h.writes.at(-1), m = last.generationMetadata;
  assert.equal(last.status, "completed");
  assert.equal(m.requests.length, 2);
  assert.equal(m.speechScript, "Organizá en compit son punto fit.");
  const sent = h.calls[1].body, captured = JSON.parse(m.requests[1].payloadJson);
  assert.equal(captured.input[1].text, sent.input[1].text);
  assert.deepEqual(captured.response_format, sent.response_format);
  assert.deepEqual(captured.generation_config, sent.generation_config);
  assert.doesNotMatch(m.requests[1].payloadJson, new RegExp(sent.input[0].data));
  assert.ok(h.writes.some(w => w.generationMetadata?.requests[1]?.state === "prepared"));
  assert.equal(m.requests[1].state, "received");
  assert.equal(m.requests[1].interactionId, "video-fixture");
  assert.equal(JSON.parse(m.postProcessingJson).logoApplied, true);
  assert.equal(JSON.parse(m.resultJson).storedByteLength, Buffer.byteLength("fixture-video-with-logo"));
});
test("provider failure retains the attempted request and prevents a video call after speech failure", async () => {
  const h = await run([{ ok: false, status: 429, payload: { error: { message: "Quota error isolated-test-key" } } }]);
  const last = h.writes.at(-1), m = last.generationMetadata;
  assert.equal(h.calls.length, 1);
  assert.equal(last.status, "failed");
  assert.equal(m.requests[0].state, "error");
  assert.equal(m.requests[0].stage, "speech-planning");
  assert.doesNotMatch(JSON.stringify(last), /isolated-test-key/);
  assert.equal(JSON.parse(m.resultJson).status, "failed");
});
