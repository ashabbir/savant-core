export function projectCode(name) {
  const cleaned = (name || '')
    .replace(/\(.*?\)/g, ' ') // remove parentheticals
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim();

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (!parts.length) return 'PRJ';

  const stop = new Set(['and', 'of', 'the', 'a', 'an', 'for']);
  const letters = parts
    .filter(w => !stop.has(w.toLowerCase()))
    .map(w => w[0].toUpperCase());

  const code = (letters.join('') || parts[0].slice(0, 3).toUpperCase()).slice(0, 4);
  return code;
}

export function colorForProject(id) {
  // deterministic color from id
  const str = String(id || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return {
    bg: `hsla(${hue} 80% 55% / 0.16)`,
    border: `hsla(${hue} 80% 60% / 0.35)`,
    solid: `hsl(${hue} 80% 60%)`
  };
}

export function colorForEpic(id) {
  const c = colorForProject(id);
  return c.solid;
}
