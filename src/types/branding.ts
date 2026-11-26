/** The layouts a learner-facing course can use. */
export const COURSE_THEMES = [
  {
    id: "classic",
    name: "Classic",
    description: "A tinted reading column under an accent line.",
  },
  {
    id: "card",
    name: "Card",
    description: "The page sits on a raised white card over a tinted background.",
  },
  {
    id: "banner",
    name: "Banner",
    description: "A band of your primary colour runs across the top, with the page overlapping it.",
  },
] as const;

export type CourseThemeId = (typeof COURSE_THEMES)[number]["id"];

export function isCourseThemeId(value: unknown): value is CourseThemeId {
  return COURSE_THEMES.some((t) => t.id === value);
}

export interface BrandConfig {
  /** Page layout for the exported course. Defaults to "classic". */
  theme?: CourseThemeId;
  /** Primary brand / primary button fill / links */
  primary?: string;
  /** Secondary colour (outline, secondary text) */
  secondary?: string;
  /** CTA / conversion accent */
  accent?: string;
  /** Page background (outer/body background) */
  background?: string;
  /** Content background (main content area background) */
  contentBg?: string;
  /** Logo image URL */
  logoUrl?: string | null;
  /** Body font (legacy single font) */
  font?: string;
  /** Primary button fill */
  primaryButtonFill?: string;
  /** Primary button text */
  primaryButtonText?: string;
  /** Primary button hover (slightly darker) */
  primaryButtonHover?: string;
  /** Secondary button outline/text */
  secondaryButtonColor?: string;
  /** Secondary button background */
  secondaryButtonBg?: string;
  /** CTA button fill */
  ctaFill?: string;
  /** CTA button text */
  ctaText?: string;
  /** Card background */
  cardBg?: string;
  /** Link colour */
  linkColor?: string;
  /** Heading font (e.g. Work Sans) */
  headingFont?: string;
  /** Body font (e.g. Ubuntu) */
  bodyFont?: string;
}

/** Default branding options used when creating a new course. */
export const DEFAULT_BRAND_CONFIG: BrandConfig = {
  primary: "#015887",
  primaryButtonFill: "#015887",
  primaryButtonText: "#f8f8f8",
  primaryButtonHover: "#014670",
  secondary: "#015887",
  secondaryButtonColor: "#015887",
  secondaryButtonBg: "#f8f8f8",
  accent: "#ff7700",
  ctaFill: "#ff7700",
  ctaText: "#1b0101",
  background: "#ffffff",
  contentBg: "#f7f8fa",
  cardBg: "#ffffff",
  linkColor: "#015887",
  headingFont: "Work Sans",
  bodyFont: "Ubuntu",
  font: "Ubuntu", // legacy field, same as body
};
