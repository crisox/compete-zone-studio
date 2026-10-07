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

export function withoutBrandTitle(text: string) {
  return text.replace(/\bcompete[\s-]?zone\b(?!\.fit)/gi, "")
    .replace(/[«“"]\s*[»”"]/g, "").replace(/[ \t]{2,}/g, " ").trim();
}

export function buildPrompt(input: CreationInput, brand: StudioBrand) {
  const video = input.kind === "video";
  return [
    video ? "Creá un video publicitario deportivo corto con audio para CompeteZone." : "Creá una imagen publicitaria deportiva para CompeteZone.",
    "",
    "IDEA CREATIVA",
    describeColors(withoutBrandTitle(input.prompt)),
    "",
    "DIRECCIÓN VISUAL Y DE AUDIO — instrucciones de producción, nunca texto de pantalla ni locución",
    "CompeteZone conecta atletas y organizaciones para descubrir competencias, gestionar inscripciones y compartir resultados.",
    `Público: ${input.audience === "organizers" ? "organizadores, boxes, gimnasios, clubes y federaciones de Uruguay" : "atletas de CrossFit, entrenamiento funcional, HYROX y running"}.`,
    "Paleta solo como apariencia: azul deportivo intenso, azul noche oscuro, blanco y celeste luminoso. Pequeños acentos verde lima. No conviertas la paleta en etiquetas, carteles, banderas ni leyendas.",
    `Tono editorial: ${describeColors(withoutBrandTitle(brand.tone))}.`,
    "Personas adultas; esfuerzo, compañerismo y participación. Sin testimonios, datos, eventos ni interfaces inventadas.",
    video ? "Priorizá acción deportiva natural y cámara coherente con la idea. Audio con ambiente real, música original sutil y voz clara en español rioplatense solo si la idea pide narración. No narres las instrucciones, la paleta ni las especificaciones." : "Composición clara y deportiva, tipografía sans serif legible.",
    input.referencePaths?.length ? "Las fotos adjuntas son referencias del sujeto y del entorno. Conservá sus detalles relevantes; no las trates como primer y último fotograma, ni como láminas para mostrar." : "",
    input.includeLogo ? "La identidad de marca se muestra exclusivamente con el archivo del logo oficial sobre fondo blanco, agregado en posproducción. Dejá libre la esquina superior izquierda durante todo el video. No dibujes, recrees ni reemplaces ese logo." : "No inventes ni recrees el logo oficial.",
    "",
    "TEXTO VISIBLE Y LOCUCIÓN",
    "Mostrá solamente los mensajes publicitarios pedidos en la idea y un único llamado a la acción. Escribí el copy exactamente y con buena ortografía.",
    `Frase disponible: «${describeColors(withoutBrandTitle(brand.tagline))}». Sitio escrito para el cierre: «${describeColors(brand.website)}».`,
    video ? "PRONUNCIACIÓN DE LA LOCUCIÓN: la marca CompeteZone o Compete Zone se dice exactamente «compit son». El sitio competezone.fit se dice exactamente «compit son punto fit». Aplicá estas pronunciaciones a toda voz, narración, diálogo y CTA hablado, incluso si la idea o una plantilla usan otra pronunciación. Son indicaciones fonéticas solo para audio: nunca las escribas en pantalla ni en subtítulos. La dirección web visible debe seguir siendo competezone.fit." : "",
    "Nunca escribas el nombre de la marca como título, palabra aislada, tipografía, texto animado o logo inventado, ni en ropa, carteles o banderas. No generes una segunda marca escrita: el logo original la reemplaza. El dominio web del CTA y la mención hablada son las únicas excepciones.",
    "No imprimas ni pronuncies códigos de color, números de paleta, nombres de colores, parámetros, etiquetas de secciones o instrucciones técnicas. Esto también aplica a ropa, carteles, banderas y objetos del fondo.",
  ].filter(Boolean).join("\n");
}
