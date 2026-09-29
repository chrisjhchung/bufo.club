/**
 * Time-ordered id: 48-bit millisecond prefix + 80 bits of randomness, hex
 * encoded. Sorts chronologically in an index without a separate timestamp.
 */
export function newId(): string {
  const time = Date.now().toString(16).padStart(12, '0')
  const random = crypto.getRandomValues(new Uint8Array(10))
  const suffix = [...random].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${time}${suffix}`
}

export const nowSeconds = () => Math.floor(Date.now() / 1000)
