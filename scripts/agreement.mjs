// How a response agrees with the reference's (fixtures/references/<size>.json): the questions
// decided otherwise (a choice's key, a yes-or-no's side of one half, a score's likeliest level)
// and the largest difference of an option's probability or a yes's.

export function agreement(reference, response) {
  const differing = [];
  let maxDelta = 0;
  for (const [name, wanted] of Object.entries(reference.answers)) {
    const answer = response.answers[name] ?? {};
    if (decision(answer) !== decision(wanted)) differing.push(name);
    if ('noul' in wanted) maxDelta = Math.max(maxDelta, Math.abs((answer.noul ?? 0) - wanted.noul));
    for (const [key, probability] of Object.entries(wanted.probabilities ?? {})) {
      maxDelta = Math.max(maxDelta, Math.abs((answer.probabilities?.[key] ?? 0) - probability));
    }
  }
  return { differing, maxDelta };
}

/** What an answer decides. */
export function decision(answer) {
  if ('choice' in answer) return answer.choice;
  if ('noul' in answer) return answer.noul >= 0.5 ? 'yes' : 'no';
  const levels = Object.entries(answer.probabilities ?? {});
  return levels.reduce((best, level) => (level[1] > best[1] ? level : best), levels[0])?.[0];
}
