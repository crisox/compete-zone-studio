import type { CreationInput } from "@workspace/api-zod";
import type { StudioBrand } from "./brand";

const colorNames: Record<string, string> = {
  "0053b4": "azul deportivo intenso",
  "0f172a": "azul noche muy oscuro",
  "ffffff": "blanco",
  "0ea5e9": "celeste luminoso",
  "a8ff00": "verde lima",
  "f59e0b": "ámbar",
};

// Do not leak color specification tokens into generated signage or narration,
// even when the user pastes brand guidelines into their own idea or tone.
export function describeColors(text: string) {
  return text.replace(/#([a-f\d]{8}|[a-f\d]{6}|[a-f\d]{4}|[a-f\d]{3})\b/gi,
    (_match, hex: string) => colorNames[hex.toLowerCase()] ?? "color de la paleta");
}

export function buildPrompt(input: CreationInput, brand: StudioBrand) {
  const video = input.kind === "video";
  return [
    video ? "Creá un video publicitario deportivo corto con audio para CompeteZone." : "Creá una imagen publicitaria deportiva para CompeteZone.",
    "",
    "IDEA CREATIVA",
    describeColors(input.prompt),
    "",
    "DIRECCIÓN VISUAL Y DE AUDIO — instrucciones de producción, nunca texto de pantalla ni locución",
    "CompeteZone conecta atletas y organizaciones para descubrir competencias, gestionar inscripciones y compartir resultados.",
    `Público: ${input.audience === "organizers" ? "organizadores, boxes, gimnasios, clubes y federaciones de Uruguay" : "atletas de CrossFit, entrenamiento funcional, HYROX y running"}.`,
    "Paleta solo como apariencia: azul deportivo intenso, azul noche oscuro, blanco y celeste luminoso. Pequeños acentos verde lima. No conviertas la paleta en etiquetas, carteles, banderas ni leyendas.",
    `Tono editorial: ${describeColors(brand.tone)}.`,
    "Personas adultas; esfuerzo, compañerismo y participación. Sin testimonios, datos, eventos ni interfaces inventadas.",
    video ? "Priorizá acción deportiva natural y cámara coherente con la idea. Audio con ambiente real, música original sutil y voz clara en español rioplatense solo si la idea pide narración. No narres las instrucciones, la paleta ni las especificaciones." : "Composición clara y deportiva, tipografía sans serif legible.",
    input.referencePaths?.length ? "Las fotos adjuntas son referencias del sujeto y del entorno. Conservá sus detalles relevantes; no las trates como primer y último fotograma, ni como láminas para mostrar." : "",
    input.includeLogo ? "Dejá libre y sin textos la esquina superior izquierda: el logo oficial se coloca allí en posproducción. No dibujes, recrees ni reemplaces ese logo." : "No inventes ni recrees el logo oficial.",
    "",
    "TEXTO VISIBLE Y LOCUCIÓN",
    "Mostrá solamente los mensajes publicitarios pedidos en la idea y un único llamado a la acción. Escribí el copy exactamente y con buena ortografía.",
    `Nombre escrito: «CompeteZone». En voz se pronuncia «Compit Zone». Frase de marca disponible: «${describeColors(brand.tagline)}». Sitio para el cierre: «${describeColors(brand.website)}».`,
    "No imprimas ni pronuncies códigos de color, números de paleta, nombres de colores, parámetros, etiquetas de secciones o instrucciones técnicas. Esto también aplica a ropa, carteles, banderas y objetos del fondo.",
  ].filter(Boolean).join("\n");
}
