import type { Metadata } from "next";
import { UploadForm } from "@/components/upload-form";

export const metadata: Metadata = { title: "Scan a receipt · Receipt Split" };

export default function UploadPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Scan a receipt</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Take a photo or choose an image. We&apos;ll read the line items, tax and tip for you to review.
        </p>
      </header>
      <UploadForm />
    </main>
  );
}
