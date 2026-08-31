import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import {
  createLearningNoteSchema,
  createLearningTaskSchema,
  updateLearningNoteSchema,
  updateLearningTaskSchema,
} from "./learning.contracts";
import type {
  CreateLearningNoteInput,
  CreateLearningTaskInput,
  UpdateLearningNoteInput,
  UpdateLearningTaskInput,
} from "./learning.contracts";
import { LearningService } from "./learning.service";

@Controller("me/learning-space")
export class LearningController {
  constructor(private readonly learning: LearningService, private readonly auth: AuthService) {}

  @Get()
  async dashboard(@Req() request: FastifyRequest) {
    return this.learning.getDashboard(await this.auth.getActor(request));
  }

  @Post("tasks")
  async createTask(@Req() request: FastifyRequest, @Body() body: CreateLearningTaskInput) {
    const input = parseInput(createLearningTaskSchema, body);
    return this.learning.createTask(await this.auth.getActor(request), { ...input, taskType: input.taskType ?? "custom" });
  }

  @Patch("tasks/:taskId")
  async updateTask(@Req() request: FastifyRequest, @Param("taskId") taskId: string, @Body() body: UpdateLearningTaskInput) {
    return this.learning.updateTask(await this.auth.getActor(request), taskId, parseInput(updateLearningTaskSchema, body));
  }

  @Delete("tasks/:taskId")
  async deleteTask(@Req() request: FastifyRequest, @Param("taskId") taskId: string) {
    return this.learning.deleteTask(await this.auth.getActor(request), taskId);
  }

  @Post("notes")
  async createNote(@Req() request: FastifyRequest, @Body() body: CreateLearningNoteInput) {
    return this.learning.createNote(await this.auth.getActor(request), parseInput(createLearningNoteSchema, body));
  }

  @Patch("notes/:noteId")
  async updateNote(@Req() request: FastifyRequest, @Param("noteId") noteId: string, @Body() body: UpdateLearningNoteInput) {
    return this.learning.updateNote(await this.auth.getActor(request), noteId, parseInput(updateLearningNoteSchema, body));
  }

  @Delete("notes/:noteId")
  async deleteNote(@Req() request: FastifyRequest, @Param("noteId") noteId: string) {
    return this.learning.deleteNote(await this.auth.getActor(request), noteId);
  }
}
