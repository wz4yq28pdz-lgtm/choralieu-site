/**
 * Tiny, dependency-free Markdown renderer.
 *
 * Intentionally minimal — handles headings, paragraphs, lists, links,
 * inline code, code fences, bold, italic, and horizontal rules. Swap in
 * a full renderer (e.g. marked, remark) later if you need more.
 */
export function renderMarkdown(md: string): string {
  if (!md) return '';

  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  // Extract fenced code blocks first to protect them.
  const codeBlocks: string[] = [];
  md = md.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre><code class="lang-${lang || 'text'}">${escape(code)}</code></pre>`,
    );
    return `\u0000CODEBLOCK${idx}\u0000`;
  });

  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  function inline(s: string): string {
    s = escape(s);
    // bold then italic
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|\W)\*([^*]+)\*(?=\W|$)/g, '$1<em>$2</em>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // links [text](url)
    s = s.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" rel="noopener noreferrer">$1</a>',
    );
    return s;
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      closeList();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    if (/^[-*+]\s+/.test(line)) {
      flushPara();
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^[-*+]\s+/, ''))}</li>`);
      continue;
    }
    if (/^---+$/.test(line)) {
      flushPara();
      closeList();
      out.push('<hr />');
      continue;
    }
    if (line.startsWith('\u0000CODEBLOCK')) {
      flushPara();
      closeList();
      out.push(line);
      continue;
    }
    para.push(line);
  }
  flushPara();
  closeList();

  let html = out.join('\n');
  html = html.replace(
    /\u0000CODEBLOCK(\d+)\u0000/g,
    (_, i) => codeBlocks[Number(i)] ?? '',
  );
  return html;
}
