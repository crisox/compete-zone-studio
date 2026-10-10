import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, brandTable } from "@workspace/db";
import { CreateCreativeVariantBody, CreateCreativeVariantResponse } from "@workspace/api-zod";
import { brandDefaults } from "../lib/brand";
import { googleJson, sanitizeMessage } from "../lib/generation";
import { TEMPLATE_MODEL } from "../lib/templatePlanning";
import { variantSchema, variantJsonSchema, visualVariantPrompt } from "../lib/visualVariant";
import { describeColors } from "../lib/creativePrompt";
import { normalizeTemplatePronunciation } from "../lib/templatePronunciation";

const router: IRouter = Router();
const limits = new Map<string, { active: boolean; started: number; count: number }>();
router.post("/studio/creative-variant", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Ingresá para proponer una variante visual." }); return; }
  const parsed = CreateCreativeVariantBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.title.trim() || parsed.data.prompt.trim().length < 10) {
    res.status(400).json({ error: "Completá el título y una idea de al menos 10 caracteres." }); return;
  }
  const ownerId = req.user.id, now = Date.now();
  for (const [id, limit] of limits) if (!limit.active && now - limit.started > 3_600_000) limits.delete(id);
  const limit = limits.get(ownerId) ?? { active: false, started: now, count: 0 };
  if (limit.active || limit.count >= 30) {
    res.status(429).json({ error: limit.active ? "Ya hay una variante en preparación. Esperá a que termine." : "Alcanzaste el límite de seguridad de 30 variantes por hora." }); return;
  }
  limit.active = true; limit.count++; limits.set(ownerId, limit);
  try {
    const [brand] = await db.select().from(brandTable).where(eq(brandTable.ownerId, ownerId));
    const payload = await googleJson("/interactions", "POST", {
      model: TEMPLATE_MODEL, store: false, stream: false, background: false,
      input: visualVariantPrompt(parsed.data, brand?.tone ?? brandDefaults.tone),
      response_format: { type: "text", mime_type: "application/json", schema: variantJsonSchema },
    });
    const content = [...(payload.outputs ?? []), ...(payload.steps ?? []).filter(step => step.type === "model_output").flatMap(step => step.content ?? [])];
    const text = content.filter(item => item.type === "text" && item.text).map(item => item.text).join("");
    if (!text) throw new Error("Google no devolvió una variante de texto. El contenido original no se modificó.");
    let json: unknown;
    try { json = JSON.parse(text); } catch { throw new Error("Google devolvió una respuesta inválida. El contenido original no se modificó."); }
    const result = variantSchema.safeParse(json);
    if (!result.success) throw new Error("La variante no cumple el formato esperado. El contenido original no se modificó.");
    res.json(CreateCreativeVariantResponse.parse({
      title: describeColors(result.data.title),
      prompt: normalizeTemplatePronunciation(describeColors(result.data.prompt), parsed.data.kind),
      changes: describeColors(result.data.changes),
    }));
  } catch (error) {
    req.log.warn({ errorName: error instanceof Error ? error.name : "unknown" }, "Visual variant failed");
    res.status(502).json({ error: error instanceof Error ? sanitizeMessage(error.message) : "No se pudo preparar la variante. El contenido original no se modificó." });
  } finally { limit.active = false; }
});
export default router;
