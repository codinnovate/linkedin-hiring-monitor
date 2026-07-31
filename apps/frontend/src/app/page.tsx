export default function HomePage(): React.ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">LinkedIn Hiring Monitor</h1>
        <p className="max-w-md text-sm text-slate-400">
          Monitors LinkedIn posts for hiring announcements, classifies them with AI, and notifies
          you in real time. The dashboard ships in a later phase.
        </p>
      </div>
      <div className="flex gap-3 text-xs text-slate-500">
        <span className="rounded-full border border-slate-800 px-3 py-1">Backend :3001</span>
        <span className="rounded-full border border-slate-800 px-3 py-1">Worker :bullmq</span>
        <span className="rounded-full border border-slate-800 px-3 py-1">Frontend :3000</span>
      </div>
    </main>
  );
}
