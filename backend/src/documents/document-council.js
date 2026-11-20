// BC-107 + BC-106: adapter for eventual TIFF/PDF catalogue ingestion.
// This is a read-only proposal: no PDF creation, index mutation or automatic publication.
import { runEvidenceCouncil } from '../agents/evidence-council.js';

export async function reviewDocumentCatalogue({ pages, analyze, critic }) {
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > 5000
    || pages.some((p, i) => p?.pageNumber !== i + 1 || typeof p.text !== 'string'
      || p.text.length > 2000000)
    || typeof analyze !== 'function' || typeof critic !== 'function') {
    throw new Error('INVALID_CATALOGUE_PAGES');
  }
  const refs = pages.map(p => 'P' + p.pageNumber);
  const result = await runEvidenceCouncil({
    roles: ['bibliographer', 'structural_reader'], allowedRefs: refs,
    invoke: (role) => analyze({ role, pages }),
    critic: (proposals, preliminary) => critic({ proposals, preliminary, pages }),
  });
  return {
    ...result,
    requiresHumanReview: true,
    publishable: false, // Even unanimous AI proposals cannot publish without a human.
    pageCount: pages.length,
  };
}
