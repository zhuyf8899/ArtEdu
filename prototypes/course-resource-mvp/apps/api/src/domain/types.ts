export type UserStatus = "active" | "limited" | "suspended";
export type ReviewStatus = "pending" | "approved" | "rejected";

export interface User {
  id: string;
  name: string;
  initials: string;
  department: string;
  identity: "学生" | "教师" | "管理员";
  status: UserStatus;
  plan: string;
  dailyLimit: number;
  dailyUsed: number;
  monthlyLimit: number;
  monthlyUsed: number;
  concurrentLimit: number;
  activeTasks: number;
  works: number;
  lastActive: string;
}

export interface Review {
  id: string;
  title: string;
  author: string;
  department: string;
  kind: string;
  model: string;
  submittedAt: string;
  machineStatus: string;
  prompt: string;
  assets: number;
  cover: string;
  status: ReviewStatus;
  note?: string;
}

export type PublishStatus = "draft" | "pending_review" | "published" | "rejected" | "archived";
export type LearningStatus = "not_started" | "in_progress" | "completed";
export type LearningContentType = "project" | "course";

export interface Subject {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
}

export interface Tag {
  id: string;
  name: string;
  kind: "difficulty" | "feature" | "topic";
}

export interface ResourceFile {
  id: string;
  name: string;
  mimeType: string;
  byteSize: number;
  storageKey: string;
  url: string;
  safetyStatus: "pending" | "safe" | "blocked";
  createdBy: string;
  createdAt: string;
}

export interface CourseStep {
  id: string;
  title: string;
  summary: string;
  sortOrder: number;
  kind: "lesson" | "resource" | "workflow" | "assignment";
  estimatedMinutes: number;
  resourceFileIds: string[];
  workflowId?: string;
  modelIds?: string[];
}

export interface LearningContent {
  id: string;
  slug: string;
  type: LearningContentType;
  title: string;
  summary: string;
  subjectIds: string[];
  tagIds: string[];
  instructorId: string;
  instructorName: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  cover: string;
  status: PublishStatus;
  featured: boolean;
  enrollmentCount: number;
  version: number;
  steps: CourseStep[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  rejectionNote?: string;
}

export interface Enrollment {
  id: string;
  userId: string;
  contentId: string;
  status: LearningStatus;
  completedStepIds: string[];
  lastStepId?: string;
  progressPercent: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ContentReview {
  id: string;
  contentId: string;
  contentTitle: string;
  contentType: LearningContentType;
  submitterId: string;
  submitterName: string;
  status: ReviewStatus;
  submittedAt: string;
  snapshotVersion: number;
  reviewerId?: string;
  note?: string;
  decidedAt?: string;
}

export interface GenerationOutput {
  id: string;
  taskId: string;
  userId: string;
  contentId?: string;
  stepId?: string;
  modelId: string;
  prompt: string;
  type: "image" | "text" | "video";
  url: string | null;
  createdAt: string;
}
