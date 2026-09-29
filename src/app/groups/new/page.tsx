import { CreateGroupForm } from "@/components/create-group-form";

export const metadata = { title: "New group · Receipt Split" };

export default function NewGroupPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Create a group</h1>
      <CreateGroupForm />
    </main>
  );
}
