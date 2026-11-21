/**
 * The roles a test can act as (`test.use({ role })`): the project's own list, which the framework's core reads through
 * `@config/env`. A role logs in with its user from `testUsers` in `src/envs/<ENV>.json` (secrets from `.env`), or with
 * a user created for the run (`setRunUser`). The examples run logged out, so `default` has no user yet: add your roles
 * here, and their users to the env file once `project.login` (src/config/project.ts) can log them in.
 */
export const ROLES = ['default'] as const;

export type UserRole = (typeof ROLES)[number];

/** The role of a test that doesn't set one: the scenarios' "default user". */
export const DEFAULT_ROLE: UserRole = 'default';
