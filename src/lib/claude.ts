import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { MappingOutputSchema, type ExperienceAnswers, type Followup } from './experiences';
import { buildFollowupPrompt, buildMappingPrompt, type PromptParts } from './experiencePrompts';
import type { RubricCompetency } from './rubric';

// Server code only. The key is read from ANTHROPIC_API_KEY and never reaches the browser.

export const CLAUDE_MODEL = 'claude-opus-5-5';
const TIMEOUT_MS = 30_000;

const FollowupOutputSchema = z.object({ questions: z.array(z.string()) });

let client: Anthropic | null = null;

function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

// One structured Claude call. Returns null on any failure (timeout, API error, refusal,
// or unparseable output) so callers have a single failure path.
async function structuredCall(
  label: string,
  effort: 'low' | 'medium',
  prompt: PromptParts,
  schema: z.ZodType
): Promise<unknown | null> {
  try {
    const response = await getClient().beta.messages.parse(
      {
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        // If a safety check declines the request, the API retries it on Anthropic's recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort, format: betaZodOutputFormat(schema) },
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      },
      { timeout: TIMEOUT_MS, maxRetries: 0 }
    );

    if (response.stop_reason === 'refusal') {
      console.error(`[claude:${label}] request was declined`);
      return null;
    }
    return response.parsed_output ?? null;
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      console.error(`[claude:${label}] timed out after ${TIMEOUT_MS / 1000} seconds`);
    } else if (error instanceof Anthropic.APIError) {
      console.error(`[claude:${label}] API error ${error.status}: ${error.message}`);
    } else {
      console.error(`[claude:${label}] failed`, error);
    }
    return null;
  }
}

// Returns zero to many questions (trimmed to two by the caller), or null if the call failed.
export async function askFollowupQuestions(answers: ExperienceAnswers): Promise<string[] | null> {
  const raw = await structuredCall('followups', 'low', buildFollowupPrompt(answers), FollowupOutputSchema);
  const parsed = FollowupOutputSchema.safeParse(raw);
  return parsed.success ? parsed.data.questions : null;
}

// Returns Claude's raw mapping output for validateMapping to check, or null if the call failed.
export async function requestMapping(
  competencies: RubricCompetency[],
  answers: ExperienceAnswers,
  followups: Followup[]
): Promise<unknown | null> {
  return structuredCall(
    'mapping',
    'medium',
    buildMappingPrompt(competencies, answers, followups),
    MappingOutputSchema
  );
}
