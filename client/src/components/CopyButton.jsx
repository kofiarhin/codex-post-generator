import { Check, Copy } from '@phosphor-icons/react';
import { useState } from 'react';

export default function CopyButton({ value, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value || '');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition duration-200 hover:border-zinc-400 hover:bg-zinc-100 active:-translate-y-[1px]"
      aria-label={copied ? `${label} copied` : label}
    >
      {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
}
