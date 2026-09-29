import { type BufoExt, MIME_BY_EXT } from '@bufo/shared'

export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'

export async function putImage(
  bucket: R2Bucket,
  key: string,
  body: ArrayBuffer | ReadableStream,
  ext: BufoExt,
  options: { cacheControl?: string; sha256?: string } = {},
): Promise<void> {
  await bucket.put(key, body, {
    httpMetadata: {
      contentType: MIME_BY_EXT[ext],
      cacheControl: options.cacheControl ?? IMMUTABLE_CACHE,
    },
    customMetadata: options.sha256 ? { sha256: options.sha256 } : undefined,
  })
}

/**
 * Move an object between buckets. The Workers R2 binding has no server-side
 * copy, so the body is streamed through; bufos are a few hundred kB, well
 * inside the CPU and memory budget.
 */
export async function moveObject(
  from: R2Bucket,
  fromKey: string,
  to: R2Bucket,
  toKey: string,
  httpMetadata?: R2HTTPMetadata,
): Promise<boolean> {
  const object = await from.get(fromKey)
  if (!object) return false
  await to.put(toKey, object.body, {
    httpMetadata: httpMetadata ?? object.httpMetadata,
    customMetadata: object.customMetadata,
  })
  await from.delete(fromKey)
  return true
}

/** Serve an R2 object as an HTTP response, honouring its stored metadata. */
export function objectResponse(object: R2ObjectBody, cacheControl?: string): Response {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  if (cacheControl) headers.set('cache-control', cacheControl)
  return new Response(object.body, { headers })
}
