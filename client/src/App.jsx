import { Outlet } from 'react-router-dom';

export default function App() {
  return (
    <main className="min-h-[100dvh] bg-zinc-50 text-zinc-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <header className="grid gap-5 border-b border-zinc-200 pb-6 md:grid-cols-[1.2fr_0.8fr] md:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-teal-700">Post Generator</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
              Generated package dashboard
            </h1>
          </div>
          <p className="max-w-xl text-sm leading-6 text-zinc-600 md:justify-self-end">
            Review finalized LinkedIn, X, article, prompt, and thumbnail assets persisted from the file workflow.
          </p>
        </header>
        <Outlet />
      </div>
    </main>
  );
}
