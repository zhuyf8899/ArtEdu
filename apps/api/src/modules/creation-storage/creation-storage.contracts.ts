import { z } from "zod";

export const temporaryUploadQuerySchema = z.object({
  conversationLocalId: z.string().trim().min(1).max(120).optional(),
});
