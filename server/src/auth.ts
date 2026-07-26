import type {MiddlewareHandler} from 'hono';

/** Constant-time-ish bearer check. The token is a single shared secret; there
 *  is one user. */
export function bearerAuth(token: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    if (header !== `Bearer ${token}`) {
      return c.json({error: 'unauthorized'}, 401);
    }
    await next();
  };
}
