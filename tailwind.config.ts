import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        "midnight-charcoal": "#0a0a0a",
        "pitch-black": "#000000",
        "off-black": "#141414",
        "dark-frost": "#1e1e1e",
        "medium-gray": "#313131",
        "light-gray": "#454545",
        "dim-gray": "#7c7c7c",
        "silver-dust": "#a7a7a7",
        "polar-white": "#ffffff",
        "data-blue": "#6798ff",
        surface: {
          DEFAULT: "#0a0a0a",
          raised: "#141414",
          elevated: "#1e1e1e",
          border: "#454545"
        }
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif"
        ],
        mono: [
          "var(--font-jetbrains-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace"
        ]
      },
      fontSize: {
        caption: ["14px", { lineHeight: "1.4", letterSpacing: "0.083px", fontWeight: "400" }],
        body: ["16px", { lineHeight: "1.5", letterSpacing: "-0.012px", fontWeight: "400" }],
        subheading: ["20px", { lineHeight: "1.4", letterSpacing: "-0.021px", fontWeight: "500" }],
        heading: ["24px", { lineHeight: "1.33", letterSpacing: "-0.025px", fontWeight: "500" }],
        "heading-lg": ["40px", { lineHeight: "1.29", letterSpacing: "-0.031px", fontWeight: "500" }],
        display: ["56px", { lineHeight: "1.14", letterSpacing: "-0.036px", fontWeight: "500" }]
      },
      spacing: {
        "8": "8px",
        "16": "16px",
        "24": "24px",
        "32": "32px",
        "40": "40px",
        "64": "64px",
        "96": "96px",
        "200": "200px"
      },
      borderRadius: {
        md: "4px",
        lg: "8px",
        full: "66px"
      }
    }
  },
  plugins: []
};

export default config;
