export type TaskCategory = "classes" | "orgs" | "social";
export type TaskSource = "manual" | "ical";
export type TaskKind = "task" | "event";
export type Weekday = "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";

export interface Subtask {
  id: string;
  title: string;
  is_completed: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  canvas_uid: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  location: string | null;
  category: TaskCategory;
  course_code: string | null;
  is_pinned: boolean;
  is_completed: boolean;
  source: TaskSource;
  kind: TaskKind;
  end_time: string | null;
  series_id: string | null;
  recurrence_rule: string | null;
  series_until: string | null;
  import_batch_id: string | null;
  subtasks: Subtask[];
  created_at: string;
  updated_at: string;
}

export type NewTask = Omit<Task, "id" | "created_at" | "updated_at" | "subtasks" | "location"> & {
  subtasks?: Subtask[];
  location?: string | null;
};
export type TaskUpdate = Partial<Omit<Task, "id" | "created_at">>;

export interface RecurrenceSpec {
  title: string;
  description?: string | null;
  location?: string | null;
  category: TaskCategory;
  courseCode: string | null;
  kind: TaskKind;
  byDay: Weekday[];
  startDate: string;
  untilDate: string;
  startTime: string | null;
  endTime: string | null;
  skipDates?: string[];
}

type TasksTable = {
  Row: Task & Record<string, unknown>;
  Insert: Omit<NewTask, "canvas_uid" | "description" | "due_date" | "due_time" | "location" | "course_code" | "end_time" | "series_id" | "recurrence_rule" | "series_until" | "import_batch_id" | "subtasks"> &
    Partial<Pick<NewTask, "canvas_uid" | "description" | "due_date" | "due_time" | "location" | "course_code" | "end_time" | "series_id" | "recurrence_rule" | "series_until" | "import_batch_id" | "subtasks">> & Record<string, unknown>;
  Update: TaskUpdate & Record<string, unknown>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: { tasks: TasksTable };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export function isTaskCategory(value: unknown): value is TaskCategory {
  return value === "classes" || value === "orgs" || value === "social";
}

export function isTaskKind(value: unknown): value is TaskKind {
  return value === "task" || value === "event";
}

export function isTaskSource(value: unknown): value is TaskSource {
  return value === "manual" || value === "ical";
}

export function isWeekday(value: unknown): value is Weekday {
  return ["MO", "TU", "WE", "TH", "FR", "SA", "SU"].includes(String(value));
}
