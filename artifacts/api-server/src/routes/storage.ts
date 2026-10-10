import { Router, type IRouter } from "express";
import { db, uploadsTable, creationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";
import { pipeline } from "node:stream/promises";

const router: IRouter = Router();
export const storage = new ObjectStorageService();
const safePath = /^\/objects\/(?:uploads|generated)\/[a-f0-9-]+$/;

export async function ownedUpload(path: string, ownerId: string) {
  if (!safePath.test(path)) throw new Error("Ruta de archivo inválida.");
  const [row] = await db.select().from(uploadsTable).where(and(eq(uploadsTable.objectPath, path), eq(uploadsTable.ownerId, ownerId)));
  if (!row) throw new Error("No tenés acceso a esa referencia.");
  const file = await storage.getObjectEntityFile(path);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) throw new Error("Cada referencia debe pesar hasta 5 MB.");
  const mime = metadata.contentType ?? "";
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) throw new Error("Usá imágenes PNG, JPG o WEBP.");
  const [bytes] = await file.download();
  return { bytes, mime };
}

router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Iniciá sesión para subir archivos." }); return; }
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Usá PNG, JPG o WEBP de hasta 5 MB." }); return; }
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  await db.insert(uploadsTable).values({ objectPath, ownerId: req.user.id, ...parsed.data, size: String(parsed.data.size) });
  res.json(RequestUploadUrlResponse.parse({ uploadURL, objectPath }));
});

router.get("/storage/objects/{*objectPath}", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Iniciá sesión para ver tus archivos." }); return; }
  const parts = req.params.objectPath;
  const objectPath = `/objects/${Array.isArray(parts) ? parts.join("/") : parts}`;
  if (!safePath.test(objectPath)) { res.sendStatus(404); return; }
  const [uploaded] = await db.select({ id: uploadsTable.objectPath }).from(uploadsTable).where(and(eq(uploadsTable.objectPath, objectPath), eq(uploadsTable.ownerId, req.user.id)));
  const [generated] = await db.select({ id: creationsTable.id }).from(creationsTable).where(and(eq(creationsTable.objectPath, objectPath), eq(creationsTable.ownerId, req.user.id)));
  if (!uploaded && !generated) { res.sendStatus(404); return; }
  try {
    const file = await storage.getObjectEntityFile(objectPath);
    const [meta] = await file.getMetadata();
    const size = Number(meta.size);
    res.setHeader("Content-Type", meta.contentType ?? "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Accept-Ranges", "bytes");
    if (req.query.download === "1") res.setHeader("Content-Disposition", `attachment; filename="competezone-${generated?.id ?? "referencia"}.${meta.contentType === "video/mp4" ? "mp4" : "png"}"`);
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) { res.status(416).end(); return; }
      const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (start > end || start >= size) { res.setHeader("Content-Range", `bytes */${size}`); res.status(416).end(); return; }
      res.status(206).setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      res.setHeader("Content-Length", String(end - start + 1));
      await pipeline(file.createReadStream({ start, end }), res);
    } else {
      res.setHeader("Content-Length", String(size));
      await pipeline(file.createReadStream(), res);
    }
  } catch {
    if (!res.headersSent) res.status(404).json({ error: "Archivo no encontrado." });
  }
});

export default router;
