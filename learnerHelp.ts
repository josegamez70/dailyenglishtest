import { helpCopy, type HelpCopy, type HelpLang, type HelpStep } from './helpContent.ts';

export const LEARNER_HELP_PATH = '/learn';

const EN_STEPS: readonly HelpStep[] = [
  {
    id: 'signin',
    title: 'Sign in',
    body: 'Enter your email on the home page and press Send link. Open the link in that email. There is no password.',
  },
  {
    id: 'profile',
    title: 'Set up Profile',
    body: 'Open Profile. Add a display name if you want one. Retro 95 is the starting theme. Light, Dark, and System are there too. Your @username shows here after you choose one.',
  },
  {
    id: 'level',
    title: 'Choose a practice band',
    body: 'On Reading / Listening, choose B1, B2, or C1. These labels are for practice. They are not an official exam, and they do not guarantee a result.',
  },
  {
    id: 'practice',
    title: 'Reading and Listening',
    body: 'Stay on Reading / Listening. Choose Text or Dialogue, then a topic, and press Generate Exercise. For listening, use the player, then answer the questions.',
  },
  {
    id: 'grammar',
    title: 'Grammar',
    body: 'Open Grammar. Choose Fill in the blanks, Phrasal verbs, or Put in order. Then choose B1, B2, or C1.',
  },
  {
    id: 'vocab',
    title: 'Vocabulary builder',
    body: 'In a lesson, tap a word and press Save word. Open Vocabulary builder and practise saved words with Flashcards or Quiz.',
  },
  {
    id: 'saved',
    title: 'Saved lessons',
    body: 'Open Saved lessons. Your recent reading, listening, and grammar sets are listed. Open one to do it again. Filter with All, Reading, Listening, or Grammar.',
  },
  {
    id: 'tasks',
    title: 'Task packs',
    body: 'Open Tasks and turn Tasks on. A pack is one reading, one listening, and one grammar exercise. The lessons appear in Task packs.',
  },
  {
    id: 'challenge',
    title: 'Daily challenge',
    body: 'Open Daily challenge and choose B1, B2, or C1. You get one reading, one listening, and one grammar part, and one scored attempt. It renews at midnight in Madrid.',
  },
  {
    id: 'scoreboard',
    title: 'Scoreboard',
    body: 'Open Scoreboard. Recreativa opens on Today, with Yesterday beside it. Most exercises is the first ranking. Highest % is the other one.',
  },
  {
    id: 'legends',
    title: 'Retro Legends',
    body: 'Open Retro Legends. A grey badge is still to earn. A lit badge is earned, on the Earned shelf. Tap a badge to read what it marks.',
  },
  {
    id: 'share',
    title: 'Share an exercise',
    body: 'When you finish, press Share. Choose a username if you do not have one yet. Send the link, including on WhatsApp. A friend can try that exercise without an account.',
  },
  {
    id: 'progress',
    title: 'My progress',
    body: 'Open My progress to see your results. Press Download PDF to keep a copy.',
  },
];

const ES_STEPS: readonly HelpStep[] = [
  {
    id: 'signin',
    title: 'Entrar',
    body: 'Escribe tu correo en la página de inicio y pulsa «Send link» (enviar enlace). Abre el enlace del correo. No hay contraseña.',
  },
  {
    id: 'profile',
    title: 'El Profile',
    body: 'Abre «Profile». Añade un nombre para mostrar si quieres. «Retro 95» es el aspecto inicial. «Light», «Dark» y «System» siguen ahí. Tu @usuario se muestra aquí cuando lo eliges.',
  },
  {
    id: 'level',
    title: 'Elegir una banda de práctica',
    body: 'En «Reading / Listening» elige B1, B2 o C1. Esas etiquetas son para practicar. No son un examen oficial y no garantizan un resultado.',
  },
  {
    id: 'practice',
    title: 'Reading y Listening',
    body: 'Sigue en «Reading / Listening». Elige «Text» o «Dialogue», luego un tema, y pulsa «Generate Exercise». En listening, usa el reproductor y después responde.',
  },
  {
    id: 'grammar',
    title: 'Grammar',
    body: 'Abre «Grammar». Elige «Fill in the blanks», «Phrasal verbs» o «Put in order». Después elige B1, B2 o C1.',
  },
  {
    id: 'vocab',
    title: 'Vocabulary builder',
    body: 'En una lección, toca una palabra y pulsa «Save word». Abre «Vocabulary builder» y practica las palabras guardadas con «Flashcards» o «Quiz».',
  },
  {
    id: 'saved',
    title: 'Saved lessons',
    body: 'Abre «Saved lessons». Ahí están tus sets recientes de reading, listening y grammar. Abre uno para hacerlo otra vez. Filtra con «All», «Reading», «Listening» o «Grammar».',
  },
  {
    id: 'tasks',
    title: 'Task packs',
    body: 'Abre «Tasks» y pon «Tasks» en «On». Un pack es un reading, un listening y un grammar. Las lecciones aparecen en «Task packs».',
  },
  {
    id: 'challenge',
    title: 'Daily challenge',
    body: 'Abre «Daily challenge» y elige B1, B2 o C1. Hay un reading, un listening y un grammar, y un intento con puntuación. Se renueva a medianoche en Madrid.',
  },
  {
    id: 'scoreboard',
    title: 'Scoreboard',
    body: 'Abre «Scoreboard». «Recreativa» se abre en «Today», con «Yesterday» al lado. «Most exercises» es el primer orden. «Highest %» es el otro.',
  },
  {
    id: 'legends',
    title: 'Retro Legends',
    body: 'Abre «Retro Legends». Una insignia gris está por ganar. Una encendida está ganada, en la estantería «Earned». Toca una para leer qué marca.',
  },
  {
    id: 'share',
    title: 'Compartir un ejercicio',
    body: 'Al terminar, pulsa «Share». Elige un usuario si todavía no tienes uno. Envía el enlace, también por WhatsApp. Un amigo puede probar ese ejercicio sin cuenta.',
  },
  {
    id: 'progress',
    title: 'My progress',
    body: 'Abre «My progress» para ver tus resultados. Pulsa «Download PDF» para guardar una copia.',
  },
];

export function learnerHelpPageFromPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === LEARNER_HELP_PATH;
}

export function learnerHelpCopy(lang: HelpLang): HelpCopy {
  const base = helpCopy(lang);
  const steps = lang === 'es' ? ES_STEPS : EN_STEPS;
  if (lang === 'es') {
    return {
      ...base,
      documentTitle: 'Para alumnos – Daily English Test',
      kicker: 'Para alumnos',
      heading: 'Cómo funciona',
      intro: 'Una guía breve para quien practica por su cuenta, sin academia.',
      steps,
      faq: [],
    };
  }
  return {
    ...base,
    documentTitle: 'For learners – Daily English Test',
    kicker: 'For learners',
    heading: 'How it works',
    intro: 'A short guide for someone practising on their own, without an academy.',
    steps,
    faq: [],
  };
}
