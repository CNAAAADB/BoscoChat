// BC-107: domain-neutral, bounded deliberation. Consensus is NOT proof of historical truth.
// Only whitelisted source references can support a proposed claim. No network or persistence.
const FIELD = /^[a-z][a-z0-9_]{0,47}$/;
const ROLE = /^[a-z][a-z0-9_-]{1,40}$/;
const MAX_CLAIMS = 8;

function normalized(value) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es');
}

export function reconcileCouncil(proposals, allowedRefs, objections = [], evidenceByRef = null) {
  if (!Array.isArray(allowedRefs) || allowedRefs.length > 5000
    || allowedRefs.some(ref => typeof ref !== 'string' || !/^[A-Z][A-Z0-9_-]{0,39}$/.test(ref))) {
    throw new Error('INVALID_COUNCIL_REFERENCES');
  }
  const allowed = new Set(allowedRefs);
  if (evidenceByRef !== null && (typeof evidenceByRef !== 'object' || Array.isArray(evidenceByRef)
    || Object.entries(evidenceByRef).some(([ref, value]) =>
      !allowed.has(ref) || typeof value !== 'string' || value.length > 2000000))) {
    throw new Error('INVALID_COUNCIL_EVIDENCE');
  }
  if (!Array.isArray(proposals) || proposals.length < 2 || proposals.length > 3) {
    throw new Error('INVALID_COUNCIL_PROPOSALS');
  }
  const participants = new Set();
  const byField = new Map();
  for (const proposal of proposals) {
    if (!ROLE.test(proposal?.role) || participants.has(proposal.role)
      || !Array.isArray(proposal.claims) || proposal.claims.length > MAX_CLAIMS) {
      throw new Error('INVALID_COUNCIL_PROPOSALS');
    }
    participants.add(proposal.role);
    const seenFields = new Set();
    for (const claim of proposal.claims) {
      if (!FIELD.test(claim?.field) || seenFields.has(claim.field)
        || typeof claim.value !== 'string' || claim.value.length > 320 || !claim.value.trim()
        || !Array.isArray(claim.refs) || claim.refs.length < 1 || claim.refs.length > 6
        || claim.refs.some(ref => !allowed.has(ref))) {
        throw new Error('INVALID_COUNCIL_CLAIM');
      }
      seenFields.add(claim.field);
      const item = {
        role: proposal.role, field: claim.field, value: claim.value.trim(),
        refs: [...new Set(claim.refs)],
        grounded: evidenceByRef === null || claim.refs.some(ref =>
          typeof evidenceByRef[ref] === 'string' &&
          normalized(evidenceByRef[ref]).includes(normalized(claim.value))),
      };
      if (!byField.has(item.field)) byField.set(item.field, []);
      byField.get(item.field).push(item);
    }
  }
  if (!Array.isArray(objections) || objections.length > 12
    || objections.some(field => !FIELD.test(field))) {
    throw new Error('INVALID_COUNCIL_OBJECTIONS');
  }
  const challenged = new Set(objections);
  const agreed = [];
  const disputed = [];
  for (const [field, records] of byField) {
    const values = new Map();
    const groundedValues = new Map();
    for (const item of records) {
      const token = normalized(item.value);
      if (!values.has(token)) values.set(token, []);
      values.get(token).push(item);
      if (item.grounded) {
        if (!groundedValues.has(token)) groundedValues.set(token, []);
        groundedValues.get(token).push(item);
      }
    }
    const winner = [...groundedValues.values()].find(items =>
      new Set(items.map(item => item.role)).size >= 2);
    if (winner && values.size === 1 && records.every(item => item.grounded)
      && !challenged.has(field)) {
      agreed.push({
        field, value: winner[0].value,
        refs: [...new Set(winner.flatMap(item => item.refs))],
        agents: winner.map(item => item.role),
        status: 'agent_agreement', // Agreement, NOT independently validated claim.
      });
    } else {
      disputed.push({
        field, reasons: [
          ...(challenged.has(field) ? ['critic_objection'] : []),
          ...(values.size > 1 ? ['conflicting_values'] : []),
          ...(records.some(item => !item.grounded) ? ['quote_not_in_cited_ocr'] : []),
          ...(winner ? [] : ['insufficient_agreement']),
        ],
        alternatives: [...values.values()].map(items => ({
          value: items[0].value, refs: [...new Set(items.flatMap(item => item.refs))],
        })),
      });
    }
  }
  return { status: disputed.length || !agreed.length ? 'needs_review' : 'agreed',
    agreed, disputed, participants: [...participants] };
}

export async function runEvidenceCouncil({ roles, invoke, critic, allowedRefs, evidenceByRef = null }) {
  if (!Array.isArray(roles) || roles.length !== 2 || new Set(roles).size !== 2
    || roles.some(role => typeof role !== 'string' || !ROLE.test(role))
    || typeof invoke !== 'function' || typeof critic !== 'function') {
    throw new Error('INVALID_COUNCIL_CONFIGURATION');
  }
  // The first round is genuinely parallel and independent: no actor sees another's response.
  const results = await Promise.allSettled(roles.map(role => invoke(role)));
  if (results.some(item => item.status !== 'fulfilled')) {
    return { status: 'needs_review', agreed: [], disputed: [],
      participants: roles, reason: 'specialist_unavailable' };
  }
  const proposals = results.map((item, i) => ({ role: roles[i], claims: item.value?.claims }));
  // Validate all references and claim shapes before sending anything to the critic.
  let preliminary;
  try {
    preliminary = reconcileCouncil(proposals, allowedRefs, [], evidenceByRef);
  } catch {
    return { status: 'needs_review', agreed: [], disputed: [],
      participants: roles, reason: 'invalid_specialist_proposal' };
  }
  let objections;
  try {
    const result = await critic(proposals, preliminary);
    objections = result?.objections;
    const knownFields = new Set(proposals.flatMap(p => p.claims.map(c => c.field)));
    if (!Array.isArray(objections) || objections.some(field => !knownFields.has(field))) {
      throw new Error('INVALID_COUNCIL_CRITIC');
    }
  } catch {
    return { status: 'needs_review', agreed: [], disputed: preliminary.disputed,
      participants: roles, reason: 'critic_unavailable' };
  }
  return reconcileCouncil(proposals, allowedRefs, objections, evidenceByRef);
}
