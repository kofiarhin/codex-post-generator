import { MagnifyingGlass } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import PostPreview from '../components/PostPreview.jsx';
import { getPosts } from '../api/posts.js';

export default function PostListPage() {
  const [posts, setPosts] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    getPosts()
      .then((data) => {
        if (!isMounted) return;
        setPosts(data);
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
  }, []);

  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return posts;
    }

    return posts.filter((post) =>
      [post.title, post.primaryKeyword, post.topicAngle]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery))
    );
  }, [posts, query]);

  return (
    <section className="grid gap-6">
      <div className="grid gap-4 rounded-md border border-zinc-200 bg-white p-4 shadow-[0_18px_45px_-34px_rgba(39,39,42,0.5)] md:grid-cols-[1fr_auto] md:items-center">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-700">Search by title, keyword, or topic angle</span>
          <span className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} weight="bold" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-zinc-50 py-3 pl-10 pr-3 text-sm outline-none transition duration-200 focus:border-teal-700 focus:bg-white focus:ring-2 focus:ring-teal-700/15"
              placeholder="Try AI observability or GitHub Actions"
            />
          </span>
        </label>
        <div className="text-left md:text-right">
          <p className="font-mono text-2xl font-semibold text-zinc-950">{filteredPosts.length}</p>
          <p className="text-sm text-zinc-500">visible packages</p>
        </div>
      </div>

      {status === 'loading' ? <LoadingList /> : null}
      {status === 'error' ? <ErrorState message={error} /> : null}
      {status === 'ready' && posts.length === 0 ? <EmptyState /> : null}
      {status === 'ready' && posts.length > 0 && filteredPosts.length === 0 ? (
        <EmptyState title="No matches" message="Adjust the search query to find a saved package." />
      ) : null}
      {status === 'ready' && filteredPosts.length > 0 ? (
        <div className="divide-y-0">
          {filteredPosts.map((post) => (
            <PostPreview key={post.slug} post={post} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LoadingList() {
  return (
    <div className="grid gap-5">
      {[0, 1, 2].map((item) => (
        <div key={item} className="grid gap-4 border-t border-zinc-200 py-5 sm:grid-cols-[180px_1fr] sm:px-3">
          <div className="aspect-[1200/628] animate-pulse rounded-md bg-zinc-200" />
          <div className="grid content-start gap-3">
            <div className="h-5 w-40 animate-pulse rounded bg-zinc-200" />
            <div className="h-7 w-3/4 animate-pulse rounded bg-zinc-200" />
            <div className="h-4 w-full animate-pulse rounded bg-zinc-200" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title = 'No packages yet', message = 'Run a finalization or backfill command to populate MongoDB.' }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-white px-5 py-10 text-center">
      <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">{message}</p>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
      {message || 'The dashboard could not load posts.'}
    </div>
  );
}
