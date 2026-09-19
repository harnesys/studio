export type DirectiveBadge =
  | {
      kind: 'mode';
      id: string;
      name: string;
      body: string;
    }
  | {
      kind: 'skills';
      body: string;
    }
  | {
      kind: 'skill';
      name: string;
    };
const MODE_TAG_RE = /<mode\s+id="([^"]*)"(?:\s+name="([^"]*)")?>([\s\S]*?)<\/mode>\n?/g;
const SKILLS_TAG_RE = /<requested-skills\s+names="([^"]*)">[\s\S]*?<\/requested-skills>\n?/g;
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
export function splitDirectiveTags(text: string): {
  text: string;
  badges: DirectiveBadge[];
} {
  const badges: DirectiveBadge[] = [];
  const afterMode = text.replace(MODE_TAG_RE, (_match, id: string, name: string, inner: string) => {
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
  const body = afterMode.replace(SKILLS_TAG_RE, (_match, names: string) => {
    const seen = new Set<string>();
    for (const raw of names.split(',').map(unescapeXml)) {
      const name = raw.trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        badges.push({ kind: 'skill', name });
      }
    }
    return '';
  });
  return { text: body.replace(/^\n+/, ''), badges };
}
