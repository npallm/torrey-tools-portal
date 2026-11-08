import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6f5",
          100: "#d7eae8",
          500: "#1f7a6d",
          600: "#196558",
          700: "#145045",
          900: "#0c2f29",
        },
      },
    },
  },
  plugins: [],
};

export default config;
