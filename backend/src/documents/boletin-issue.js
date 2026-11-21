export function boletinIssue(key) {
  const match = /^originals\/Boletin Salesiano \d{4}(0[1-9]|1[0-2]) N(\d+)\.pdf$/.exec(key);
  if (!match || Number(match[2]) === 0) return {};
  return { month: Number(match[1]), issue_number: Number(match[2]) };
}
