import type { TaskCategory } from "@/types/task";

export const CATEGORY_STYLES = {
  classes: {
    hex: "#059669",
    chip: "bg-emerald-600 text-white",
    dot: "bg-emerald-600",
    soft: "bg-emerald-50 text-emerald-900",
    border: "border-emerald-600",
    label: "Classes",
  },
  orgs: {
    hex: "#d97706",
    chip: "bg-amber-600 text-white",
    dot: "bg-amber-600",
    soft: "bg-amber-50 text-amber-900",
    border: "border-amber-600",
    label: "Orgs & Internships",
  },
  social: {
    hex: "#4f46e5",
    chip: "bg-indigo-600 text-white",
    dot: "bg-indigo-600",
    soft: "bg-indigo-50 text-indigo-900",
    border: "border-indigo-600",
    label: "Social",
  },
} as const;

export const CATEGORY_ORDER: readonly TaskCategory[] = ["classes", "orgs", "social"];
