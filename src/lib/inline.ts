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

/**
 * For FAQ answers: escapes HTML and turns only [text](/path) into a link, and only for
 * site-relative paths ("/x", not "//host"). Anything else, including other link targets,
 * stays as escaped text.
 */
export function inlineLinks(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return escaped.replace(/\[([^\]]+)\]\((\/(?!\/)[^)\s]*)\)/g, '<a href="$2">$1</a>');
}

/** Plain-text FAQ answer for structured data: link markup reduced to its text. */
export function plainLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\((\/(?!\/)[^)\s]*)\)/g, '$1');
}
