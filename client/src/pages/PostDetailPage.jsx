import { ArrowLeft, Trash } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deletePost, getAssetUrl, getPost } from '../api/posts.js';
import CopyButton from '../components/CopyButton.jsx';
import TextPanel from '../components/TextPanel.jsx';

export default function PostDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    let isMounted = true;

    getPost(slug)
      .then((data) => {
        if (!isMounted) return;
        setPost(data);
        setStatus('ready');
      })
      .catch((requestError) => {
        if (!isMounted) return;
        setError(requestError.message);
        setStatus('error');
      });

    return () => {
      isMounted = false;
    };
  }, [slug]);

  async function handleDelete() {
    setDeleteError('');

    try {
      await deletePost(slug);
      navigate('/');
    } catch (requestError) {
      setDeleteError(requestError.message);
    }
  }

  if (status === 'loading') {
    return <DetailSkeleton />;
  }

  if (status === 'error') {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
        {error || 'This post package could not be loaded.'}
      </div>
    );
  }

  const thumbnailUrl = getAssetUrl(post);

  return (
    <article className="grid gap-7">
      <nav className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition duration-200 hover:bg-zinc-100 active:-translate-y-[1px]"
        >
          <ArrowLeft size={16} weight="bold" />
          Back
        </Link>
        <button
          type="button"
          onClick={handleDelete}
          className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition duration-200 hover:bg-red-50 active:-translate-y-[1px]"
        >
          <Trash size={16} weight="bold" />
          Delete DB record
        </button>
      </nav>

      {deleteError ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{deleteError}</div> : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
        <div className="grid gap-4">
          <div className="aspect-[1200/628] overflow-hidden rounded-md border border-zinc-200 bg-zinc-100">
            {thumbnailUrl ? (
              <img className="h-full w-full object-cover" src={thumbnailUrl} alt={`${post.title} thumbnail`} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">No thumbnail saved</div>
            )}
          </div>
          <dl className="grid gap-2 rounded-md border border-zinc-200 bg-white p-4">
            <Meta label="Primary keyword" value={post.primaryKeyword || 'Not recorded'} />
            <Meta label="Topic angle" value={post.topicAngle || 'Not recorded'} />
            <Meta label="Provider" value={post.provider || 'Not recorded'} />
            <Meta label="Model" value={post.model || 'Not recorded'} />
            <Meta label="Package directory" value={post.packageDir || 'Not recorded'} />
          </dl>
        </div>

        <div className="grid gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-teal-700">{post.slug}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 md:text-4xl">{post.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={post.linkedinPost} label="Copy LinkedIn" />
            <CopyButton value={post.xPost} label="Copy X" />
            <CopyButton value={post.prompt} label="Copy prompt" />
          </div>
          {post.fallbackUsed ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Thumbnail fallback used: {post.fallbackReason || 'No reason recorded.'}
            </div>
          ) : null}
        </div>
      </section>

      <TextPanel title="LinkedIn post" value={post.linkedinPost} />
      <TextPanel title="X post" value={post.xPost} />
      <TextPanel title="Prompt" value={post.prompt} />
    </article>
  );
}

function Meta({ label, value }) {
  return (
    <div className="grid gap-1 border-t border-zinc-100 pt-3 first:border-t-0 first:pt-0">
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</dt>
      <dd className="break-words text-sm text-zinc-800">{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-7">
      <div className="h-10 w-28 animate-pulse rounded-md bg-zinc-200" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="aspect-[1200/628] animate-pulse rounded-md bg-zinc-200" />
        <div className="grid content-start gap-4">
          <div className="h-5 w-48 animate-pulse rounded bg-zinc-200" />
          <div className="h-12 w-3/4 animate-pulse rounded bg-zinc-200" />
          <div className="h-10 w-64 animate-pulse rounded bg-zinc-200" />
        </div>
      </div>
    </div>
  );
}
