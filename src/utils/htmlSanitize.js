const sanitizeHtml = require('sanitize-html');

// Allowlist tuned for rich learning content (incl. tables). No script/style,
// no event handlers, safe URL schemes only.
const OPTIONS = {
  allowedTags: [
    'p', 'br', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'sub', 'sup',
    'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'hr',
    'a', 'code', 'pre', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col'
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'title'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    col: ['span', 'width'],
    '*': ['class']
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  // force safe rel on links
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' })
  },
  disallowedTagsMode: 'discard'
};

function sanitizeRichText(html) {
  if (html == null) return '';
  return sanitizeHtml(String(html), OPTIONS);
}

module.exports = { sanitizeRichText };
