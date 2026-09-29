import Link from "next/link";
import { getKnownGroupIds } from "@/lib/guest/cookies";
import { listGroupsByIds } from "@/lib/groups/service";

export const metadata = { title: "Your groups · Receipt Split" };

export default async function GroupsPage() {
  const ids = await getKnownGroupIds();
  const groups = await listGroupsByIds(ids);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Your groups</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Groups you&apos;ve created or joined on this device (no account needed).
        </p>
      </header>
      <Link
        href="/groups/new"
        className="w-fit rounded-lg bg-stone-900 px-5 py-3 font-medium text-white dark:bg-white dark:text-stone-900"
      >
        Create a group
      </Link>
      <ul className="divide-y rounded-xl border dark:divide-stone-800 dark:border-stone-700">
        {groups.length === 0 && (
          <li className="px-4 py-6 text-sm text-stone-500">No groups yet — scan a receipt or create one.</li>
        )}
        {groups.map((g) => (
          <li key={g.id}>
            <Link href={`/groups/${g.id}`} className="block px-4 py-4 hover:bg-stone-50 dark:hover:bg-stone-900">
              <span className="font-medium">{g.name}</span>
              <span className="ml-2 text-sm text-stone-500">{g.currency}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/" className="text-sm text-stone-500 underline">
        Home
      </Link>
    </main>
  );
}
