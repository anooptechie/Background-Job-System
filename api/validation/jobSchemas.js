const { z } = require("zod");

/* ===============================
   Per-Job Payload Schemas
=============================== */

const welcomeEmailSchema = z.object({
  email: z.string().email(),
  forceFail: z.boolean().optional(),
});

const generateReportSchema = z.object({
  reportType: z.string().min(1),
  forceFail: z.boolean().optional(),
});

const cleanupTempSchema = z.object({
  directory: z.string().min(1),
  forceFail: z.boolean().optional(),
});

/* ===============================
   Job Type Mapping
=============================== */

const jobSchemas = {
  "welcome-email": welcomeEmailSchema,
  "generate-report": generateReportSchema,
  "cleanup-temp": cleanupTempSchema,
};

module.exports = {
  jobSchemas,
};
