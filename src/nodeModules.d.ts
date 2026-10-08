// Minimal declarations for the few Node built-ins used by asset tests. The
// project deliberately has no @types/node dependency; extend this file instead
// of adding one unless the stack decision changes.
declare module 'node:fs' {
  export function readFileSync(path: URL): Uint8Array;
  export function readFileSync(path: URL, encoding: 'utf8'): string;
}

declare module 'node:crypto' {
  export function createHash(algorithm: 'sha256'): {
    update(data: Uint8Array): { digest(encoding: 'hex'): string };
  };
}

declare module 'node:zlib' {
  export function inflateSync(data: Uint8Array): Uint8Array;
}
