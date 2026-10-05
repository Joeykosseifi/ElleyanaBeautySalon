import { z } from "zod";

/** Emails are always stored trimmed and lower-case (enforced by a DB constraint too). */
export const emailSchema = z
  .string({ error: "Enter an email address." })
  .trim()
  .toLowerCase()
  .max(200, "Email is too long.")
  .pipe(z.email("Enter a valid email address."));

/** Login only checks presence — strength rules apply when a password is SET. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(200),
});

/** A tiny deny-list of passwords that are guessed first. Length matters most. */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop",
  "11111111", "00000000", "abc12345", "iloveyou", "welcome1", "letmein1", "admin123", "salonflow123",
  "change-me-to-a-strong-password", "changeme", "changeme1",
]);

/**
 * Rules for any NEW password (first-run setup, change, reset): 8–200 characters,
 * at least one letter and one number, and not a well-known password.
 */
export const passwordSchema = z
  .string({ error: "Enter a password." })
  .min(8, "Password must be at least 8 characters.")
  .max(200, "Password is too long.")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Password must contain at least one letter and one number.")
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "This password is too common. Choose another.");

const nameSchema = z.string({ error: "Enter your name." }).trim().min(1, "Enter your name.").max(80, "Name is too long.");

export const setupOwnerSchema = z
  .object({
    // Checked against SALON_SETUP_TOKEN on the server; never stored or logged.
    setupToken: z.string({ error: "Enter the setup token." }).trim().min(1, "Enter the setup token.").max(512, "Setup token is too long."),
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] })
  .refine((v) => v.password.toLowerCase() !== v.email, { message: "Password can't be your email.", path: ["password"] });

export const resetPasswordSchema = z
  .object({ token: z.string().min(20), password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] });

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Enter your current password."), password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] })
  .refine((v) => v.password !== v.currentPassword, { message: "The new password must be different.", path: ["password"] });

export const changeEmailSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newEmail: emailSchema,
});
