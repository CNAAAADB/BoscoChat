// BC-105: deterministic, human-reviewable boundaries for annual magazine PDFs.
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTH_PATTERN = new RegExp('\\b(' + MONTHS.join('|') + '|setiembre)\\b', 'i');

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}
function coverCandidate(text, year) {
  const head = normalize(text).slice(0, 1500);
  const firstLines = head.slice(0, 800);
  if (!/don\s+bosco\s+en\s+espana/.test(firstLines)) return null;
  const month = MONTH_PATTERN.exec(head);
  if (!month || !new RegExp('\\b' + year + '\\b').test(head)) return null;
  const issue = /(?:n[.º°o]*|numero|num\.)\s*[:.\-]?\s*(\d{1,5}[a-z]?)/i.exec(head);
  const number = MONTHS.indexOf(month[1].toLowerCase() === 'setiembre' ? 'septiembre' : month[1].toLowerCase()) + 1;
  if (number < 1) return null;
  return { monthStart: number, monthEnd: number, issueNumber: issue?.[1] ?? '', confidence: issue ? 'alta' : 'media' };
}

export function detectMonthlySegments(pages, year) {
  if (!Array.isArray(pages) || !pages.length || pages.length > 5000 || !Number.isInteger(year)) throw new Error('INVALID_SCAN_PAGES');
  for (let i = 0; i < pages.length; i++) {
    if (Number(pages[i].page_number ?? pages[i].pageNumber) !== i + 1) throw new Error('NON_CONTIGUOUS_ARCHIVE_PAGES');
  }
  const starts = [];
  for (let i = 0; i < pages.length; i++) {
    const candidate = coverCandidate(pages[i].text_content ?? pages[i].text, year);
    if (!candidate) continue;
    const previous = starts.at(-1);
    // Running headers repeat within an issue; they are not new covers.
    if (previous && previous.monthStart === candidate.monthStart && previous.issueNumber === candidate.issueNumber) continue;
    starts.push({ ...candidate, startPage: i + 1 });
  }
  if (!starts.length) return [{ startPage: 1, endPage: pages.length, monthStart: null, monthEnd: null, issueNumber: '', confidence: 'baja' }];
  // Include unnumbered introductory leaves at the start, but flag their boundary.
  if (starts[0].startPage !== 1) {
    starts[0].startPage = 1;
    starts[0].confidence = 'baja';
  }
  return starts.map((start, i) => ({
    ...start, endPage: (starts[i + 1]?.startPage ?? (pages.length + 1)) - 1,
  }));
}

export function validateMonthlySegments(segments, pageCount, { allowSingle = false } = {}) {
  if (!Array.isArray(segments) || segments.length < (allowSingle ? 1 : 2) || segments.length > 36
    || !Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 5000) throw new Error('INVALID_FRAGMENT_SEGMENTS');
  let next = 1;
  const result = segments.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || !Number.isSafeInteger(item.startPage) || item.startPage !== next
      || !Number.isSafeInteger(item.endPage) || item.endPage < next || item.endPage > pageCount
      || !Number.isInteger(item.monthStart) || item.monthStart < 1 || item.monthStart > 12
      || !Number.isInteger(item.monthEnd) || item.monthEnd < item.monthStart || item.monthEnd > 12
      || typeof item.issueNumber !== 'string' || !/^[a-zA-Z0-9.\-]{0,20}$/.test(item.issueNumber)) {
      throw new Error('INVALID_FRAGMENT_SEGMENTS');
    }
    next = item.endPage + 1;
    return { startPage: item.startPage, endPage: item.endPage, monthStart: item.monthStart,
      monthEnd: item.monthEnd, issueNumber: item.issueNumber };
  });
  if (next !== pageCount + 1) throw new Error('INCOMPLETE_FRAGMENT_COVERAGE');
  return result;
}

export function monthlyFragmentFilename(year, segment) {
  const month = String(segment.monthStart).padStart(2, '0');
  const end = segment.monthEnd === segment.monthStart ? '' : '-' + String(segment.monthEnd).padStart(2, '0');
  return 'Don Bosco en España_' + year + '_' + month + end + '_p' + String(segment.startPage).padStart(4, '0') + '.pdf';
}
