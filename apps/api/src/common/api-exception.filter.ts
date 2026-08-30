import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    if (reply.sent) return;
    const { statusCode, message } = this.toResponse(exception);
    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) Logger.error(exception, `requestId=${request.id}`, "ApiExceptionFilter");
    reply.code(statusCode).send({ statusCode, message, requestId: request.id, timestamp: new Date().toISOString() });
  }

  private toResponse(exception: unknown) {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === "string") return { statusCode: exception.getStatus(), message: response };
      const body = response as { message?: unknown };
      return { statusCode: exception.getStatus(), message: typeof body.message === "string" ? body.message : "请求参数不符合要求" };
    }
    const statusCode = typeof exception === "object" && exception !== null && "statusCode" in exception && typeof exception.statusCode === "number" && exception.statusCode >= 400 && exception.statusCode < 500 ? exception.statusCode : HttpStatus.INTERNAL_SERVER_ERROR;
    return { statusCode, message: statusCode >= 500 ? "服务器内部错误" : "请求无法处理" };
  }
}
