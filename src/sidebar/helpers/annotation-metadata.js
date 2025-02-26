/**
 * Utility functions for querying annotation metadata.
 */

/**
 * @typedef {import('../../types/api').Annotation} Annotation
 * @typedef {import('../../types/api').SavedAnnotation} SavedAnnotation
 * @typedef {import('../../types/api').TextPositionSelector} TextPositionSelector
 * @typedef {import('../../types/api').TextQuoteSelector} TextQuoteSelector
 */

/**
 * Extract document metadata from an annotation.
 *
 * @param {Annotation} annotation
 */
export function documentMetadata(annotation) {
  const uri = annotation.uri;

  let domain;
  try {
    domain = new URL(uri).hostname;
  } catch {
    // Annotation URI parsing on the backend is very liberal compared to the URL
    // constructor. There is also some historic invalid data in h (eg [1]).
    // Hence we must handle URL parsing failures in the client.
    //
    // [1] https://github.com/hypothesis/client/issues/3666
    domain = '';
  }
  if (domain === 'localhost') {
    domain = '';
  }

  let title = domain;
  if (annotation.document && annotation.document.title) {
    title = annotation.document.title[0];
  }

  return {
    uri,
    domain,
    title,
  };
}

/**
 * Return the domain and title of an annotation for display on an annotation
 * card.
 *
 * @param {Annotation} annotation
 */
export function domainAndTitle(annotation) {
  return {
    domain: domainTextFromAnnotation(annotation),
    titleText: titleTextFromAnnotation(annotation),
    titleLink: titleLinkFromAnnotation(annotation),
  };
}

/**
 * @param {Annotation} annotation
 */
function titleLinkFromAnnotation(annotation) {
  let titleLink = /** @type {string|null} */ (annotation.uri);

  if (
    titleLink &&
    !(titleLink.indexOf('http://') === 0 || titleLink.indexOf('https://') === 0)
  ) {
    // We only link to http(s) URLs.
    titleLink = null;
  }

  if (annotation.links && annotation.links.incontext) {
    titleLink = annotation.links.incontext;
  }

  return titleLink;
}
/**
 * Returns the domain text from an annotation.
 *
 * @param {Annotation} annotation
 */
function domainTextFromAnnotation(annotation) {
  const document = documentMetadata(annotation);

  let domainText = '';
  if (document.uri && document.uri.indexOf('file://') === 0 && document.title) {
    const parts = document.uri.split('/');
    const filename = parts[parts.length - 1];
    if (filename) {
      domainText = filename;
    }
  } else if (document.domain && document.domain !== document.title) {
    domainText = document.domain;
  }

  return domainText;
}

/**
 * Returns the title text from an annotation and crops it to 30 chars
 * if needed.
 *
 * @param {Annotation} annotation
 */
function titleTextFromAnnotation(annotation) {
  const document = documentMetadata(annotation);

  let titleText = document.title;
  if (titleText.length > 30) {
    titleText = titleText.slice(0, 30) + '…';
  }

  return titleText;
}

/**
 * Return `true` if the given annotation is a reply, `false` otherwise.
 *
 * @param {Annotation} annotation
 */
export function isReply(annotation) {
  return (annotation.references || []).length > 0;
}

/**
 * Return true if the given annotation has been saved to the backend and assigned
 * an ID.
 *
 * @param {Annotation} annotation
 * @return {annotation is SavedAnnotation}
 */
export function isSaved(annotation) {
  return !!annotation.id;
}

/**
 * Return true if an annotation has not been saved to the backend.
 *
 * @deprecated - Use {@link isSaved} instead
 * @param {Annotation} annotation
 */
export function isNew(annotation) {
  return !annotation.id;
}

/**
 * Return `true` if the given annotation is public, `false` otherwise.
 *
 * @param {Annotation} annotation
 */
export function isPublic(annotation) {
  let isPublic = false;

  if (!annotation.permissions) {
    return isPublic;
  }

  annotation.permissions.read.forEach(perm => {
    const readPermArr = perm.split(':');
    if (readPermArr.length === 2 && readPermArr[0] === 'group') {
      isPublic = true;
    }
  });

  return isPublic;
}

/**
 * Return `true` if `annotation` has a selector.
 *
 * An annotation which has a selector refers to a specific part of a document,
 * as opposed to a Page Note which refers to the whole document or a reply,
 * which refers to another annotation.
 *
 * @param {Annotation} annotation
 */
function hasSelector(annotation) {
  return !!(
    annotation.target &&
    annotation.target.length > 0 &&
    annotation.target[0].selector
  );
}

/**
 * Return `true` if the given annotation is not yet anchored.
 *
 * Returns false if anchoring is still in process but the flag indicating that
 * the initial timeout allowed for anchoring has expired.
 *
 * @param {Annotation} annotation
 */
export function isWaitingToAnchor(annotation) {
  return (
    hasSelector(annotation) &&
    typeof annotation.$orphan === 'undefined' &&
    !annotation.$anchorTimeout
  );
}

/**
 * Has this annotation hidden by moderators?
 *
 * @param {Annotation} annotation
 * @return {boolean}
 */
export function isHidden(annotation) {
  return !!annotation.hidden;
}

/**
 * Is this annotation a highlight?
 *
 * Highlights are generally identifiable by having no text content AND no tags,
 * but there is some nuance.
 *
 * @param {Annotation} annotation
 * @return {boolean}
 */
export function isHighlight(annotation) {
  // `$highlight` is an ephemeral attribute set by the `annotator` on new
  // annotation objects (created by clicking the "highlight" button).
  // It is not persisted and cannot be relied upon, but if it IS present,
  // this is definitely a highlight (one which is not yet saved).
  if (annotation.$highlight) {
    return true;
  }

  if (isNew(annotation)) {
    // For new (unsaved-to-service) annotations, unless they have a truthy
    // `$highlight` attribute, we don't know yet if they are a highlight.
    return false;
  }

  // Note that it is possible to end up with an empty (no `text`) annotation
  // that is not a highlight by adding at least one tag—thus, it is necessary
  // to check for the existence of tags as well as text content.

  return (
    !isPageNote(annotation) &&
    !isReply(annotation) &&
    !annotation.hidden && // A hidden annotation has some form of objectionable content
    !annotation.text &&
    !(annotation.tags && annotation.tags.length)
  );
}

/**
 * Return `true` if the given annotation is an orphan.
 *
 * @param {Annotation} annotation
 */
export function isOrphan(annotation) {
  return hasSelector(annotation) && annotation.$orphan === true;
}

/**
 * Return `true` if the given annotation is a page note.
 *
 * @param {Annotation} annotation
 */
export function isPageNote(annotation) {
  return !hasSelector(annotation) && !isReply(annotation);
}

/**
 * Return `true` if the given annotation is a top level annotation, `false` otherwise.
 *
 * @param {Annotation} annotation
 */
export function isAnnotation(annotation) {
  return !!(hasSelector(annotation) && !isOrphan(annotation));
}

/**
 * Return a human-readable string describing the annotation's role.
 *
 * @param {Annotation} annotation
 */
export function annotationRole(annotation) {
  if (isReply(annotation)) {
    return 'Reply';
  } else if (isHighlight(annotation)) {
    return 'Highlight';
  } else if (isPageNote(annotation)) {
    return 'Page note';
  }
  return 'Annotation';
}

/**
 * Key containing information needed to sort annotations based on their
 * associated position within the document.
 *
 * @typedef LocationKey
 * @prop {string} [cfi] - EPUB Canonical Fragment Identifier. For annotations
 *   on EPUBs, this identifies the location of the chapter within the book's
 *   table of contents.
 * @prop {number} [position] - Text offset within the document segment, in UTF-16
 *   code units. For web pages and PDFs this refers to the offset from the start
 *   of the document. In EPUBs this refers to the offset from the start of the
 *   Content Document (ie. chapter).
 */

/**
 * Return a key that can be used to sort annotations by document position.
 *
 * Note that the key may not have any fields set if the annotation is a page
 * note or was created via the Hypothesis API without providing the selectors
 * that this function uses.
 *
 * @param {Annotation} annotation
 * @return {LocationKey}
 */
export function location(annotation) {
  const targets = annotation.target;

  let cfi;
  let position;

  // nb. We ignore the possibility of an annotation having multiple targets here.
  // h and the client only support one.
  for (const selector of targets[0]?.selector ?? []) {
    if (selector.type === 'TextPositionSelector') {
      position = selector.start;
    } else if (selector.type === 'EPUBContentSelector' && selector.cfi) {
      cfi = selector.cfi;
    }
  }

  return { cfi, position };
}

/**
 * Return the number of times the annotation has been flagged
 * by other users. If moderation metadata is not present, returns `null`.
 *
 * @param {Annotation} annotation
 * @return {number|null}
 */
export function flagCount(annotation) {
  if (!annotation.moderation) {
    return null;
  }
  return annotation.moderation.flagCount;
}

/**
 * Return the text quote that an annotation refers to.
 *
 * @param {Annotation} annotation
 * @return {string|null}
 */
export function quote(annotation) {
  if (annotation.target.length === 0) {
    return null;
  }
  const target = annotation.target[0];
  if (!target.selector) {
    return null;
  }
  const quoteSel = target.selector.find(s => s.type === 'TextQuoteSelector');
  return quoteSel ? /** @type {TextQuoteSelector}*/ (quoteSel).exact : null;
}

/**
 * Has this annotation been edited subsequent to its creation?
 *
 * @param {Annotation} annotation
 * @return {boolean}
 */
export function hasBeenEdited(annotation) {
  // New annotations created with the current `h` API service will have
  // equivalent (string) values for `created` and `updated` datetimes.
  // However, in the past, these values could have sub-second differences,
  // which can make them appear as having been edited when they have not
  // been. Only consider an annotation as "edited" if its creation time is
  // more than 2 seconds before its updated time.
  const UPDATED_THRESHOLD = 2000;

  // If either time string is non-extant or they are equivalent...
  if (
    !annotation.updated ||
    !annotation.created ||
    annotation.updated === annotation.created
  ) {
    return false;
  }

  // Both updated and created SHOULD be ISO-8601-formatted strings
  // with microsecond resolution; (NB: Date.prototype.getTime() returns
  // milliseconds since epoch, so we're dealing in ms after this)
  const created = new Date(annotation.created).getTime();
  const updated = new Date(annotation.updated).getTime();
  if (isNaN(created) || isNaN(updated)) {
    // If either is not a valid date...
    return false;
  }
  return updated - created > UPDATED_THRESHOLD;
}
