/**
 * AI service for blueprint and content generation. Provider-agnostic: callers
 * pass an LlmProvider from getLlm() in src/lib/llm.
 */

import { completeJsonObject } from "@/lib/llm/json";
import type { LlmProvider } from "@/lib/llm/types";

export interface BlueprintContext {
  title: string;
  overview?: string | null;
  audience?: string | null;
  targetWordCount?: number | null;
  tone?: string | null;
  complianceLevel?: string | null;
}

export type BlueprintSection =
  | "description"
  | "modules"
  | "lessons"
  | "ilos"
  | "assessmentPlan";

export interface BlueprintData {
  description?: string;
  modules?: { title: string }[];
  lessons?: { moduleIndex: number; title: string }[];
  ilos?: string[];
  assessmentPlan?: string;
}

export async function generateBlueprintSection(
  llm: LlmProvider,
  context: BlueprintContext,
  section: BlueprintSection,
  currentBlueprint?: BlueprintData
): Promise<Partial<BlueprintData>> {
  const basePrompt = `You are an instructional designer. Given this course context, produce only the requested section in valid JSON. No markdown, no explanation.
Course title: ${context.title}
${context.overview ? `Overview: ${context.overview}` : ""}
${context.audience ? `Audience: ${context.audience}` : ""}
${context.targetWordCount ? `Target word count for whole course: ${context.targetWordCount} words` : ""}
${context.tone ? `Tone: ${context.tone}` : ""}
${context.complianceLevel ? `Compliance: ${context.complianceLevel}` : ""}
`;

  if (section === "description") {
    return await completeJsonObject<{ description: string }>(llm, {
      system: basePrompt + 'Respond with a JSON object: { "description": "2-4 sentence course description" }',
      user: "Generate the course description.",
    });
  }

  if (section === "modules") {
    return await completeJsonObject<{ modules: { title: string }[] }>(llm, {
      system: basePrompt + 'Respond with a JSON object: { "modules": [ { "title": "Module 1 title" }, ... ] }. Suggest 3-6 modules.',
      user: "Generate module titles for this course.",
    });
  }

  if (section === "lessons") {
    const modules = currentBlueprint?.modules ?? [];
    const moduleTitles = modules.map((m) => m.title).join(", ");
    return await completeJsonObject<{ lessons: { moduleIndex: number; title: string }[] }>(llm, {
      system: basePrompt +
        `Existing modules: ${moduleTitles}. Respond with a JSON object: { "lessons": [ { "moduleIndex": 0, "title": "Lesson title" }, ... ] }. moduleIndex is 0-based. Give 2-5 lessons per module.`,
      user: "Generate lesson titles for each module.",
    });
  }

  if (section === "ilos") {
    return await completeJsonObject<{ ilos: string[] }>(llm, {
      system: basePrompt +
        'Respond with a JSON object: { "ilos": [ "By the end of this course learners will...", ... ] }. Provide 3-6 clear learning outcomes.',
      user: "Generate learning outcomes (ILOs).",
    });
  }

  if (section === "assessmentPlan") {
    return await completeJsonObject<{ assessmentPlan: string }>(llm, {
      system: basePrompt +
        'Respond with a JSON object: { "assessmentPlan": "2-5 sentence description of how and where assessment will occur (quizzes, knowledge checks, final quiz, etc.)." }',
      user: "Generate the assessment plan.",
    });
  }

  throw new Error(`Unknown section: ${section}`);
}

// --- Lesson page content generation ---

export interface LessonContentContext {
  courseTitle: string;
  overview?: string | null;
  audience?: string | null;
  tone?: string | null;
  ilos?: string[] | null;
  assessmentPlan?: string | null;
  targetWordCountPerLesson?: number | null;
}

export interface GeneratedContentBlock {
  type: "text" | "heading";
  content: { text?: string; level?: number };
}

export interface GeneratedInteractionBlock {
  type:
    | "reflection"
    | "multiple_choice"
    | "true_false"
    | "drag_and_drop"
    | "matching"
    | "dialog_cards";
  config: Record<string, unknown>;
}

export interface GeneratedLessonContent {
  contentBlocks: GeneratedContentBlock[];
}

export interface GeneratedInteractionsResult {
  interactionBlocks: GeneratedInteractionBlock[];
}

export async function generateLessonContent(
  llm: LlmProvider,
  lessonTitle: string,
  context: LessonContentContext
): Promise<GeneratedLessonContent> {
  const ilosText = Array.isArray(context.ilos) && context.ilos.length ? context.ilos.join("\n") : "Not specified.";
  const wordCountInstruction = context.targetWordCountPerLesson
    ? `Target word count for this lesson: approximately ${context.targetWordCountPerLesson} words. Adjust content length accordingly.`
    : "";
  const prompt = `You are an instructional designer. Generate lesson page content for this lesson in a course.
Course: ${context.courseTitle}
${context.overview ? `Overview: ${context.overview}` : ""}
${context.audience ? `Audience: ${context.audience}` : ""}
${context.tone ? `Tone: ${context.tone}` : ""}
Course learning outcomes (ILOs): ${ilosText}
${wordCountInstruction}

Lesson title: ${lessonTitle}

Respond with a single JSON object with this exact structure. No markdown.
{
  "contentBlocks": [
    { "type": "text", "content": { "text": "<p>2-3 sentence intro for this lesson</p>" } },
    { "type": "heading", "content": { "level": 2, "text": "Main topic heading" } },
    { "type": "text", "content": { "text": "<p>Core content paragraph.</p><p>Another paragraph if needed.</p>" } },
    { "type": "heading", "content": { "level": 3, "text": "Key takeaway or check" } },
    { "type": "text", "content": { "text": "<p>1-2 sentence wrap-up for this section</p>" } },
    { "type": "heading", "content": { "level": 2, "text": "Summary" } },
    { "type": "text", "content": { "text": "<p>2-4 sentence summary of the lesson</p>" } }
  ]
}

IMPORTANT HTML formatting rules for text blocks:
- Wrap each paragraph in <p>...</p> tags
- Use <ul><li>...</li></ul> for bullet lists
- Use <ol><li>...</li></ol> for numbered lists
- Use <strong>...</strong> for bold text
- Use <em>...</em> for italic text

Use "text" and "heading" only for contentBlocks. Keep content aligned to the lesson and ILOs.${context.targetWordCountPerLesson ? ` Aim for approximately ${context.targetWordCountPerLesson} words total in the text content.` : ""}`;

  const parsed = await completeJsonObject<GeneratedLessonContent>(llm, {
    system: "You output only valid JSON. No markdown code fences, no explanation.",
    user: prompt,
  });
  if (!Array.isArray(parsed.contentBlocks)) parsed.contentBlocks = [];
  return parsed;
}

// --- Interaction generation ---

export interface InteractionGenerationContext {
  lessonTitle: string;
  lessonContent: string;
  courseTitle: string;
  ilos: string[];
  assessmentPlan?: string | null;
  tone?: string | null;
}

export interface InteractionGenerationOptions {
  types: (
    | "reflection"
    | "multiple_choice"
    | "true_false"
    | "drag_and_drop"
    | "matching"
    | "dialog_cards"
  )[];
  count: number;
  includeExplanations: boolean;
}

export async function generateInteractions(
  llm: LlmProvider,
  context: InteractionGenerationContext,
  options: InteractionGenerationOptions
): Promise<GeneratedInteractionsResult> {
  const ilosText = context.ilos.length ? context.ilos.join("\n") : "Not specified.";
  const typesDescription = options.types
    .map((t) => {
      if (t === "reflection") return '"reflection" with "prompt" (open-ended question for learner to reflect on)';
      if (t === "multiple_choice") return '"multiple_choice" with "question", "options" (array of 4 strings), "correctIndex" (0-based)' + (options.includeExplanations ? ', "explanation"' : '');
      if (t === "true_false") return '"true_false" with "question", "correct" (boolean)' + (options.includeExplanations ? ', "explanation"' : '');
      if (t === "drag_and_drop") return '"drag_and_drop" with "question", "items" (array of 4-6 strings to put in order), "correctOrder" (array of indices representing the correct sequence, e.g. [2,0,3,1] means item at index 2 goes first)' + (options.includeExplanations ? ', "explanation"' : '');
      if (t === "matching") return '"matching" with "question", "pairs" (array of 4-6 objects with "left" and "right" strings to match)' + (options.includeExplanations ? ', "explanation"' : '');
      if (t === "dialog_cards") return '"dialog_cards" with optional "title", "cards" (array of 3-5 objects with "front" and "back" strings for flip cards)';
      return t;
    })
    .join("; ");

  const prompt = `You are an instructional designer creating knowledge checks and interactions for an e-learning lesson.

Course: ${context.courseTitle}
${context.tone ? `Tone: ${context.tone}` : ""}
Learning outcomes (ILOs): ${ilosText}
${context.assessmentPlan ? `Assessment plan: ${context.assessmentPlan}` : ""}

Lesson title: ${context.lessonTitle}

Lesson content:
${context.lessonContent}

Generate exactly ${options.count} interaction block(s) for this lesson. Use these types: ${typesDescription}.

Requirements:
- Questions must be directly based on the lesson content above
- Questions should help verify understanding of key concepts
- For multiple choice, ensure distractors are plausible but clearly wrong
- For true/false, avoid trick questions
- For reflections, prompt deeper thinking about application
- For drag and drop, create items that have a clear logical sequence (chronological, procedural, or ranked)
- For matching, create pairs with distinct, unambiguous relationships
- For dialog cards, create concise front prompts with informative back content for review
${options.includeExplanations ? "- Include brief explanations for why answers are correct/incorrect" : ""}

Respond with a JSON object:
{
  "interactionBlocks": [
    { "type": "...", "config": { ... } }
  ]
}`;

  const parsed = await completeJsonObject<GeneratedInteractionsResult>(llm, {
    system: "You output only valid JSON. No markdown code fences, no explanation.",
    user: prompt,
  });
  if (!Array.isArray(parsed.interactionBlocks)) parsed.interactionBlocks = [];
  
  const validTypes = new Set(options.types);
  parsed.interactionBlocks = parsed.interactionBlocks.filter((b) =>
    validTypes.has(b.type as InteractionGenerationOptions["types"][number])
  );
  
  return parsed;
}

// --- Block regeneration ---

export interface RegenerateContentBlockContext {
  blockType: string;
  currentContent: Record<string, unknown>;
  pageContent: string;
  lessonTitle: string;
  courseTitle: string;
  tone?: string | null;
}

export async function regenerateContentBlock(
  llm: LlmProvider,
  context: RegenerateContentBlockContext
): Promise<{ content: Record<string, unknown> }> {
  const { blockType, currentContent, pageContent, lessonTitle, courseTitle, tone } = context;

  let typeInstruction = "";
  if (blockType === "text") {
    typeInstruction = `Generate a "text" block with { "text": "<p>paragraph content</p>" }. Write 2-4 sentences that fit the lesson context.
Use HTML formatting: <p> for paragraphs, <ul>/<ol>/<li> for lists, <strong> for bold, <em> for italic.`;
  } else if (blockType === "heading") {
    const level = (currentContent.level as number) || 2;
    typeInstruction = `Generate a "heading" block with { "level": ${level}, "text": "heading text" }. Create a clear, descriptive heading. No HTML in headings.`;
  } else if (blockType === "key_insight") {
    typeInstruction = `Generate a "key_insight" block with { "text": "<p>insight text</p>" }. Write a memorable, impactful statement (1-2 sentences).
Use HTML formatting: <p> for paragraphs, <strong> for bold, <em> for italic.`;
  } else if (blockType === "key_point") {
    typeInstruction = `Generate a "key_point" block with { "title": "optional title", "text": "<p>key point content</p>" }. Summarize an important concept.
Use HTML formatting in text: <p> for paragraphs, <ul>/<ol>/<li> for lists, <strong> for bold, <em> for italic. Title should be plain text.`;
  } else {
    throw new Error(`Cannot regenerate block type: ${blockType}`);
  }

  const prompt = `You are an instructional designer. Regenerate a content block for an e-learning lesson.

Course: ${courseTitle}
Lesson: ${lessonTitle}
${tone ? `Tone: ${tone}` : ""}

Current page content for context:
${pageContent.slice(0, 2000)}

${typeInstruction}

Respond with a JSON object: { "content": { ... } }
The content should be fresh and different from what might already exist, while remaining relevant to the lesson.`;

  return await completeJsonObject<{ content: Record<string, unknown> }>(llm, {
    system: "You output only valid JSON. No markdown code fences, no explanation.",
    user: prompt,
  });
}

export interface RegenerateInteractionBlockContext {
  blockType: string;
  currentConfig: Record<string, unknown>;
  pageContent: string;
  lessonTitle: string;
  courseTitle: string;
  tone?: string | null;
  includeExplanation?: boolean;
}

export async function regenerateInteractionBlock(
  llm: LlmProvider,
  context: RegenerateInteractionBlockContext
): Promise<{ config: Record<string, unknown> }> {
  const { blockType, pageContent, lessonTitle, courseTitle, tone, includeExplanation = true } = context;

  let typeInstruction = "";
  if (blockType === "multiple_choice") {
    typeInstruction = `Generate a "multiple_choice" interaction with:
{ "question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0${includeExplanation ? ', "explanation": "..."' : ""} }
Create a question that tests understanding of the lesson content. Ensure distractors are plausible but clearly wrong.`;
  } else if (blockType === "true_false") {
    typeInstruction = `Generate a "true_false" interaction with:
{ "question": "statement to evaluate", "correct": true or false${includeExplanation ? ', "explanation": "..."' : ""} }
Create a clear statement that can be evaluated as true or false. Avoid trick questions.`;
  } else if (blockType === "reflection") {
    typeInstruction = `Generate a "reflection" interaction with:
{ "prompt": "open-ended question" }
Create a thought-provoking question that encourages learners to apply or reflect on the lesson content.`;
  } else if (blockType === "drag_and_drop") {
    typeInstruction = `Generate a "drag_and_drop" interaction with:
{ "question": "...", "items": ["item1", "item2", "item3", "item4"], "correctOrder": [0, 1, 2, 3]${includeExplanation ? ', "explanation": "..."' : ""} }
Create 4-6 items that have a clear logical sequence (chronological, procedural, or ranked). The correctOrder array indicates which item index should be in each position.`;
  } else if (blockType === "matching") {
    typeInstruction = `Generate a "matching" interaction with:
{ "question": "...", "pairs": [{"left": "term1", "right": "definition1"}, ...]${includeExplanation ? ', "explanation": "..."' : ""} }
Create 4-6 pairs with distinct, unambiguous relationships. Each left item should match exactly one right item.`;
  } else if (blockType === "dialog_cards") {
    typeInstruction = `Generate a "dialog_cards" interaction with:
{ "title": "optional title", "cards": [{"front": "prompt or term", "back": "explanation or definition"}, ...] }
Create 3-5 flip cards for review. Front should be concise, back should provide informative content.`;
  } else {
    throw new Error(`Cannot regenerate interaction type: ${blockType}`);
  }

  const prompt = `You are an instructional designer. Regenerate an interaction/quiz item for an e-learning lesson.

Course: ${courseTitle}
Lesson: ${lessonTitle}
${tone ? `Tone: ${tone}` : ""}

Lesson content for context:
${pageContent.slice(0, 2000)}

${typeInstruction}

Respond with a JSON object: { "config": { ... } }
The question should be fresh and different, while testing key concepts from the lesson.`;

  return await completeJsonObject<{ config: Record<string, unknown> }>(llm, {
    system: "You output only valid JSON. No markdown code fences, no explanation.",
    user: prompt,
  });
}
