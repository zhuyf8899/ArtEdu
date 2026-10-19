/** Single byte ranges only. Unsupported/malformed ranges fall back to a full GET. */
export function resolveByteRange(size: number, header?: string):
  | { status: 200; length: number }
  | { status: 206; length: number; start: number; end: number }
  | { status: 416; length: 0 } {
  if (!Number.isSafeInteger(size) || size < 0) throw new Error("Invalid file size");
  const full = { status: 200 as const, length: size };
  if (!header || header.length > 256) return full;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return full;
  const total = BigInt(size);
  let start: bigint, end: bigint;
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (!suffix || !size) return { status: 416, length: 0 };
    start = suffix >= total ? 0n : total - suffix;
    end = total - 1n;
  } else {
    start = BigInt(match[1]);
    end = match[2] ? BigInt(match[2]) : total - 1n;
    // A reversed interval is malformed, rather than an unsatisfied valid range.
    if (match[2] && end < start) return full;
    if (start >= total) return { status: 416, length: 0 };
    if (end >= total) end = total - 1n;
  }
  return { status: 206, start: Number(start), end: Number(end), length: Number(end - start + 1n) };
}
