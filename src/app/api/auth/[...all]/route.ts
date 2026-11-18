import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/auth";

// Endpoints de Better Auth: /api/auth/sign-in/email, /api/auth/two-factor/*, etc.
export const { GET, POST } = toNextJsHandler(auth);
