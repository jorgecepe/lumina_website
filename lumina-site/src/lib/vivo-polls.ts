// Definiciones de las encuestas en vivo de la clase gancho ("Claude en serio").
// Compartido entre las rutas /api/vivo/* y las paginas /vivo y /vivo/panel.
// Las opciones se calibraron con lo que los ~120 inscritos escribieron en la
// landing (mayoria: automatizar procesos, analisis de datos, informes/PPT).

export type Poll = {
  id: string;
  question: string;
  type?: 'choice' | 'open'; // 'choice' por defecto
  multi?: boolean; // solo choice: permite marcar varias opciones
  options?: string[]; // solo choice
};

export const POLLS: Poll[] = [
  {
    id: 'pagada',
    question: '¿Quién paga hoy por alguna herramienta de IA?',
    options: ['Sí', 'No'],
  },
  {
    id: 'llm',
    question: '¿Qué IA usan?',
    multi: true,
    options: ['ChatGPT', 'Claude', 'Gemini', 'Copilot', 'Perplexity', 'Otra'],
  },
  {
    id: 'cuello',
    question: '¿Cuál es tu mayor cuello de botella hoy?',
    type: 'open',
  },
];

export const POLL_IDS = POLLS.map((p) => p.id);

export function getPoll(id: string): Poll | undefined {
  return POLLS.find((p) => p.id === id);
}

// Estados posibles del "escenario" activo que controla el presentador:
//  - un id de poll (pagada/llm/area/cuello) -> se muestra esa encuesta
//  - QUESTIONS -> caja de preguntas abiertas en primer plano
//  - WAITING   -> pantalla de espera (pausa)
export const WAITING = 'espera';
export const QUESTIONS = 'preguntas';

export const MAX_QUESTION_LEN = 280;
