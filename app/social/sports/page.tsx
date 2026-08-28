import { SportsSchedule } from "@/components/SportsSchedule";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTexasHomeSchedules } from "@/lib/texasSports";

export const dynamic = "force-dynamic";

export default async function SportingEventsPage() {
  const [teams, taskResult] = await Promise.all([
    getTexasHomeSchedules(),
    supabaseAdmin.from("tasks").select("canvas_uid").like("canvas_uid", "texas-sports:%"),
  ]);
  const initiallyAdded = taskResult.error
    ? []
    : (taskResult.data ?? []).flatMap((task) => task.canvas_uid ? [task.canvas_uid] : []);
  return <SportsSchedule teams={teams} initiallyAdded={initiallyAdded} />;
}
