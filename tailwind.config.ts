import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

/** A colour scale whose values come from CSS variables in globals.css. */
function scale(name: string, steps: number[]): Record<number, string> {
  return Object.fromEntries(
    steps.map((step) => [step, `rgb(var(--${name}-${step}) / <alpha-value>)`])
  );
}

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Use `brand` for anything that is the app's own colour, `gray` for
        // neutrals and `surface` for card and panel backgrounds. Avoid
        // `bg-white` and raw `blue-*` or `indigo-*`: they ignore the theme.
        brand: scale("brand", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        gray: scale("gray", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        surface: "rgb(var(--surface) / <alpha-value>)",
        page: "rgb(var(--page) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [typography],
};
export default config;
