import { CategoryWorkspace } from "@/components/CategoryWorkspace";
import { getCategoryTasks } from "@/lib/getCategoryTasks";

export const dynamic = "force-dynamic";

export default async function OrgsPage() {
  return <CategoryWorkspace category="orgs" initialTasks={await getCategoryTasks("orgs")} />;
}
