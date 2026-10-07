export interface StudioBrand {
  name: string;
  tagline: string;
  website: string;
  tone: string;
  colors: string[];
  logoPath: string | null;
  logoUrl: string | null;
}
export const brandDefaults: StudioBrand = {
  name: "CompeteZone",
  tagline: "Menos vueltas. Más competencia.",
  website: "competezone.fit",
  tone: "Español rioplatense, con voseo y frases simples. Deportiva, cercana, clara y resolutiva. Beneficios concretos, energía y comunidad. Sin exageraciones, testimonios inventados ni promesas de viralidad.",
  colors: ["#0053B4", "#0F172A", "#FFFFFF", "#0EA5E9", "#A8FF00"],
  logoPath: null,
  logoUrl: null,
};

export const templates = [
  {
    id: "menos-planillas", title: "Menos planillas, más competencia", category: "Organización",
    description: "Mostrá el beneficio de centralizar tu evento.",
    audience: "organizers", kind: "video",
    prompt: "Un organizador de una competencia de entrenamiento funcional en un box de Uruguay deja atrás planillas y mensajes dispersos, y se concentra en recibir a los equipos. Video deportivo cercano con sonido ambiente de box y narración rioplatense: «Tu próxima competencia merece más atención que tus planillas. Menos vueltas. Más competencia». No inventes pantallas de la app. Cerrá con «Organizá tu competencia en competezone.fit».",
  },
  {
    id: "proximo-desafio", title: "Tu próximo desafío", category: "Comunidad",
    description: "Invitá a atletas a encontrar su próxima competencia.",
    audience: "athletes", kind: "image",
    prompt: "Pieza deportiva para redes: equipo de atletas adultos de entrenamiento funcional celebrando juntos después de competir en un box uruguayo. Esfuerzo, compañerismo y participación, luz natural, fotografía realista. Texto principal «Encontrá tu próximo desafío». Un único CTA: «Competí en competezone.fit». No inventes fechas ni eventos.",
  },
  {
    id: "equipo", title: "Competir en equipo", category: "Atletas",
    description: "Una historia sobre esfuerzo y compañerismo.",
    audience: "athletes", kind: "video",
    prompt: "Video vertical de un equipo adulto preparándose para una competencia de CrossFit: ajustan los cordones, se dan ánimo y chocan las manos antes de salir. Sonidos reales del box, música deportiva sin copiar canciones existentes. Narración con voseo: «Entrenaste. Te preparaste. Ahora, competí con tu equipo». Cierre con un único CTA: «Encontrá tu próxima competencia en competezone.fit».",
  },
  {
    id: "centraliza", title: "Todo en un solo lugar", category: "Organización",
    description: "Una pieza clara para organizadores de competencias.",
    audience: "organizers", kind: "image",
    prompt: "Imagen publicitaria deportiva para organizadores de competencias, con atletas adultos de running y entrenamiento funcional en una competencia comunitaria uruguaya. Composición clara en azul y blanco. Texto «Información, inscripciones y resultados en un solo lugar». Cierre «Centralizá tu competencia» y competezone.fit. No mostrar interfaces ficticias ni testimonios.",
  },
];
