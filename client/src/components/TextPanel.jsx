import CopyButton from './CopyButton.jsx';

export default function TextPanel({ title, value }) {
  return (
    <section className="border-t border-zinc-200 pt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-500">{title}</h2>
        <CopyButton value={value} label={`Copy ${title}`} />
      </div>
      <pre className="whitespace-pre-wrap rounded-md border border-zinc-200 bg-white p-4 font-sans text-sm leading-6 text-zinc-800 shadow-[0_16px_40px_-28px_rgba(39,39,42,0.45)]">
        {value}
      </pre>
    </section>
  );
}
