// The app never suggests code unless asked. This spots a code block or a line of code in generated text.
const CODE = /```|^\s*(for|while|if|def|function|public|private|int|let|const|var|return)\b[^\n]*[({:=;]\s*$/m;
export const looksLikeCode = (s: string) => CODE.test(s);
