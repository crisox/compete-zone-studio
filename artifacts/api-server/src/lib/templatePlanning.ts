import { z } from "zod/v4";
import { describeColors } from "./creativePrompt";

export const TEMPLATE_MODEL = "gemini-3.8-flash";
// Grounded in competezone.fit's public homepage, not its demonstration events.
export const productFeatures = [
  { id: "discovery", title: "Encontrar competencias", description: "Explorar eventos deportivos próximos y consultar sus detalles desde un solo lugar." },
  { id: "registration", title: "Inscribirse a eventos", description: "Consultar la información del evento e inscribirse. Algunos eventos tienen inscripción externa: no prometer que todas las inscripciones suceden dentro de la web." },
  { id: "management", title: "Gestionar eventos e inscripciones", description: "Los organizadores pueden publicar eventos y gestionar sus inscripciones." },
  { id: "results", title: "Consultar resultados publicados", description: "Ver tablas de posiciones cuando el organizador publica los resultados. No prometer resultados en vivo ni publicación automática." },
];

export const proposedTemplateSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(500),
  prompt: z.string().min(40).max(4000),
  audience: z.enum(["organizers", "athletes"]),
  kind: z.enum(["image", "video"]),
  category: z.string().min(1).max(80),
  feature: z.enum(["discovery", "registration", "management", "results"]),
  angle: z.string().min(10).max(500),
  reason: z.string().min(10).max(800),
});
export const proposedBatchSchema = z.object({ suggestions: z.array(proposedTemplateSchema).min(1).max(6) });
export const proposalJsonSchema = z.toJSONSchema(proposedBatchSchema);
type TemplateContext = { title: string; prompt: string; audience: string; kind: string; angle?: string; feature?: string; status?: string };
type PlanningInput = { focus: string; audience: string; kind: string; count: number };

export function planningPrompt(input: PlanningInput, context: TemplateContext[], tone: string) {
  return [
    "Sos el director creativo de CompeteZone. Proponé plantillas publicitarias de alto impacto para promocionar su web.",
    "Son guiones/prompts reutilizables, no assets ya generados. Escribí español rioplatense con voseo. Sin emojis.",
    `Generá ${input.count} propuestas. Público solicitado: ${input.audience}. Formato solicitado: ${input.kind}.`,
    "Analizá primero qué temas y enfoques ya cubren las plantillas del contexto. Proponé nuevos ganchos, escenas, problemas y beneficios; no te limites a cambiar títulos.",
    "Las propuestas descartadas también cuentan como enfoques a evitar. Diversificá entre características poco cubiertas.",
    `CARACTERÍSTICAS REALES DE LA WEB:\n${JSON.stringify(productFeatures)}`,
    "No inventes cobros, pagos, check-in, chats, inteligencia artificial para atletas, rankings en vivo, automatizaciones, fechas ni resultados. No uses los eventos demo como campañas reales.",
    `CONTEXTO DE PLANTILLAS EXISTENTES Y PROPUESTAS:\n${JSON.stringify(context.map(item => ({ ...item, prompt: item.prompt.slice(0, 800) })))}`,
    `TONO DE MARCA: ${describeColors(tone)}`,
    `OBJETIVO DEL USUARIO: ${describeColors(input.focus.trim() || "Promocionar las características de la web con nuevos enfoques de alto impacto.")}`,
    "Cada propuesta debe vincular una característica real a un beneficio concreto, un gancho inicial fuerte y una única llamada a la acción.",
    "El campo prompt debe quedar listo para generar imagen o video: escena, composición, copy exacto, CTA y, si es video, secuencia breve con ambiente y locución.",
    "Usá fotografía/acción deportiva realista o motion graphics claros según la idea. No inventes pantallas de la web; pedí capturas reales como referencia cuando sean necesarias.",
    "La identidad visual es azul deportivo, azul noche, blanco, celeste y acentos verde lima; nunca escribas códigos de color en el prompt.",
    "El logo oficial se agrega después conservando la transparencia del archivo original, en la esquina superior izquierda. Dejá ese espacio limpio, sin fondos, placas ni recuadros para el logo.",
    "No solicites que el modelo escriba el nombre de la marca como título, palabra, tipografía o logo inventado. La marca se muestra solo con el archivo del logo original. Se admite el sitio competezone.fit escrito en el CTA.",
    "Para video, la locución de CompeteZone o Compete Zone debe decir exactamente «compit son» y la de competezone.fit exactamente «compit son punto fit». Separá siempre el CTA visible «competezone.fit» del CTA hablado «compit son punto fit». No escribas las indicaciones fonéticas en pantalla ni en subtítulos.",
    "reason debe explicar qué aporta esta idea frente a las existentes. angle debe describir el enfoque específico, no elogios genéricos ni garantías de viralidad.",
    "Devolvé únicamente el objeto JSON según el esquema de respuesta.",
  ].join("\n\n");
}

export function normalizeCreativeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, " ").replace(/\s+/g, " ").trim();
}

export function filterNewTemplates(proposals: z.infer<typeof proposedTemplateSchema>[], existing: TemplateContext[]) {
  const seen = [...existing];
  return proposals.filter(proposal => {
    const duplicate = seen.some(item =>
      normalizeCreativeText(item.title) === normalizeCreativeText(proposal.title)
      || normalizeCreativeText(item.prompt) === normalizeCreativeText(proposal.prompt)
      || (item.feature === proposal.feature && item.angle && normalizeCreativeText(item.angle) === normalizeCreativeText(proposal.angle)));
    if (!duplicate) seen.push(proposal);
    return !duplicate;
  });
}
