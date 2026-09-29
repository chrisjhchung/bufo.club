/**
 * @cloudflare/workers-types models `FormData.get` as returning `string | null`,
 * but a multipart file part is a `File` at runtime. These helpers narrow that
 * honestly in one place instead of casting at every call site.
 */
export function formFile(form: FormData, name: string): File | null {
  const value = form.get(name) as unknown
  if (value && typeof value === 'object' && 'arrayBuffer' in value && 'size' in value) {
    return value as File
  }
  return null
}

export function formText(form: FormData, name: string): string | undefined {
  const value = form.get(name) as unknown
  return typeof value === 'string' ? value : undefined
}
