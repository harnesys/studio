export const PASTE_AS_FILE_CHARS = 1024;

export function fileFromPastedText(text: string, existingNames: string[]): File | undefined {
  if (text.length < PASTE_AS_FILE_CHARS) {
    return undefined;
  }
  return new File([text], pastedTextName(existingNames), { type: 'text/plain' });
}

function pastedTextName(existingNames: string[]): string {
  const taken = new Set(existingNames);
  if (!taken.has('Pasted text.txt')) {
    return 'Pasted text.txt';
  }
  for (let n = 2; n < 1000; n += 1) {
    const name = `Pasted text ${n}.txt`;
    if (!taken.has(name)) {
      return name;
    }
  }
  return `Pasted text ${Date.now()}.txt`;
}
