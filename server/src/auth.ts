import type {MiddlewareHandler} from 'hono';

/** Plain string-equality bearer check. Not timing-safe, but there is a single
 *  shared secret and a single user, so a timing side-channel is not a
 *  meaningful risk here. */
export function bearerAuth(token: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    if (header !== `Bearer ${token}`) {
      return c.json({error: 'unauthorized'}, 401);
    }
    await next();
  };
}
