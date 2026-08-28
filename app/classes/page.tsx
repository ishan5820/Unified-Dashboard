import { CategoryWorkspace } from "@/components/CategoryWorkspace";
import { getCategoryTasks } from "@/lib/getCategoryTasks";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  return <CategoryWorkspace category="classes" initialTasks={await getCategoryTasks("classes")} />;
}
