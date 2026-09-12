export type ModeTagBadge =
  | { kind: 'mode'; id: string; name: string; body: string }
  | { kind: 'skills'; body: string };

const MODE_TAG_RE = /<mode\s+id="([^"]*)"(?:\s+name="([^"]*)")?>([\s\S]*?)<\/mode>\n?/g;

function innerTag(body: string, tag: string): string {
  const match = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? unescapeXml(match[1]).trim() : '';
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Split the server-side mode instructions block out of a user message. */
export function splitModeTags(text: string): { text: string; badges: ModeTagBadge[] } {
  const badges: ModeTagBadge[] = [];
  const body = text.replace(MODE_TAG_RE, (_match, id: string, name: string, inner: string) => {
    const instructions = innerTag(inner, 'instructions');
    const skills = innerTag(inner, 'mode-skills');
    if (id) {
      badges.push({
        kind: 'mode',
        id,
        name: name ? unescapeXml(name) : '',
        body: [instructions, skills].filter(Boolean).join('\n\n'),
      });
    }
    if (skills) {
      badges.push({ kind: 'skills', body: skills });
    }
    return '';
  });
  return { text: body.replace(/^\n+/, ''), badges };
}
