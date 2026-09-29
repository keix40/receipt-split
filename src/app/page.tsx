import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Receipt Split</h1>
      <p className="text-lg text-stone-600 dark:text-stone-400">
        Snap the restaurant receipt, let everyone tap what they had, and get a fair split
        with tax and tip shared proportionally, down to the cent.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/upload"
          className="w-fit rounded-lg bg-stone-900 px-5 py-3 font-medium text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900"
        >
          Scan a receipt
        </Link>
        <Link
          href="/groups"
          className="w-fit rounded-lg border border-stone-300 px-5 py-3 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-900"
        >
          Your groups
        </Link>
      </div>
    </main>
  );
}
