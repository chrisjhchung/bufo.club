import { HTTPException } from 'hono/http-exception'
import type { ZodType } from 'zod'

export function badRequest(message: string, details?: unknown): never {
  throw new HTTPException(400, {
    res: Response.json({ error: message, details }, { status: 400 }),
  })
}

export function notFound(message = 'not found'): never {
  throw new HTTPException(404, { res: Response.json({ error: message }, { status: 404 }) })
}

export function conflict(message: string, details?: unknown): never {
  throw new HTTPException(409, {
    res: Response.json({ error: message, details }, { status: 409 }),
  })
}

export function tooManyRequests(message = 'slow down'): never {
  throw new HTTPException(429, { res: Response.json({ error: message }, { status: 429 }) })
}

export function forbidden(message = 'forbidden'): never {
  throw new HTTPException(403, { res: Response.json({ error: message }, { status: 403 }) })
}

export function payloadTooLarge(message: string): never {
  throw new HTTPException(413, { res: Response.json({ error: message }, { status: 413 }) })
}

/** Parse with zod, turning failures into a 400 that names the offending fields. */
export function parseOrBadRequest<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    badRequest(
      'invalid request',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }
  return result.data
}
