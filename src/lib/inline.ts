/**
 * Tiny inline markup for copy stored in data files: escapes HTML, then turns
 * [text](/path) into links, **text** into <strong> and `code` into <code>. Nothing else, on
 * purpose: the copy stays readable as plain text and there is no markdown
 * dependency in the build.
 */
export function inline(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
      const external = /^https?:\/\//.test(href);
      return `<a href="${href}"${external ? ' rel="noopener"' : ''}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** Plain-text version for meta tags and structured data. */
export function plain(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
}
