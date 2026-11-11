import { unsubscribeResultHtml } from '../tasks.ts';
import { turnOffTasks } from '../taskServer.ts';

type HandlerEvent = {
  httpMethod?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
  rawQuery?: string;
  path?: string;
};

function page(status: number, state: 'ok' | 'invalid' | 'unavailable') {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: unsubscribeResultHtml(state),
  };
}

function tokenFrom(event: HandlerEvent): string {
  const fromQuery = event.queryStringParameters?.token ?? '';
  if (fromQuery) return fromQuery;
  const raw = event.rawQuery ?? '';
  const match = raw.match(/(?:^|&)token=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export const handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return page(405, 'invalid');
  try {
    const result = await turnOffTasks(tokenFrom(event));
    if (result === 'ok') return page(200, 'ok');
    if (result === 'unavailable') return page(503, 'unavailable');
    return page(400, 'invalid');
  } catch (error) {
    console.error('tasks unsubscribe failed', error instanceof Error ? error.message : 'error');
    return page(503, 'unavailable');
  }
};
