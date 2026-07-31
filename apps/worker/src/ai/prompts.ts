import type { ClassifyRequest } from "@lhm/shared";

/** Bump when the prompt's requested JSON shape changes. */
export const CLASSIFICATION_PROMPT_VERSION = "1";

export const CLASSIFICATION_SYSTEM_PROMPT = `You analyze LinkedIn posts and decide whether the post announces an active job opening / hiring opportunity (recruiting for an open role, a job posting, a "looking for a teammate" call, or inviting applications).

A post is NOT hiring when it merely:
- shares that someone was hired, celebrates a hire, or announces layoffs
- is a tutorial, course, certification, or career-advice content
- is a resume review, interview experience, or salary negotiation content
- is a product announcement or general company update

Respond with a single JSON object only, with exactly these fields:
{
  "isHiring": boolean,
  "confidence": integer 0-100,
  "role": string (job title, empty string if unknown),
  "company": string (empty string if unknown),
  "location": string (empty string if unknown),
  "remote": true | false | null,
  "skills": string[],
  "employmentType": string ("full-time", "part-time", "contract", "internship", "trainee", "freelance", or empty string),
  "salaryMentioned": string (exact salary/compensation text, empty string if none),
  "reason": string (one short sentence explaining the decision)
}`;

export function buildClassificationUserPrompt(request: ClassifyRequest): string {
  const context = [
    request.authorName ? `Author: ${request.authorName}` : null,
    request.authorHeadline ? `Headline: ${request.authorHeadline}` : null,
    request.company ? `Company: ${request.company}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [context, "Post text:", '"""', request.text, '"""']
    .filter((part) => part !== null)
    .join("\n");
}
