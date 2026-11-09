import DOMPurify from 'dompurify';

const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'a', 'br', 'p', 'ul', 'ol', 'li', 'code'],
  ALLOWED_ATTR: ['href', 'rel', 'target'],
  ALLOWED_URI_REGEXP: /^https?:\/\/[^\s]+$/,
};

/** Sanitize user-generated rich text. Always runs through DOMPurify before any __html use. */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, RICH_TEXT_CONFIG) as unknown as string;
}

/** Links opened from sanitized content must never retain window.opener. */
if (typeof window !== 'undefined') {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('rel', 'noopener noreferrer nofollow');
      node.setAttribute('target', '_blank');
    }
  });
}

/** Strip all markup; use for uniform plain-text contexts. */
export function stripHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }) as unknown as string;
}
