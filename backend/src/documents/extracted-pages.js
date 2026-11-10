// Text extraction contract for an annual PDF. The OCR layer can be imperfect.
export function splitExtractedPages(text, { maxPageChars = 2_000_000, maxPages = 5000 } = {}) {
  if (typeof text !== 'string') throw new TypeError('Extracted PDF text must be a string');
  const raw = text.split('\f');
  if (raw.at(-1) === '') raw.pop(); // pdftotext appends a final page delimiter
  if (raw.length < 1 || raw.length > maxPages) throw new RangeError('Invalid PDF page count');
  return raw.map((pageText, index) => {
    if (pageText.length > maxPageChars) throw new RangeError('PDF page exceeds size limit');
    const content = pageText.replace(/\0/g, '').trim();
    const letters = (content.match(/\p{L}/gu) ?? []).length;
    const quality = content.length < 80 || (content.length > 0 && letters / content.length < 0.3)
      ? 'needs_review' : 'unreviewed';
    return { pageNumber: index + 1, text: content, quality };
  });
}
