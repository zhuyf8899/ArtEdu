import type { Enrollment, LearningContent } from "../domain/types.js";
import { enrollments, learningContents, subjects, tags } from "../data/seed.js";

export interface CatalogQuery {
  q?: string;
  subjectId?: string;
  tagId?: string;
  type?: "project" | "course";
  status?: LearningContent["status"];
  featured?: boolean;
}

export function listCatalog(query: CatalogQuery, userId?: string) {
  const normalizedQuery = query.q?.trim().toLowerCase();
  return learningContents
    .filter((item) => !query.status ? item.status === "published" : item.status === query.status)
    .filter((item) => !query.type || item.type === query.type)
    .filter((item) => !query.subjectId || item.subjectIds.includes(query.subjectId))
    .filter((item) => !query.tagId || item.tagIds.includes(query.tagId))
    .filter((item) => query.featured === undefined || item.featured === query.featured)
    .filter((item) => !normalizedQuery || `${item.title} ${item.summary} ${item.instructorName}`.toLowerCase().includes(normalizedQuery))
    .map((item) => withRelations(item, userId));
}

export function withRelations(item: LearningContent, userId?: string) {
  const enrollment = userId ? enrollments.find((entry) => entry.userId === userId && entry.contentId === item.id) : undefined;
  return {
    ...item,
    subjects: item.subjectIds.map((id) => subjects.find((subject) => subject.id === id)).filter(Boolean),
    tags: item.tagIds.map((id) => tags.find((tag) => tag.id === id)).filter(Boolean),
    progress: enrollment ?? null,
  };
}

export function enroll(userId: string, contentId: string) {
  const content = learningContents.find((item) => item.id === contentId && item.status === "published");
  if (!content) return null;
  const existing = enrollments.find((entry) => entry.userId === userId && entry.contentId === contentId);
  if (existing) return existing;
  const created: Enrollment = {
    id: `ENR-${Date.now().toString(36).toUpperCase()}`,
    userId,
    contentId,
    status: "in_progress",
    completedStepIds: [],
    lastStepId: content.steps[0]?.id,
    progressPercent: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  enrollments.push(created);
  content.enrollmentCount += 1;
  return created;
}

export function updateProgress(userId: string, contentId: string, stepId: string, completed: boolean) {
  const content = learningContents.find((item) => item.id === contentId && item.status === "published");
  if (!content || !content.steps.some((step) => step.id === stepId)) return null;
  const enrollment = enroll(userId, contentId)!;
  const completedIds = new Set(enrollment.completedStepIds);
  if (completed) completedIds.add(stepId); else completedIds.delete(stepId);
  enrollment.completedStepIds = [...completedIds];
  enrollment.lastStepId = stepId;
  enrollment.progressPercent = content.steps.length ? Math.round((completedIds.size / content.steps.length) * 100) : 0;
  enrollment.status = enrollment.progressPercent >= 100 ? "completed" : "in_progress";
  enrollment.updatedAt = new Date().toISOString();
  enrollment.completedAt = enrollment.status === "completed" ? enrollment.updatedAt : undefined;
  return enrollment;
}

export function subjectCatalogCounts() {
  return subjects.filter((subject) => subject.enabled).sort((a, b) => a.sortOrder - b.sortOrder).map((subject) => ({
    ...subject,
    count: learningContents.filter((item) => item.status === "published" && item.subjectIds.includes(subject.id)).length,
  }));
}
