import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, ne, count } from "drizzle-orm";
import { db, templateIdeasTable, brandTable, type TemplateIdeaRow } from "@workspace/db";
import {
  GetTemplateBriefResponse, ListTemplateIdeasResponse,
  GenerateTemplateIdeasBody, GenerateTemplateIdeasResponse,
  UpdateTemplateIdeaBody, UpdateTemplateIdeaParams, UpdateTemplateIdeaResponse,
} from "@workspace/api-zod";
import { templates, brandDefaults } from "../lib/brand";
import { TEMPLATE_MODEL, productFeatures, planningPrompt, proposedBatchSchema, proposalJsonSchema, filterNewTemplates } from "../lib/templatePlanning";
import { googleJson, sanitizeMessage } from "../lib/generation";
import { describeColors } from "../lib/creativePrompt";
import { normalizeTemplatePronunciation } from "../lib/templatePronunciation";

const router: IRouter = Router();
const active = new Set<string>();
const cooldowns = new Map<string, number>();
function serialize(row: TemplateIdeaRow) {
  const { ownerId: _ownerId, ...idea } = row;
  return { ...idea, prompt: normalizeTemplatePronunciation(row.prompt, row.kind), feature: productFeatures.find(feature => feature.id === row.feature)?.title ?? row.feature, createdAt: row.createdAt.toISOString() };
}
router.get("/studio/template-brief", (_req, res) => res.json(GetTemplateBriefResponse.parse({
  sourceUrl: "https://competezone.fit", model: TEMPLATE_MODEL, features: productFeatures,
})));
router.get("/studio/template-ideas", async (req, res) => {
  const rows = req.user ? await db.select().from(templateIdeasTable).where(and(eq(templateIdeasTable.ownerId, req.user.id), ne(templateIdeasTable.status, "dismissed"))).orderBy(desc(templateIdeasTable.createdAt)) : [];
  res.json(ListTemplateIdeasResponse.parse(rows.map(serialize)));
});
router.post("/studio/template-ideas/generate", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Ingresá para proponer nuevas plantillas." }); return; }
  const parsed = GenerateTemplateIdeasBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Revisá el objetivo, el público, el formato y la cantidad (1 a 6)." }); return; }
  const ownerId = req.user.id;
  if (active.has(ownerId) || (cooldowns.get(ownerId) ?? 0) > Date.now()) {
    res.status(429).json({ error: "Esperá unos segundos antes de pedir más propuestas." }); return;
  }
  active.add(ownerId);
  cooldowns.set(ownerId, Date.now() + 30_000);
  // Expire unused admission entries rather than retaining every account forever.
  for (const [id, deadline] of cooldowns) if (deadline < Date.now()) cooldowns.delete(id);
  try {
    const [today] = await db.select({ total: count() }).from(templateIdeasTable).where(and(eq(templateIdeasTable.ownerId, ownerId), gte(templateIdeasTable.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))));
    if (today.total >= 60) { res.status(429).json({ error: "Alcanzaste el límite de seguridad de 60 propuestas por 24 horas." }); return; }
    const existing = await db.select().from(templateIdeasTable).where(eq(templateIdeasTable.ownerId, ownerId)).orderBy(desc(templateIdeasTable.createdAt));
    const [brand] = await db.select().from(brandTable).where(eq(brandTable.ownerId, ownerId));
    const context = [...templates, ...existing];
    const payload = await googleJson("/interactions", "POST", {
      model: TEMPLATE_MODEL,
      store: false, background: false, stream: false,
      input: planningPrompt(parsed.data, context, brand?.tone ?? brandDefaults.tone),
      response_format: { type: "text", mime_type: "application/json", schema: proposalJsonSchema },
    });
    const content = [...(payload.outputs ?? []), ...(payload.steps ?? []).filter(step => step.type === "model_output").flatMap(step => step.content ?? [])];
    const text = content.filter(item => item.type === "text" && item.text).map(item => item.text).join("");
    if (!text) throw new Error("Google no devolvió propuestas de texto. Probá con otro objetivo.");
    let json: unknown;
    try { json = JSON.parse(text); } catch { throw new Error("Google devolvió una respuesta inválida. No se guardaron plantillas."); }
    const batch = proposedBatchSchema.safeParse(json);
    if (!batch.success) throw new Error("Las propuestas no cumplen el formato esperado. No se guardaron plantillas.");
    const clean = batch.data.suggestions.map(idea => ({
      ...idea, title: describeColors(idea.title), description: describeColors(idea.description),
      prompt: normalizeTemplatePronunciation(describeColors(idea.prompt), idea.kind), angle: describeColors(idea.angle), reason: describeColors(idea.reason),
    }));
    const valid = filterNewTemplates(clean, context).filter(idea =>
      (parsed.data.audience === "all" || idea.audience === parsed.data.audience) &&
      (parsed.data.kind === "mixed" || idea.kind === parsed.data.kind),
    ).slice(0, Math.min(parsed.data.count, 60 - today.total));
    if (!valid.length) throw new Error("Google repitió ideas existentes o no respetó los filtros. Cambiá el objetivo para explorar otro enfoque.");
    const rows = await db.insert(templateIdeasTable).values(valid.map(idea => ({ ...idea, id: randomUUID(), ownerId }))).returning();
    res.json(GenerateTemplateIdeasResponse.parse(rows.map(serialize)));
  } catch (error) {
    req.log.warn({ ownerId, errorName: error instanceof Error ? error.name : "unknown" }, "Template proposals failed");
    res.status(502).json({ error: error instanceof Error ? sanitizeMessage(error.message) : "No se pudieron generar propuestas. Probá nuevamente." });
  } finally { active.delete(ownerId); }
});
router.patch("/studio/template-ideas/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Ingresá para guardar o descartar propuestas." }); return; }
  const params = UpdateTemplateIdeaParams.safeParse(req.params), body = UpdateTemplateIdeaBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Propuesta o estado inválidos." }); return; }
  const [row] = await db.update(templateIdeasTable).set({ status: body.data.status }).where(and(eq(templateIdeasTable.id, params.data.id), eq(templateIdeasTable.ownerId, req.user.id))).returning();
  if (!row) { res.status(404).json({ error: "Propuesta no encontrada." }); return; }
  res.json(UpdateTemplateIdeaResponse.parse(serialize(row)));
});
export default router;
