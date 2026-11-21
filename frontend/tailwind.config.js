/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        asphalt:     "#181b20",
        "asphalt-2": "#2a2f38",
        ink:         "#181b20",
        line:       "#f2c230",
        "line-deep": "#c89a00",
        road:       "#f5f5f4",
        paper:      "#ffffff",
        concrete:   "#f0efed",
        edge:       "#e2e0dc",
        kerb:       "#6b6760",
        low:        "#2a8a68",
        medium:     "#e07b1a",
        high:       "#c7372f",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "sans-serif"],
        sans:    ['"Instrument Sans"', "sans-serif"],
      },
      gridTemplateColumns: {
        "auth": "1fr 1.1fr",
        "ranked": "1.4fr 1fr",
      },
    },
  },
  plugins: [],
};
