import { z } from "zod";

export const portalSearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(80),
  type: z.enum(["all", "course", "workflow", "work"]).default("all"),
  tag: z.string().trim().min(1).max(40).optional(),
});

export type PortalSearchQuery = z.infer<typeof portalSearchQuerySchema>;
