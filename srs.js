// SRS formula ported byte-for-byte from db_vocab.py::_apply_review_conn.
export function todayStr(now = new Date()) {
  const yy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function addDays(dayStr, days) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function computeReview(interval, rating, today) {
  interval = interval || 0;
  if (rating === 'again') {
    return { proficiency: 'unfamiliar' };
  }
  if (rating === 'good') {
    const iv = interval > 0 ? Math.max(1, Math.trunc(interval * 2.5)) : 1;
    return { interval: iv, next_review_date: addDays(today, iv), proficiency: 'normal' };
  }
  if (rating === 'easy') {
    const iv = interval > 0 ? Math.max(3, Math.trunc(interval * 3.5)) : 3;
    return { interval: iv, next_review_date: addDays(today, iv), proficiency: 'mastered' };
  }
  throw new Error("rating must be 'again', 'good', or 'easy'");
}

export function isDue(nextReviewDate, today) {
  return nextReviewDate == null || nextReviewDate <= today;
}

export function firstLetter(word) {
  const c = (word || '').trim().charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '';
}
