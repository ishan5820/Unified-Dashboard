import { CategoryWorkspace } from "@/components/CategoryWorkspace";
import { getCategoryTasks } from "@/lib/getCategoryTasks";

export const dynamic = "force-dynamic";

export default async function SocialPage() {
  return <CategoryWorkspace category="social" initialTasks={await getCategoryTasks("social")} />;
}
