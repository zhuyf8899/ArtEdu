// One interpretation of API progress for cards, details and personal records.
export function courseProgress(course) {
  const value = Number(course?.progressPercent);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

// Patch only an existing catalog record; detail-only/private fields never add a course.
export function mergeCourseRecord(courses, course) {
  return courses.map(item => item.id === course.id ? { ...item, ...course } : item);
}
