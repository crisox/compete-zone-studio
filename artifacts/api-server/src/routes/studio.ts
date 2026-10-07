import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { db, creationsTable, brandTable, templateIdeasTable, type StudioCreation } from "@workspace/db";
import { and, eq, desc, gte, lt, count } from "drizzle-orm";
import {
  GetStudioStatusResponse, GetTemplatesResponse, ListCreationsResponse,
  CreateCreationBody, CreateCreationResponse, GetCreationParams, GetCreationResponse,
  DeleteCreationParams, GetBrandResponse, UpdateBrandBody, UpdateBrandResponse, GetStudioSummaryResponse,
} from "@workspace/api-zod";
import { brandDefaults, templates } from "../lib/brand";
import { IMAGE_MODEL, VIDEO_MODEL, runGeneration } from "../lib/generation";
import { ownedUpload } from "./storage";
import { normalizeTemplatePronunciation } from "../lib/templatePronunciation";

const router: IRouter = Router();
const starting = new Set<string>();
async function expireInterrupted(ownerId: string) {
  await db.update(creationsTable).set({
    status: "failed",
    error: "La generación se interrumpió o superó el tiempo máximo. Revisá el uso de Google antes de volver a pedirla: una solicitud interrumpida puede tener costo.",
  }).where(and(
    eq(creationsTable.ownerId, ownerId),
    eq(creationsTable.status, "generating"),
    lt(creationsTable.createdAt, new Date(Date.now() - 15 * 60 * 1000)),
  ));
}
function serialize(row: StudioCreation) {
  return { ...row, createdAt: row.createdAt.toISOString(), mediaUrl: row.objectPath ? `/api/storage${row.objectPath}` : null };
}

async function getBrandFor(ownerId?: string) {
  if (!ownerId) return brandDefaults;
  const [row] = await db.select().from(brandTable).where(eq(brandTable.ownerId, ownerId));
  return row ? { ...brandDefaults, ...row, logoUrl: row.logoPath ? `/api/storage${row.logoPath}` : null } : brandDefaults;
}

router.get("/studio/status", (_req, res) => {
  const configured = Boolean(process.env.GEMINI_API_KEY);
  res.json(GetStudioStatusResponse.parse({
    configured, imageModel: IMAGE_MODEL, videoModel: VIDEO_MODEL,
    message: configured ? "Clave configurada en el servidor. Google aplica sus tarifas y cuotas; cada generación confirma el acceso al modelo." : "Configurá GEMINI_API_KEY en los secretos para generar contenido.",
  }));
});
router.get("/studio/templates", async (req, res) => {
  const saved = req.user ? await db.select().from(templateIdeasTable).where(and(eq(templateIdeasTable.ownerId, req.user.id), eq(templateIdeasTable.status, "saved"))).orderBy(desc(templateIdeasTable.createdAt)) : [];
  res.json(GetTemplatesResponse.parse([...templates, ...saved.map(row => ({
    ...row, prompt: normalizeTemplatePronunciation(row.prompt, row.kind),
  }))]));
});
router.get("/studio/brand", async (req, res) => res.json(GetBrandResponse.parse(await getBrandFor(req.user?.id))));
router.put("/studio/brand", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Iniciá sesión para guardar tu marca." }); return; }
  const parsed = UpdateBrandBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Revisá los campos de tu marca." }); return; }
  if (parsed.data.logoPath) {
    try { await ownedUpload(parsed.data.logoPath, req.user.id); }
    catch { res.status(400).json({ error: "El logo no es una imagen válida de tu cuenta." }); return; }
  }
  const [existing] = await db.select().from(brandTable).where(eq(brandTable.ownerId, req.user.id));
  const data = { ...parsed.data, logoPath: parsed.data.logoPath === undefined ? existing?.logoPath ?? null : parsed.data.logoPath, ownerId: req.user.id };
  await db.insert(brandTable).values(data).onConflictDoUpdate({ target: brandTable.ownerId, set: data });
  res.json(UpdateBrandResponse.parse(await getBrandFor(req.user.id)));
});
router.get("/studio/summary", async (req, res) => {
  const rows = req.user ? await db.select().from(creationsTable).where(eq(creationsTable.ownerId, req.user.id)) : [];
  res.json(GetStudioSummaryResponse.parse({
    images: rows.filter(row => row.kind === "image" && row.status === "completed").length,
    videos: rows.filter(row => row.kind === "video" && row.status === "completed").length,
    generating: rows.filter(row => row.status === "generating").length,
    total: rows.length,
  }));
});
router.get("/studio/creations", async (req, res) => {
  if (req.user) await expireInterrupted(req.user.id);
  const rows = req.user ? await db.select().from(creationsTable).where(eq(creationsTable.ownerId, req.user.id)).orderBy(desc(creationsTable.createdAt)) : [];
  res.json(ListCreationsResponse.parse(rows.map(serialize)));
});
router.post("/studio/creations", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Iniciá sesión para generar contenido." }); return; }
  if (!process.env.GEMINI_API_KEY) { res.status(503).json({ error: "La clave de Google no está configurada." }); return; }
  const ownerId = req.user.id;
  const parsed = CreateCreationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Escribí un título y una idea de al menos 10 caracteres." }); return; }
  const input = parsed.data;
  if (!input.title.trim() || input.prompt.trim().length < 10) { res.status(400).json({ error: "Completá un título y una descripción válida." }); return; }
  if (input.kind === "video" && input.aspectRatio === "1:1") { res.status(400).json({ error: "Para video elegí 9:16 o 16:9." }); return; }
  // Serialize admission per user to prevent parallel requests bypassing quotas.
  if (starting.has(ownerId)) { res.status(429).json({ error: "Esperá a que termine tu solicitud anterior." }); return; }
  starting.add(ownerId);
  try {
    await expireInterrupted(ownerId);
    const [active] = await db.select({ total: count() }).from(creationsTable).where(and(eq(creationsTable.ownerId, ownerId), eq(creationsTable.status, "generating")));
    if (active.total > 0) { res.status(429).json({ error: "Ya tenés una generación en curso. Esperá a que termine." }); return; }
    const [today] = await db.select({ total: count() }).from(creationsTable).where(and(eq(creationsTable.ownerId, ownerId), gte(creationsTable.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))));
    if (today.total >= 20) { res.status(429).json({ error: "Alcanzaste el límite de seguridad de 20 solicitudes por 24 horas." }); return; }
    const brand = await getBrandFor(ownerId);
    if (input.includeLogo && !brand.logoPath) { res.status(400).json({ error: "Primero cargá el logo oficial en Marca." }); return; }
    try { await Promise.all((input.referencePaths ?? []).map(path => ownedUpload(path, ownerId))); }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Referencia inválida." }); return; }
    const [row] = await db.insert(creationsTable).values({
      id: randomUUID(), ownerId, title: input.title, prompt: input.prompt,
      kind: input.kind, audience: input.audience, aspectRatio: input.aspectRatio,
      model: input.kind === "image" ? IMAGE_MODEL : VIDEO_MODEL,
    }).returning();
    // State is committed before starting expensive work, allowing reload/polling.
    void runGeneration(row.id, ownerId, input, brand).catch(() => req.log.error({ creationId: row.id }, "Failed to record generation result"));
    res.status(202).json(CreateCreationResponse.parse(serialize(row)));
  } finally { starting.delete(ownerId); }
});
router.get("/studio/creations/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Iniciá sesión para ver tu creación." }); return; }
  const parsed = GetCreationParams.safeParse(req.params);
  if (!parsed.success) { res.sendStatus(400); return; }
  await expireInterrupted(req.user.id);
  const [row] = await db.select().from(creationsTable).where(and(eq(creationsTable.id, parsed.data.id), eq(creationsTable.ownerId, req.user.id)));
  if (!row) { res.status(404).json({ error: "Creación no encontrada." }); return; }
  res.json(GetCreationResponse.parse(serialize(row)));
});
router.delete("/studio/creations/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Iniciá sesión para eliminar una creación." }); return; }
  const parsed = DeleteCreationParams.safeParse(req.params);
  if (!parsed.success) { res.sendStatus(400); return; }
  const [row] = await db.select().from(creationsTable).where(and(eq(creationsTable.id, parsed.data.id), eq(creationsTable.ownerId, req.user.id)));
  if (!row) { res.status(404).json({ error: "Creación no encontrada." }); return; }
  if (row.status === "generating") { res.status(409).json({ error: "Esperá a que termine la generación antes de eliminarla." }); return; }
  await db.delete(creationsTable).where(and(eq(creationsTable.id, row.id), eq(creationsTable.ownerId, req.user.id)));
  res.sendStatus(204);
});
export default router;
