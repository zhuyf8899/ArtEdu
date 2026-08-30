import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_ENDPOINT = "artedu:is-public-endpoint";

/** Explicit opt-out from the global authentication guard. */
export const Public = () => SetMetadata(IS_PUBLIC_ENDPOINT, true);
