export const QUEUE_NAME = 'email.send';

function intEnv(name: string, defaultValue: number): number {
  const parsed = parseInt(process.env[name] ?? '', 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/** Max retry attempts after the first try. */
export const MAX_RETRIES = intEnv('EMAIL_MAX_RETRIES', 3);
/** Delay (ms) before a failed message is requeued for its next attempt. */
export const RETRY_DELAY_MS = intEnv('EMAIL_RETRY_DELAY_MS', 5000);
/** Priority of first-time deliveries (higher = consumed first). */
export const FIRST_PRIORITY = intEnv('EMAIL_FIRST_PRIORITY', 5);
/** Priority of retries — must be lower than FIRST_PRIORITY. */
export const RETRY_PRIORITY = intEnv('EMAIL_RETRY_PRIORITY', 1);

export const RETRY_COUNT_HEADER = 'x-retry-count';

export const QUEUE_OPTIONS = {
  durable: false,
  arguments: { 'x-max-priority': 10 },
};

export function attemptsOf(msg: any): number {
  const headers = msg?.properties?.headers || {};
  const value = parseInt(headers[RETRY_COUNT_HEADER], 10);
  return Number.isNaN(value) ? 0 : value;
}

/**
 * assertQueue, but if the queue already exists with different arguments
 * (e.g. created before x-max-priority was added) delete it and recreate.
 */
export async function assertQueueCompat(channel: any, queue: string = QUEUE_NAME): Promise<void> {
  try {
    await channel.assertQueue(queue, QUEUE_OPTIONS);
  } catch (e: any) {
    if (e?.code === 406 || /PRECONDITION_FAILED/.test(e?.message || '')) {
      await channel.deleteQueue(queue).catch(() => undefined);
      await channel.assertQueue(queue, QUEUE_OPTIONS);
    } else {
      throw e;
    }
  }
}
