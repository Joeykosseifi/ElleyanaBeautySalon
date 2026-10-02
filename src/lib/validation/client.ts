import { z } from "zod";
import { optionalEmail, optionalText, phoneSchema, requiredText } from "./common";

export const clientInputSchema = z.object({
  firstName: requiredText("Client name", 80),
  lastName: optionalText(80),
  phone: phoneSchema,
  email: optionalEmail,
  notes: optionalText(1000),
});

export type ClientInput = z.input<typeof clientInputSchema>;
