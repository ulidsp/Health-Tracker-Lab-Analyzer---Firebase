/**
 * Roles definition
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  READER = 'READER',
}

/**
 * Whitelist of email addresses allowed to access the application with their roles.
 */
export const AUTHORIZED_USERS: Record<string, UserRole> = {
  'ulidsp@gmail.com': UserRole.ADMIN, // Your email
  // 'user@gmail.com': UserRole.USER,
  // 'reader@gmail.com': UserRole.READER,
};

/**
 * Set to true to enable the whitelist check.
 */
export const ENABLE_WHITELIST = true;
