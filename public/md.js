// Tiny, safe Markdown -> HTML for model output. Everything is HTML-escaped FIRST, then a few
// constructs are re-introduced as fixed tags. No links, no images, no raw HTML pass-through.
(function (root) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, '$1<em>$2</em>');
  const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const isSep = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

  function render(src) {
    const lines = String(src || '').replace(/\r/g, '').split('\n');
    const out = []; let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {                                   // fenced code
        const buf = []; i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
        i++; out.push(`<pre>${esc(buf.join('\n'))}</pre>`); continue;
      }
      if (/^\s*$/.test(line)) { i++; continue; }
      let m = /^(#{1,6})\s+(.*)$/.exec(line);
      if (m) { out.push(`<h${m[1].length <= 2 ? 4 : 5}>${inline(m[2].replace(/\*\*/g, ''))}</h${m[1].length <= 2 ? 4 : 5}>`); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (/^\s*\|/.test(line) && i + 1 < lines.length && isSep(lines[i + 1])) {   // table
        const head = cells(line); i += 2; const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push('<div class="tbl"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
          + rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
        continue;
      }
      if (/^\s*>/.test(line)) {
        const buf = []; while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`); continue;
      }
      m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
      if (m) {                                                      // list (nesting flattened by indent)
        const ordered = /\d/.test(m[2]), tag = ordered ? 'ol' : 'ul', items = [];
        while (i < lines.length && (m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]))) {
          items.push(`<li style="margin-left:${Math.min(3, Math.floor(m[1].length / 2)) * 14}px">${inline(m[3])}</li>`); i++;
        }
        out.push(`<${tag}>${items.join('')}</${tag}>`); continue;
      }
      const para = [];                                              // paragraph
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*(```|#{1,6}\s|>|\||([-*+]|\d+[.)])\s)/.test(lines[i])) para.push(lines[i++]);
      if (!para.length) { para.push(lines[i++]); }
      out.push(`<p>${inline(para.join(' '))}</p>`);
    }
    return out.join('\n');
  }

  const api = { render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Md = api;
})(typeof window !== 'undefined' ? window : globalThis);
