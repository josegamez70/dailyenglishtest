import { recordExerciseBankCrash } from '../exerciseBankRunLog.ts';

type HandlerEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined> | null;
};

/**
 * Background refill. The heavy modules load inside the handler so a startup
 * throw is written to exercise_bank_runs instead of disappearing.
 */
export const handler = async (event: HandlerEvent) => {
  try {
    const { handleRefill } = await import('../exerciseBankRefill.ts');
    return await handleRefill(event);
  } catch (error) {
    await recordExerciseBankCrash(error);
    return { statusCode: 202, body: '' };
  }
};
