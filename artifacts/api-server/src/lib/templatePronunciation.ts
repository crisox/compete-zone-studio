export const PRONUNCIATION_DIRECTION = "En los guiones hablados escribí directamente la pronunciación fonética: CompeteZone / Compete Zone debe ser «compit son» y competezone.fit debe ser «compit son punto fit». No escribas CompeteZone, Compit Zone ni competezone.fit dentro de una locución. Separá el CTA visible del hablado; en pantalla la dirección sigue siendo competezone.fit.";
const footer = "PRONUNCIACIÓN — SOLO AUDIO: CompeteZone / Compete Zone se dice «compit son»; competezone.fit se dice «compit son punto fit». Si hay voz o CTA hablado, deben usar estas formas. En pantalla escribí competezone.fit, nunca la transcripción fonética.";
export const TEMPLATE_PROMPT_BUDGET = 3500;

function spoken(text: string) {
  return text
    .replace(/\b(?:compete[\s-]?zone|compit[\s-]?zone)\s*\.\s*fit\b/gi, "compit son punto fit")
    .replace(/\bcompit[\s-]?zone\s+punto\s+fit\b/gi, "compit son punto fit")
    .replace(/\b(?:compete[\s-]?zone|compit[\s-]?zone)\b/gi, "compit son");
}

export function normalizeTemplatePronunciation(prompt: string, kind: string) {
  if (kind !== "video") return prompt;
  let result = prompt.trimEnd();
  while (result.endsWith(footer)) result = result.slice(0, -footer.length).trimEnd();

  // Protect explicitly visible copy before modifying spoken passages.
  const visual: string[] = [];
  result = result.replace(
    /((?:CTA(?!\s+(?:hablado|en\s+voz|con\s+(?:voz|locuci[oó]n)))|texto|copy)[^«“"\n.;]{0,80}[«“"])([^»”"\n]*)([»”"])/gi,
    (match) => { visual.push(match); return `\uE000${visual.length - 1}\uE001`; },
  );
  result = result.replace(
    /((?:locuci[oó]n|narraci[oó]n|voz|di[aá]logo|speech|voice[- ]?over|CTA\s+hablado)[^«“"\n.;]{0,100}[«“"])([^»”"]*)([»”"])/gi,
    (_match, label: string, text: string, close: string) => `${label}${spoken(text)}${close}`,
  );
  // Also support unquoted speech headers and multiline scripts.
  let audio = false;
  result = result.split("\n").map(line => {
    const voiceHeader = /^\s*(?:[-*#]\s*)?(?:locuci[oó]n|narraci[oó]n|voz(?:\s+en\s+off)?|di[aá]logo|speech|CTA\s+hablado)[^:\n]{0,80}:\s*/i;
    const header = line.match(voiceHeader);
    if (header) { audio = true; return header[0] + spoken(line.slice(header[0].length)); }
    if (/^\s*(?:[-*#]\s*)?(?:texto|copy|CTA|escena|c[aá]mara|m[uú]sica|sonido|paleta|logo|visual|cierre)\b|\uE000/.test(line)) audio = false;
    return audio ? spoken(line) : line;
  }).join("\n");
  result = result.replace(/\uE000(\d+)\uE001/g, (_match, index: string) => visual[Number(index)]);
  // Legacy phonetic "Compit Zone" is not the official written brand or URL.
  result = result.replace(/\bcompit[\s-]?zone\s+punto\s+fit\b/gi, "compit son punto fit")
    .replace(/\bcompit[\s-]?zone\b/gi, "compit son");
  result = `${result.trimEnd()}\n\n${footer}`;
  if (result.length > 4000) throw new Error("El prompt no tiene espacio para la regla de pronunciación. Acortá la descripción visual; la locución no se truncó.");
  return result;
}
