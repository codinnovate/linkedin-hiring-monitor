import { HIRING_VERBS, NEGATIVE_INDICATORS, TOPIC_SYNONYMS, normalizeText } from "@lhm/shared";
import type { MatchSource, RawPost } from "@lhm/shared";

export interface HeuristicClassification {
  isHiring: true;
  matchedBy: Exclude<MatchSource, "ai">;
  confidence: number;
  role?: string;
  skills: string[];
  reason: string;
}

const ROLE_SIGNAL =
  /\b(open(?:ing| role)?|position|role|job|opportunity|vacancy|join(?: us| our| the| a)?)\b/;
const TEAM_SIGNAL = /\b(we|our|us|team|department|squad)\b/;

/** Phrases and synonym terms normalized once so post text matches reliably. */
const NORMALIZED_HIRING_VERBS = HIRING_VERBS.map(normalizeText).filter(Boolean);
const NORMALIZED_NEGATIVE_INDICATORS = NEGATIVE_INDICATORS.map(normalizeText).filter(Boolean);
const NORMALIZED_SYNONYMS: ReadonlyArray<readonly [string, string]> = Object.entries(
  TOPIC_SYNONYMS,
).flatMap(([topic, terms]) => terms.map((term) => [topic, normalizeText(term)] as const));

/** Matches synonym groups whose terms appear in the post text. */
export function matchedTopicSynonyms(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return [
    ...new Set(
      NORMALIZED_SYNONYMS.filter(([, term]) => normalized.includes(term)).map(([topic]) => topic),
    ),
  ];
}

/** Best-effort role extraction from phrases like "hiring a Senior React Engineer in Berlin". */
function extractRole(text: string): string | undefined {
  const match = text.match(
    /(?:hiring|need|looking for|want|seeking|recruiting)\s+(?:a|an|for|to hire)?\s*([A-Za-z][\w.+\-/ ]*?)(?=[\s]*[!?.]|\s+(?:in|at|to|with|for|from|based in|remote|–|—)|$)/i,
  );
  const role = match?.[1]?.trim();
  if (!role || /^(our|the|a|an|us)\b/i.test(role)) return undefined;
  if (role.split(/\s+/).length > 8) return undefined;
  return role;
}

/**
 * Heuristic hiring classification. Conservative by design: a strong hiring
 * verb is a keyword hit; otherwise the post needs a topic match plus an
 * explicit opening/role signal to be flagged as "semantic". Negative
 * indicators (already hired, layoffs, tutorials, etc.) always win.
 */
export function heuristicClassifyPost(
  post: Pick<RawPost, "text" | "authorHeadline" | "company">,
): HeuristicClassification | null {
  const raw = [post.text, post.authorHeadline, post.company].filter(Boolean).join(" ");
  const normalized = normalizeText(raw);
  if (!normalized) return null;

  const negative = NORMALIZED_NEGATIVE_INDICATORS.find((indicator) =>
    normalized.includes(indicator),
  );
  if (negative) {
    return null;
  }

  const hiringVerb = NORMALIZED_HIRING_VERBS.find((verb) => normalized.includes(verb));
  if (hiringVerb) {
    const role = extractRole(raw);
    return {
      isHiring: true,
      matchedBy: "keyword",
      confidence: 85,
      ...(role ? { role } : {}),
      skills: matchedTopicSynonyms(raw),
      reason: `matched hiring verb "${hiringVerb}"`,
    };
  }

  const skills = matchedTopicSynonyms(raw);
  if (skills.length > 0 && ROLE_SIGNAL.test(normalized) && TEAM_SIGNAL.test(normalized)) {
    return {
      isHiring: true,
      matchedBy: "semantic",
      confidence: 65,
      skills,
      reason: "topic + opening/role + team signals without explicit hiring verb",
    };
  }

  return null;
}
