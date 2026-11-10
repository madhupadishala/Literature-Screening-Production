/**
 * Design System Tokens - Single source of truth for all design values
 *
 * Usage:
 *   import { tokens } from "@/lib/design/tokens";
 *
 *   const primaryColor = tokens.colors.primary[500];
 *   const spacing = tokens.spacing[4];
 */

export const tokens = {
  // Color palette - using semantic naming for light/dark mode support
  colors: {
    // Primary brand colors
    primary: {
      50: "#eff6ff",
      100: "#dbeafe",
      200: "#bfdbfe",
      300: "#93c5fd",
      400: "#60a5fa",
      500: "#3b82f6",
      600: "#2563eb",
      700: "#1d4ed8",
      800: "#1e40af",
      900: "#1e3a8a",
      950: "#172554",
    },

    // Neutral grays
    neutral: {
      50: "#fafafa",
      100: "#f5f5f5",
      200: "#e5e5e5",
      300: "#d4d4d4",
      400: "#a3a3a3",
      500: "#737373",
      600: "#525252",
      700: "#404040",
      800: "#262626",
      900: "#171717",
      950: "#0a0a0a",
    },

    // Semantic colors - these adapt to light/dark mode
    semantic: {
      success: {
        light: "#16a34a",
        dark: "#22c55e",
        bg: "#f0fdf4",
        bgDark: "#052e16",
      },
      warning: {
        light: "#f59e0b",
        dark: "#fbbf24",
        bg: "#fffbeb",
        bgDark: "#3f2500",
      },
      error: {
        light: "#dc2626",
        dark: "#ef4444",
        bg: "#fef2f2",
        bgDark: "#450a0a",
      },
      info: {
        light: "#2563eb",
        dark: "#3b82f6",
        bg: "#eff6ff",
        bgDark: "#1e3a8a",
      },
    },

    // Background colors
    background: {
      primary: "#ffffff",
      secondary: "#fafafa",
      tertiary: "#f5f5f5",
      inverse: "#171717",
    },

    // Border colors
    border: {
      light: "#e5e5e5",
      medium: "#d4d4d4",
      dark: "#a3a3a3",
      focus: "#3b82f6",
    },

    // Text colors
    text: {
      primary: "#171717",
      secondary: "#525252",
      tertiary: "#737373",
      inverse: "#fafafa",
      link: "#2563eb",
      linkHover: "#1d4ed8",
    },
  },

  // Spacing scale (base unit: 4px)
  spacing: {
    0: "0",
    1: "0.25rem",  // 4px
    2: "0.5rem",   // 8px
    3: "0.75rem",  // 12px
    4: "1rem",     // 16px
    5: "1.25rem",  // 20px
    6: "1.5rem",   // 24px
    7: "1.75rem",  // 28px
    8: "2rem",     // 32px
    9: "2.25rem",  // 36px
    10: "2.5rem",  // 40px
    11: "2.75rem", // 44px
    12: "3rem",    // 48px
    14: "3.5rem",  // 56px
    16: "4rem",    // 64px
    20: "5rem",    // 80px
    24: "6rem",    // 96px
    28: "7rem",    // 112px
    32: "8rem",    // 128px
  },

  // Typography
  typography: {
    fontFamilies: {
      sans: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
      mono: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
      heading: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
    },

    fontSizes: {
      xs: "0.75rem",    // 12px
      sm: "0.875rem",   // 14px
      base: "1rem",     // 16px
      lg: "1.125rem",   // 18px
      xl: "1.25rem",    // 20px
      "2xl": "1.5rem",  // 24px
      "3xl": "1.875rem", // 30px
      "4xl": "2.25rem", // 36px
      "5xl": "3rem",    // 48px
    },

    fontWeights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },

    lineHeights: {
      none: 1,
      tight: 1.25,
      snug: 1.375,
      normal: 1.5,
      relaxed: 1.625,
      loose: 2,
    },

    letterSpacing: {
      tighter: "-0.05em",
      tight: "-0.025em",
      normal: "0",
      wide: "0.025em",
      wider: "0.05em",
      widest: "0.1em",
    },
  },

  // Border radius
  radii: {
    none: "0",
    sm: "0.25rem",   // 4px
    md: "0.375rem",  // 6px
    lg: "0.5rem",    // 8px
    xl: "0.75rem",   // 12px
    "2xl": "1rem",   // 16px
    full: "9999px",
  },

  // Shadows
  shadows: {
    none: "none",
    xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    sm: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
    "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
    focus: "0 0 0 3px rgb(59 130 246 / 0.4)",
  },

  // Transitions
  transitions: {
    fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
    normal: "200ms cubic-bezier(0.4, 0, 0.2, 1)",
    slow: "300ms cubic-bezier(0.4, 0, 0.2, 1)",
    default: "200ms cubic-bezier(0.4, 0, 0.2, 1)",
  },

  // Z-index scale
  zIndex: {
    hide: -1,
    auto: "auto",
    base: 0,
    dropdown: 1000,
    sticky: 1100,
    modal: 1200,
    popover: 1300,
    tooltip: 1400,
    toast: 1500,
  },

  // Breakpoints
  breakpoints: {
    xs: "320px",
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
    "2xl": "1536px",
  },

  // Container max widths
  containers: {
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
    "2xl": "1536px",
    full: "100%",
  },

  // Component-specific tokens
  components: {
    button: {
      height: {
        sm: "2rem",     // 32px
        md: "2.5rem",   // 40px
        lg: "3rem",     // 48px
      },
      padding: {
        sm: "0.5rem 0.75rem",
        md: "0.625rem 1rem",
        lg: "0.75rem 1.5rem",
      },
      fontSize: {
        sm: "0.875rem",
        md: "1rem",
        lg: "1.125rem",
      },
    },

    input: {
      height: {
        sm: "2rem",
        md: "2.5rem",
        lg: "3rem",
      },
      padding: {
        sm: "0.5rem 0.75rem",
        md: "0.625rem 1rem",
        lg: "0.75rem 1rem",
      },
    },

    card: {
      padding: {
        sm: "1rem",
        md: "1.5rem",
        lg: "2rem",
      },
    },

    modal: {
      maxWidth: {
        sm: "20rem",    // 320px
        md: "28rem",    // 448px
        lg: "32rem",    // 512px
        xl: "48rem",    // 768px
        full: "calc(100% - 2rem)",
      },
    },
  },
} as const;

// Type exports for TypeScript
export type Tokens = typeof tokens;
export type ColorScale = typeof tokens.colors.primary;
export type SpacingScale = typeof tokens.spacing;
export type FontSizeScale = typeof tokens.typography.fontSizes;
export type RadiusScale = typeof tokens.radii;
export type ShadowScale = typeof tokens.shadows;
export type BreakpointScale = typeof tokens.breakpoints;

// Helper functions
export function getColor(color: keyof typeof tokens.colors, shade: keyof typeof tokens.colors.primary): string {
  const colorObj = tokens.colors[color];
  if (colorObj && typeof colorObj === "object" && shade in colorObj) {
    return colorObj[shade as keyof typeof colorObj];
  }
  return tokens.colors.primary[500];
}

export function getSpacing(value: keyof typeof tokens.spacing): string {
  return tokens.spacing[value];
}

export function getFontSize(value: keyof typeof tokens.typography.fontSizes): string {
  return tokens.typography.fontSizes[value];
}

export function getRadius(value: keyof typeof tokens.radii): string {
  return tokens.radii[value];
}

export function getShadow(value: keyof typeof tokens.shadows): string {
  return tokens.shadows[value];
}

export function getBreakpoint(value: keyof typeof tokens.breakpoints): string {
  return tokens.breakpoints[value];
}

// CSS Custom Properties generator (for use in CSS/SCSS)
export function generateCSSVariables(): string {
  const lines: string[] = [":root {"];

  // Colors
  Object.entries(tokens.colors.primary).forEach(([key, value]) => {
    lines.push(`  --color-primary-${key}: ${value};`);
  });
  Object.entries(tokens.colors.neutral).forEach(([key, value]) => {
    lines.push(`  --color-neutral-${key}: ${value};`);
  });

  // Spacing
  Object.entries(tokens.spacing).forEach(([key, value]) => {
    lines.push(`  --spacing-${key}: ${value};`);
  });

  // Typography
  Object.entries(tokens.typography.fontSizes).forEach(([key, value]) => {
    lines.push(`  --font-size-${key}: ${value};`);
  });

  // Radii
  Object.entries(tokens.radii).forEach(([key, value]) => {
    lines.push(`  --radius-${key}: ${value};`);
  });

  // Shadows
  Object.entries(tokens.shadows).forEach(([key, value]) => {
    lines.push(`  --shadow-${key}: ${value};`);
  });

  // Breakpoints
  Object.entries(tokens.breakpoints).forEach(([key, value]) => {
    lines.push(`  --breakpoint-${key}: ${value};`);
  });

  // Z-index
  Object.entries(tokens.zIndex).forEach(([key, value]) => {
    lines.push(`  --z-index-${key}: ${value};`);
  });

  lines.push("}");
  return lines.join("\n");
}