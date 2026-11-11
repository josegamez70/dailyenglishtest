import { formatEuro, PUBLIC_PLANS, VAT_PERCENT } from './billingPlans.ts';
import { PILOT_DAYS, PILOT_SEATS } from './pilotAccess.ts';
import { SAVED_LESSON_LIMIT } from './savedLessonMeta.ts';

export const HELP_PATH = '/help';
export const HELP_CONTACT = 'info@dailyenglishtest.es';
/** Stored only for the language of this page. */
export const HELP_LANG_KEY = 'help-lang';

const LINK = /\[\[([^\]|]+)\|([^\]|]+)\]\]/g;

export type HelpLang = 'en' | 'es';

export type HelpBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] };

export type HelpStep = {
  id: string;
  title: string;
  body: string;
};

export type HelpFaq = {
  id: string;
  question: string;
  blocks: HelpBlock[];
};

export type HelpCopy = {
  lang: HelpLang;
  htmlLang: 'en' | 'es';
  documentTitle: string;
  kicker: string;
  heading: string;
  intro: string;
  stepsLabel: string;
  questions: string;
  stuck: string;
  languageLabel: string;
  steps: readonly HelpStep[];
  faq: readonly HelpFaq[];
};

export function helpPageFromPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === HELP_PATH;
}

export function helpLangFromSearch(search: string): HelpLang | null {
  const value = new URLSearchParams(search).get('lang')?.trim().toLowerCase() ?? '';
  if (value === 'es' || value === 'en') return value;
  return null;
}

/** The address wins when it asks for en or es. Otherwise a saved es choice. Anything else is English. */
export function readHelpLang(search: string, stored: string | null | undefined): HelpLang {
  return helpLangFromSearch(search) ?? (stored === 'es' ? 'es' : 'en');
}

/** Visible words, with link labels kept and addresses removed. */
export function helpPlainText(value: string): string {
  return value.replace(LINK, '$1');
}

export type HelpLinkPart = { kind: 'text'; text: string } | { kind: 'link'; label: string; href: string };

export function helpParts(value: string): HelpLinkPart[] {
  const parts: HelpLinkPart[] = [];
  let cursor = 0;
  for (const match of value.matchAll(LINK)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ kind: 'text', text: value.slice(cursor, index) });
    parts.push({ kind: 'link', label: match[1], href: match[2] });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) parts.push({ kind: 'text', text: value.slice(cursor) });
  return parts;
}

function academyExamplePrices(lang: HelpLang): string {
  return PUBLIC_PLANS
    .filter((plan) => plan.seats != null)
    .map((plan) => (
      lang === 'es'
        ? `Hasta ${plan.seats} alumnos: ${formatEuro(plan.amountCents)} al mes`
        : `Up to ${plan.seats} students is ${formatEuro(plan.amountCents)} per month`
    ))
    .join('. ');
}

const premium = PUBLIC_PLANS.find((plan) => plan.key === 'premium');
const premiumPrice = premium ? formatEuro(premium.amountCents) : '';

const EN_STEPS: readonly HelpStep[] = [
  {
    id: 'create',
    title: 'Create your academy',
    body: 'Open My academy in the menu. Enter a name and press Create academy. Only an academy account can create an academy. A private pilot invitation turns your account into one when you press Activate. Then you name the academy here.',
  },
  {
    id: 'invite',
    title: 'Copy the invite link',
    body: 'My academy shows the invite code in large letters, and the full link under the buttons. The link ends with /join?code= and the code. Press Copy. The page says “Link copied.” Send that link, or read out the code. The code is 6 to 8 letters or numbers. Press New code only when you want a new link. The old link then stops working.',
  },
  {
    id: 'join',
    title: 'The student signs in and joins',
    body: 'The student opens the link on the device they will use. The page says they have been invited to join an academy. They enter an email and open the sign-in link. There is no password. The site then asks “Join {academy name}?”. They press Join. A pill labeled Student appears with their name. Their lessons are covered by the academy.',
  },
  {
    id: 'progress',
    title: 'Open a student',
    body: 'My academy lists each student, how many tests they have done, and their average score. Three cards show students used of your seat limit, tests this week, and the academy average. Press a name to open Student detail.',
  },
  {
    id: 'pdf',
    title: 'Download the PDF',
    body: `On Student detail, press Download PDF. The student can press the same button on My progress. Saved lessons keeps that person’s latest ${SAVED_LESSON_LIMIT} reading and listening lessons and latest ${SAVED_LESSON_LIMIT} grammar sets. Opening one does not use a free lesson. The academy cannot see saved lessons.`,
  },
];

const ES_STEPS: readonly HelpStep[] = [
  {
    id: 'create',
    title: 'Crea tu academia',
    body: 'Abre «My academy» (Mi academia) en el menú. Escribe un nombre y pulsa «Create academy» (Crear academia). Solo una cuenta de academia puede crear una. Una invitación privada de piloto convierte tu cuenta en una al pulsar «Activate» (Activar). Después le pones el nombre aquí.',
  },
  {
    id: 'invite',
    title: 'Copia el enlace de invitación',
    body: '«My academy» muestra el código de invitación en letras grandes y el enlace completo debajo de los botones. El enlace termina en /join?code= seguido del código. Pulsa «Copy» (Copiar). La página dice «Link copied.» (Enlace copiado). Envía ese enlace o lee el código en voz alta. El código tiene de 6 a 8 letras o números. Pulsa «New code» (Código nuevo) solo cuando quieras un enlace nuevo. El enlace anterior deja de funcionar.',
  },
  {
    id: 'join',
    title: 'El alumno entra y se une',
    body: 'El alumno abre el enlace en el dispositivo que va a usar. La página dice que le han invitado a una academia. Escribe un correo y abre el enlace de acceso. No hay contraseña. La web pregunta «Join {academy name}?» (¿Te unes a {nombre de la academia}?). Pulsa «Join» (Unirse). Aparece una pastilla con la etiqueta «Student» (Alumno) y su nombre. Las lecciones las cubre la academia.',
  },
  {
    id: 'progress',
    title: 'Abre la ficha de un alumno',
    body: '«My academy» lista a cada alumno, cuántos tests ha hecho y su nota media. Tres tarjetas muestran las plazas ocupadas de tu límite, los tests de esta semana y la media de la academia. Pulsa un nombre para abrir «Student detail» (Ficha del alumno).',
  },
  {
    id: 'pdf',
    title: 'Descarga el PDF',
    body: `En «Student detail», pulsa «Download PDF» (Descargar PDF). El alumno puede pulsar el mismo botón en «My progress» (Mi progreso). «Saved lessons» (Lecciones guardadas) conserva las ${SAVED_LESSON_LIMIT} últimas lecciones de lectura y audio y los ${SAVED_LESSON_LIMIT} últimos conjuntos de gramática de esa persona. Abrir una no gasta una lección gratis. La academia no puede ver las lecciones guardadas.`,
  },
];

const EN_FAQ: readonly HelpFaq[] = [
  {
    id: 'invite-link',
    question: 'Where is the invite link, and how do I share it?',
    blocks: [
      {
        type: 'p',
        text: 'Sign in, then open My academy. If you have not created the academy yet, enter a name and press Create academy. After that, the page shows Invite code, a Copy button, a New code button, and the full link.',
      },
      {
        type: 'p',
        text: 'Copy places the join link on the clipboard. If the browser blocks it, the page says “Select the link and copy it.” The link is written out under the buttons, so you can select it. Share the link by the channel you already use with your students. The site does not email them.',
      },
      {
        type: 'p',
        text: 'A student can also type the code on Profile. It is 6 to 8 letters or numbers. New code replaces the code. Share the new link. The previous link no longer matches an academy.',
      },
    ],
  },
  {
    id: 'student-joins',
    question: 'What does the student see, and how do they join?',
    blocks: [
      {
        type: 'p',
        text: 'On the invite link, before sign-in, they see: “You have been invited to join an academy. Sign in or create an account to join.” The code is saved on that device. They should open the sign-in email on the same device.',
      },
      {
        type: 'p',
        text: 'Sign-in is an email link. There is no password. The form says “We\'ll email you a sign-in link.” After they open it, the page is titled Join an academy and asks “Join {academy name}?”. They press Join, or Not now.',
      },
      {
        type: 'p',
        text: 'If they are already signed in, the invite link opens Join an academy straight away. They can also paste the code into Invite code on Profile and press Join.',
      },
      {
        type: 'p',
        text: 'After they join, the menu and the top of the screen show a pill labeled Student, with their name. The owner still has My academy. The student does not. On Profile they see the academy name and a Leave button. The plans text says the academy covers their lessons, so they do not take out a personal subscription.',
      },
      {
        type: 'p',
        text: 'If joining does not work, the page shows one of these messages:',
      },
      {
        type: 'ul',
        items: [
          'That code does not match an academy.',
          'This academy is full.',
          'This academy is not accepting students right now.',
          'You already belong to an academy.',
        ],
      },
    ],
  },
  {
    id: 'seats',
    question: 'How many students can join?',
    blocks: [
      {
        type: 'p',
        text: `My academy shows a Students card with how many people have joined, of the seats for that academy. A pilot academy has ${PILOT_SEATS} seats. If the site owner set the academy up by hand, the same card shows that academy’s own limit.`,
      },
      {
        type: 'p',
        text: `The example plans on the site are one monthly price for the whole academy, not a price per student. ${academyExamplePrices('en')}. Students are not charged.`,
      },
      {
        type: 'p',
        text: 'When every seat is taken, the next person sees “This academy is full.” When a pilot has ended, or the academy plan is off, they see “This academy is not accepting students right now.” Names and results that are already stored stay on the list.',
      },
    ],
  },
  {
    id: 'progress',
    question: 'How do I check a student’s progress?',
    blocks: [
      {
        type: 'p',
        text: 'On My academy, each student row shows their name, the number of tests, and the average score. The average is the percentage of correct answers across their tests. Under that, the row shows the date and score of the last test.',
      },
      {
        type: 'p',
        text: 'Three cards sit above the list. Students is how many have joined of your seat limit. Tests this week counts tests since Monday in your local time, across the academy. Academy average is the average score of every test in the academy.',
      },
      {
        type: 'p',
        text: 'Press a student to open Student detail. At the top are three averages: Reading, Listening, and Grammar. Under them, tabs with the same names switch a level list. A level is listed only when that student has a test at that level. Each row shows the average and the number of tests.',
      },
      {
        type: 'p',
        text: 'Grammar tests use the levels B1, B2, and C1. Reading and listening tests are saved as Beginner, Intermediate, or Advanced, so those names appear in the list instead. If a skill has no tests, the page says “No tests for this skill.”',
      },
      {
        type: 'p',
        text: 'Last 14 days is a chart of the average score on each day. If there were no scored tests, it says “No tests in the last 14 days.” Recent tests lists the latest four. View all shows the rest. Open a row to see wrong answers. The student’s answer is labeled “Their answer”.',
      },
      {
        type: 'p',
        text: 'Remove student is at the bottom of Student detail. The page asks you to confirm before it removes them.',
      },
    ],
  },
  {
    id: 'pdf',
    question: 'How do I download the progress PDF?',
    blocks: [
      {
        type: 'p',
        text: 'On Student detail, press Download PDF. That file is for the student you have open. The student can press Download PDF on their own My progress page. The same button is not on the academy list. Open the student first.',
      },
      {
        type: 'p',
        text: 'While the file is being made, the button says “Preparing PDF...”. The PDF is one page. It shows the student name, Reading, Listening, and Grammar averages, the level rows, a Last 14 days chart, and recent tests. If it cannot be made, the page says “Could not create the PDF. Try again.”',
      },
      {
        type: 'p',
        text: 'My progress, for the signed-in person, also shows Tests done, Average score, Day streak, Best score, and a chart of the last 10 scores.',
      },
    ],
  },
  {
    id: 'saved',
    question: 'What are Saved lessons?',
    blocks: [
      {
        type: 'p',
        text: `Saved lessons is in the menu. It keeps the latest ${SAVED_LESSON_LIMIT} reading and listening lessons, and the latest ${SAVED_LESSON_LIMIT} grammar sets, for the signed-in person. Filters show All, Reading, Listening, or Grammar. Press Open to read or hear one again. Opening a saved lesson does not use a free lesson.`,
      },
      {
        type: 'p',
        text: 'An academy can see a student’s name, email, and test results. It cannot see their saved lessons. Saved lessons and progress stay after a pilot ends. They are not deleted.',
      },
    ],
  },
  {
    id: 'practice',
    question: 'What can students practice?',
    blocks: [
      {
        type: 'p',
        text: 'Reading / Listening is the home practice. Choose Reading or Listening, then Text (“A story or monologue”) or Dialogue (“Two speakers”). Then choose a difficulty, a topic, a length, and how many questions, and press Start Learning.',
      },
      {
        type: 'ul',
        items: [
          'Difficulty for reading and listening: Beginner, Intermediate, or Advanced.',
          'A profile level of A1 or A2 starts on Beginner. B1 or B2 starts on Intermediate. C1 or C2 starts on Advanced.',
          'Story length: 60, 100, or 140 words. Questions: 5, 8, or 10.',
          'Topics include Daily Life, School / College, Travel, and Any topic, which picks one at random.',
          'Listening plays the lesson. On a finished test it is tagged Audio. Tap a word in a text to see a meaning.',
        ],
      },
      {
        type: 'p',
        text: 'Grammar is a separate page in the menu. The levels are B1, B2, and C1. The exercises are Fill in the blanks, Phrasal verbs, and Put in order.',
      },
      {
        type: 'p',
        text: 'Each account can create 3 free lessons. They do not expire. They are not a free trial, and you do not enter a card to get them. An active academy covers new lessons for the owner and for students who have joined. When a pilot ends, new lessons stop, and those 3 free lessons do not start again.',
      },
    ],
  },
  {
    id: 'pilot',
    question: 'What is the academy pilot?',
    blocks: [
      {
        type: 'p',
        text: `A pilot is a private invitation for one academy. The link looks like /pilot?code= followed by a code. It is not in the public menu. To ask for one, email [[${HELP_CONTACT}|mailto:${HELP_CONTACT}]].`,
      },
      {
        type: 'p',
        text: `One invitation starts one academy for up to ${PILOT_SEATS} students, for ${PILOT_DAYS} days from the moment the owner presses Activate. The ${PILOT_DAYS} days do not start when the invitation is written. No card is taken, and the page does not start a payment.`,
      },
      {
        type: 'p',
        text: 'The owner opens the link, signs in with the usual email link, and presses Activate academy. The code stays on that device and in the sign-in link. They then open My academy, name it, and invite students the usual way. Students who join are covered until the same end time.',
      },
      {
        type: 'p',
        text: 'Pressing Activate again with the same account does not add more days. A second account cannot use the same code. One account cannot take a second pilot.',
      },
      {
        type: 'p',
        text: `When the ${PILOT_DAYS} days end, new lessons stop for the owner and for the students. Saved lessons and progress stay. The 3 free lessons do not start again. New students cannot join. The owner can email [[${HELP_CONTACT}|mailto:${HELP_CONTACT}]] or look at the example plans.`,
      },
    ],
  },
  {
    id: 'plans',
    question: 'What do the plans cost? Are payments on?',
    blocks: [
      {
        type: 'p',
        text: 'Billing is not active. Paid plans are not on sale yet. The Plans section is an example. Choosing a plan does not charge you, and the site does not ask for a card. No payment is taken until billing is turned on.',
      },
      {
        type: 'p',
        text: `The example prices are in euro per month and include ${VAT_PERCENT}% VAT. VAT is not added on top. Premium is ${premiumPrice} per month for one learner, with unlimited lessons. Academy prices are a fixed monthly price, not a price per student. ${academyExamplePrices('en')}.`,
      },
      {
        type: 'p',
        text: 'The same prices are written in the [[Terms of Use|/terms]]. The home page and Profile show them with an Example label while billing is off. Students on an academy are not charged.',
      },
    ],
  },
  {
    id: 'privacy',
    question: 'Who can see a student’s results?',
    blocks: [
      {
        type: 'p',
        text: 'If you join an academy, that academy can see your name, your email, and your test results. On Student detail the owner can also open wrong answers. The academy cannot see your saved lessons.',
      },
      {
        type: 'p',
        text: 'You can leave the academy at any time from Profile. You must be at least 14 years old to use the site. Academies are responsible for consent for students under 14.',
      },
      {
        type: 'p',
        text: `The full notice is the [[Privacy Policy|/privacy]]. To ask about your data, email [[${HELP_CONTACT}|mailto:${HELP_CONTACT}]].`,
      },
    ],
  },
  {
    id: 'contact',
    question: 'How do I contact you?',
    blocks: [
      {
        type: 'p',
        text: `Email [[${HELP_CONTACT}|mailto:${HELP_CONTACT}]]. Use that address to ask for a pilot invitation, to ask about an academy, or to use the rights in the Privacy Policy.`,
      },
      {
        type: 'p',
        text: 'Who runs the site is on the [[Legal Notice|/legal]].',
      },
    ],
  },
];

const ES_FAQ: readonly HelpFaq[] = [
  {
    id: 'invite-link',
    question: '¿Dónde está el enlace de invitación y cómo lo comparto?',
    blocks: [
      {
        type: 'p',
        text: 'Entra en la cuenta y abre «My academy» (Mi academia). Si todavía no has creado la academia, escribe un nombre y pulsa «Create academy» (Crear academia). Después, la página muestra «Invite code» (Código de invitación), un botón «Copy» (Copiar), un botón «New code» (Código nuevo) y el enlace completo.',
      },
      {
        type: 'p',
        text: '«Copy» copia el enlace de unión en el portapapeles. Si el navegador lo bloquea, la página dice «Select the link and copy it.» (Selecciona el enlace y cópialo). El enlace está escrito debajo de los botones, así que puedes seleccionarlo. Compártelo por el canal que ya uses con tus alumnos. La web no les envía el correo.',
      },
      {
        type: 'p',
        text: 'Un alumno también puede escribir el código en «Profile» (Perfil). Tiene de 6 a 8 letras o números. «New code» sustituye el código. Comparte el enlace nuevo. El anterior ya no corresponde a ninguna academia.',
      },
    ],
  },
  {
    id: 'student-joins',
    question: '¿Qué ve el alumno y cómo se une?',
    blocks: [
      {
        type: 'p',
        text: 'En el enlace de invitación, antes de entrar, ve este texto: «You have been invited to join an academy. Sign in or create an account to join.» (Te han invitado a una academia. Entra o crea una cuenta para unirte). El código se guarda en ese dispositivo. Conviene abrir el correo de acceso en el mismo dispositivo.',
      },
      {
        type: 'p',
        text: 'El acceso es un enlace que llega por correo. No hay contraseña. El formulario dice «We\'ll email you a sign-in link.» (Te enviaremos un enlace para entrar). Al abrirlo, la página se titula «Join an academy» (Unirse a una academia) y pregunta «Join {academy name}?» (¿Te unes a {nombre de la academia}?). Pulsa «Join» (Unirse) o «Not now» (Ahora no).',
      },
      {
        type: 'p',
        text: 'Si ya ha entrado, el enlace abre «Join an academy» directamente. También puede pegar el código en «Invite code», dentro de «Profile», y pulsar «Join».',
      },
      {
        type: 'p',
        text: 'Después de unirse, el menú y la parte de arriba muestran una pastilla con la etiqueta «Student» (Alumno) y su nombre. El responsable sigue teniendo «My academy». El alumno no. En «Profile» ve el nombre de la academia y un botón «Leave» (Salir). El texto de los planes dice que la academia cubre sus lecciones, así que no hace falta una suscripción personal.',
      },
      {
        type: 'p',
        text: 'Si no puede unirse, la página muestra uno de estos mensajes, en inglés:',
      },
      {
        type: 'ul',
        items: [
          '«That code does not match an academy.» (Ese código no corresponde a ninguna academia.)',
          '«This academy is full.» (Esta academia está completa.)',
          '«This academy is not accepting students right now.» (Esta academia no admite alumnos ahora.)',
          '«You already belong to an academy.» (Ya perteneces a una academia.)',
        ],
      },
    ],
  },
  {
    id: 'seats',
    question: '¿Cuántos alumnos pueden unirse?',
    blocks: [
      {
        type: 'p',
        text: `«My academy» muestra una tarjeta «Students» (Alumnos) con cuántas personas se han unido, del número de plazas de esa academia. Una academia de piloto tiene ${PILOT_SEATS} plazas. Si el responsable de la web creó la academia a mano, la misma tarjeta muestra el límite de esa academia.`,
      },
      {
        type: 'p',
        text: `Los planes de ejemplo de la web son un precio mensual para toda la academia, no un precio por alumno. ${academyExamplePrices('es')}. Los alumnos no pagan.`,
      },
      {
        type: 'p',
        text: 'Cuando no quedan plazas, la siguiente persona ve «This academy is full.» (Esta academia está completa). Cuando el piloto ha terminado, o el plan de academia está apagado, ve «This academy is not accepting students right now.» (Esta academia no admite alumnos ahora). Los nombres y los resultados que ya están guardados siguen en la lista.',
      },
    ],
  },
  {
    id: 'progress',
    question: '¿Cómo consulto el progreso de un alumno?',
    blocks: [
      {
        type: 'p',
        text: 'En «My academy», cada fila muestra el nombre, el número de tests y la nota media. La media es el porcentaje de respuestas correctas en sus tests. Debajo, la fila muestra la fecha y la nota del último test.',
      },
      {
        type: 'p',
        text: 'Encima de la lista hay tres tarjetas. «Students» (Alumnos) indica cuántos se han unido respecto de tu límite de plazas. «Tests this week» (Tests de esta semana) cuenta los tests desde el lunes, en tu hora local, de toda la academia. «Academy average» (Media de la academia) es la nota media de todos los tests de la academia.',
      },
      {
        type: 'p',
        text: 'Pulsa un alumno para abrir «Student detail» (Ficha del alumno). Arriba hay tres medias: «Reading» (Lectura), «Listening» (Comprensión oral) y «Grammar» (Gramática). Debajo, unas pestañas con los mismos nombres cambian la lista de niveles. Un nivel solo aparece si ese alumno tiene un test de ese nivel. Cada fila muestra la media y el número de tests.',
      },
      {
        type: 'p',
        text: 'Los tests de «Grammar» usan los niveles B1, B2 y C1. Los de lectura y de listening se guardan como «Beginner», «Intermediate» o «Advanced» (inicial, intermedio o avanzado), y esos nombres son los que salen en la lista. Si una destreza no tiene tests, la página dice «No tests for this skill.» (No hay tests de esta destreza).',
      },
      {
        type: 'p',
        text: '«Last 14 days» (Últimos 14 días) es un gráfico con la nota media de cada día. Si no hubo tests puntuados, dice «No tests in the last 14 days.» (No hay tests en los últimos 14 días). «Recent tests» (Tests recientes) lista los cuatro últimos. «View all» (Ver todos) muestra el resto. Abre una fila para ver los fallos. La respuesta del alumno lleva la etiqueta «Their answer» (Su respuesta).',
      },
      {
        type: 'p',
        text: '«Remove student» (Quitar alumno) está al final de «Student detail». La página pide confirmación antes de quitarlo.',
      },
    ],
  },
  {
    id: 'pdf',
    question: '¿Cómo descargo el PDF de progreso?',
    blocks: [
      {
        type: 'p',
        text: 'En «Student detail», pulsa «Download PDF» (Descargar PDF). Ese archivo es del alumno que tienes abierto. El alumno puede pulsar «Download PDF» en su propia página «My progress» (Mi progreso). Ese botón no está en la lista de la academia. Primero abre al alumno.',
      },
      {
        type: 'p',
        text: 'Mientras se prepara el archivo, el botón dice «Preparing PDF...» (Preparando el PDF...). El PDF ocupa una página. Muestra el nombre del alumno, las medias de «Reading», «Listening» y «Grammar», las filas de nivel, un gráfico «Last 14 days» y los tests recientes. Si no se puede crear, la página dice «Could not create the PDF. Try again.» (No se ha podido crear el PDF. Inténtalo de nuevo).',
      },
      {
        type: 'p',
        text: '«My progress», para la persona que ha entrado, también muestra «Tests done» (Tests hechos), «Average score» (Nota media), «Day streak» (Racha de días), «Best score» (Mejor nota) y un gráfico de las 10 últimas notas.',
      },
    ],
  },
  {
    id: 'saved',
    question: '¿Qué son las «Saved lessons»?',
    blocks: [
      {
        type: 'p',
        text: `«Saved lessons» (Lecciones guardadas) está en el menú. Guarda las ${SAVED_LESSON_LIMIT} últimas lecciones de lectura y audio, y los ${SAVED_LESSON_LIMIT} últimos conjuntos de gramática, de quien ha entrado. Los filtros son «All», «Reading», «Listening» y «Grammar». Pulsa «Open» (Abrir) para leer o escuchar una otra vez. Abrir una lección guardada no gasta una lección gratis.`,
      },
      {
        type: 'p',
        text: 'Una academia puede ver el nombre, el correo y los resultados de los tests de un alumno. No puede ver sus lecciones guardadas. Las lecciones guardadas y el progreso siguen ahí cuando termina un piloto. No se borran.',
      },
    ],
  },
  {
    id: 'practice',
    question: '¿Qué pueden practicar los alumnos?',
    blocks: [
      {
        type: 'p',
        text: '«Reading / Listening» (Lectura / listening) es la práctica de la página de inicio. Elige «Reading» (Lectura) o «Listening» (Comprensión oral) y, después, «Text» («A story or monologue»: un relato o un monólogo) o «Dialogue» («Two speakers»: dos interlocutores). Luego elige la dificultad, el tema, la longitud y el número de preguntas, y pulsa «Start Learning» (Empezar a aprender).',
      },
      {
        type: 'ul',
        items: [
          'Dificultad de lectura y de listening: «Beginner», «Intermediate» o «Advanced» (inicial, intermedio o avanzado).',
          'Un nivel de perfil A1 o A2 empieza en «Beginner». B1 o B2 empieza en «Intermediate». C1 o C2 empieza en «Advanced».',
          'Longitud del relato: 60, 100 o 140 palabras. Preguntas: 5, 8 o 10.',
          'Los temas incluyen «Daily Life», «School / College», «Travel» y «Any topic» (Cualquier tema), que elige uno al azar.',
          '«Listening» reproduce la lección. En un test terminado se etiqueta «Audio». Toca una palabra de un texto para ver su significado.',
        ],
      },
      {
        type: 'p',
        text: '«Grammar» (Gramática) es una página aparte del menú. Los niveles son B1, B2 y C1. Los ejercicios son «Fill in the blanks» (rellenar los huecos), «Phrasal verbs» (verbos frasales) y «Put in order» (poner en orden).',
      },
      {
        type: 'p',
        text: 'Cada cuenta puede crear 3 lecciones gratis. No caducan. No son una prueba gratuita y no hace falta tarjeta para conseguirlas. Una academia activa cubre las lecciones nuevas del responsable y de los alumnos que se han unido. Cuando termina un piloto, las lecciones nuevas se detienen y esas 3 lecciones gratis no vuelven a empezar.',
      },
    ],
  },
  {
    id: 'pilot',
    question: '¿Qué es el piloto de academia?',
    blocks: [
      {
        type: 'p',
        text: `Un piloto es una invitación privada para una academia. El enlace tiene la forma /pilot?code= seguida de un código. No está en el menú público. Para pedir uno, escribe a [[${HELP_CONTACT}|mailto:${HELP_CONTACT}]].`,
      },
      {
        type: 'p',
        text: `Una invitación pone en marcha una academia para un máximo de ${PILOT_SEATS} alumnos, durante ${PILOT_DAYS} días desde el momento en que el responsable pulsa «Activate» (Activar). Los ${PILOT_DAYS} días no empiezan cuando se crea la invitación. No se pide tarjeta y la página no inicia ningún pago.`,
      },
      {
        type: 'p',
        text: 'El responsable abre el enlace, entra con el enlace de correo de siempre y pulsa «Activate academy» (Activar academia). El código se queda en ese dispositivo y dentro del enlace de acceso. Después abre «My academy», le pone nombre e invita a los alumnos como siempre. Quienes se unen quedan cubiertos hasta la misma hora de fin.',
      },
      {
        type: 'p',
        text: 'Pulsar «Activate» otra vez con la misma cuenta no añade días. Otra cuenta no puede usar el mismo código. Una cuenta no puede aceptar un segundo piloto.',
      },
      {
        type: 'p',
        text: `Cuando pasan los ${PILOT_DAYS} días, las lecciones nuevas se detienen para el responsable y para los alumnos. Las lecciones guardadas y el progreso siguen. Las 3 lecciones gratis no vuelven a empezar. No pueden unirse alumnos nuevos. El responsable puede escribir a [[${HELP_CONTACT}|mailto:${HELP_CONTACT}]] o consultar los planes de ejemplo.`,
      },
    ],
  },
  {
    id: 'plans',
    question: '¿Cuánto cuestan los planes? ¿Los pagos están activos?',
    blocks: [
      {
        type: 'p',
        text: 'La facturación no está activa. Los planes de pago todavía no están a la venta. La sección «Plans» (Planes) es un ejemplo. Elegir un plan no cobra nada y la web no pide la tarjeta. No se realiza ningún cobro hasta que se active la facturación.',
      },
      {
        type: 'p',
        text: `Los precios de ejemplo están en euros al mes e incluyen el ${VAT_PERCENT} % de IVA. En la web se ve como «${VAT_PERCENT}% VAT» (IVA incluido). El IVA no se suma encima del total. «Premium» son ${premiumPrice} al mes para una persona, con lecciones ilimitadas. El precio de academia es una cuota mensual fija, no un precio por alumno. ${academyExamplePrices('es')}.`,
      },
      {
        type: 'p',
        text: 'Los mismos precios están en las [[«Terms of Use»|/terms]] (condiciones de uso). La página de inicio y «Profile» los muestran con la etiqueta «Example» (Ejemplo) mientras la facturación está apagada. Los alumnos de una academia no pagan.',
      },
    ],
  },
  {
    id: 'privacy',
    question: '¿Quién puede ver los resultados de un alumno?',
    blocks: [
      {
        type: 'p',
        text: 'Si te unes a una academia, esa academia puede ver tu nombre, tu correo y los resultados de tus tests. En «Student detail» el responsable también puede abrir las respuestas falladas. La academia no puede ver tus lecciones guardadas.',
      },
      {
        type: 'p',
        text: 'Puedes salir de la academia cuando quieras desde «Profile». Hay que tener al menos 14 años para usar la web. Las academias son responsables del consentimiento de los alumnos menores de 14 años.',
      },
      {
        type: 'p',
        text: `El aviso completo es la [[«Privacy Policy»|/privacy]] (política de privacidad). Para preguntar por tus datos, escribe a [[${HELP_CONTACT}|mailto:${HELP_CONTACT}]].`,
      },
    ],
  },
  {
    id: 'contact',
    question: '¿Cómo os contacto?',
    blocks: [
      {
        type: 'p',
        text: `Escribe a [[${HELP_CONTACT}|mailto:${HELP_CONTACT}]]. Usa esa dirección para pedir una invitación de piloto, para preguntar por una academia o para ejercer los derechos de la «Privacy Policy» (política de privacidad).`,
      },
      {
        type: 'p',
        text: 'Quién gestiona la web está en el [[«Legal Notice»|/legal]] (aviso legal).',
      },
    ],
  },
];

const COPY: Record<HelpLang, Omit<HelpCopy, 'steps' | 'faq'>> = {
  en: {
    lang: 'en',
    htmlLang: 'en',
    documentTitle: 'How it works – Daily English Test',
    kicker: 'For academies',
    heading: 'How it works',
    intro: 'A short guide for an academy owner and their students.',
    stepsLabel: 'Steps',
    questions: 'Questions',
    stuck: 'Still stuck? Email',
    languageLabel: 'Language',
  },
  es: {
    lang: 'es',
    htmlLang: 'es',
    documentTitle: 'Cómo funciona – Daily English Test',
    kicker: 'Para academias',
    heading: 'Cómo funciona',
    intro: 'Una guía breve para el responsable de una academia y para sus alumnos.',
    stepsLabel: 'Pasos',
    questions: 'Preguntas',
    stuck: '¿Te queda alguna duda? Escribe a',
    languageLabel: 'Idioma',
  },
};

export function helpCopy(lang: HelpLang): HelpCopy {
  const base = COPY[lang];
  return {
    ...base,
    steps: lang === 'es' ? ES_STEPS : EN_STEPS,
    faq: lang === 'es' ? ES_FAQ : EN_FAQ,
  };
}

export const HELP_STEPS = EN_STEPS;
export const HELP_FAQ = EN_FAQ;

export function helpVisibleText(lang: HelpLang = 'en'): string {
  const copy = helpCopy(lang);
  const chunks = [
    copy.kicker,
    copy.heading,
    copy.intro,
    copy.questions,
    copy.stuck,
    ...copy.steps.map((step) => `${step.title} ${step.body}`),
    ...copy.faq.flatMap((item) => [
      item.question,
      ...item.blocks.flatMap((block) => (block.type === 'p' ? [block.text] : block.items)),
    ]),
  ];
  return chunks.map((chunk) => helpPlainText(chunk)).join('\n');
}
