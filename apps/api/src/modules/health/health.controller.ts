import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  getHealth() {
    return { status: "ok", service: "artedu-api", now: new Date().toISOString() };
  }
}
