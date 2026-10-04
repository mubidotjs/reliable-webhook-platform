import Link from "next/link";
export default function NotFound() {
  return (
    <div className="max-w-2xl space-y-4 rounded-lg border border-line bg-surface p-6">
      <h1 className="text-xl font-semibold">Record not found</h1>
      <p className="text-slate-400">
        This record is not available in your workspace.
      </p>
      <Link href="/dashboard" className="text-cyan-300">
        Back to overview
      </Link>
    </div>
  );
}
