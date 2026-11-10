/**
 * UI Components - Design System Primitives
 *
 * Single entry point for all reusable UI components.
 * Built on top of design tokens from @/lib/design/tokens.
 *
 * Usage:
 *   import { Button, Input, Card, Select, Badge } from "@/components/ui";
 */

// Design tokens
export { tokens, type Tokens } from "@/lib/design/tokens";

// Import components locally for use in registry
import { Button, type ButtonProps } from "./Button";
import { Input, type InputProps } from "./Input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./Card";
import { Select, type SelectProps, type SelectOption } from "./Select";
import { Badge, StatusBadge, type BadgeProps } from "./Badge";

// Re-export components and types
export { Button, type ButtonProps } from "./Button";
export { Input, type InputProps } from "./Input";
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./Card";
export { Select, type SelectProps, type SelectOption } from "./Select";
export { Badge, StatusBadge, type BadgeProps } from "./Badge";

// Component registry for easy discovery
export const UIComponents = {
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Select,
  Badge,
  StatusBadge,
} as const;

// Type for component names
export type UIComponentName = keyof typeof UIComponents;

// Version
export const DESIGN_SYSTEM_VERSION = "1.0.0";