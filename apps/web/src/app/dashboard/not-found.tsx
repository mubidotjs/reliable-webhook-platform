import Link from "next/link";
export default function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Record not found</h1>
      <p className="text-slate-400">
        This record is not available in your workspace.
      </p>
      <Link href="/dashboard" className="text-cyan-300">
        Back to overview
      </Link>
    </div>
  );
}
