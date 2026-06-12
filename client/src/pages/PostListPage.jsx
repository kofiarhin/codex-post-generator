import { CaretLeft, CaretRight, MagnifyingGlass } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import PostPreview from '../components/PostPreview.jsx';
import { getPosts } from '../api/posts.js';

const PAGE_LIMIT = 12;

export default function PostListPage() {
  const [posts, setPosts] = useState([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_LIMIT,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let isMounted = true;

    setStatus('loading');
    setError('');

    getPosts({ page, limit: PAGE_LIMIT, q: debouncedQuery })
      .then((data) => {
        if (!isMounted) return;
        setPosts(data.posts);
        setPagination(data.pagination);
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
  }, [debouncedQuery, page]);

  function handleQueryChange(event) {
    setQuery(event.target.value);
    setPage(1);
  }

  const isLoading = status === 'loading';

  return (
    <section className="grid gap-6">
      <div className="grid gap-4 rounded-md border border-zinc-200 bg-white p-4 shadow-[0_18px_45px_-34px_rgba(39,39,42,0.5)] md:grid-cols-[1fr_auto] md:items-center">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-700">Search posts</span>
          <span className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} weight="bold" />
            <input
              value={query}
              onChange={handleQueryChange}
              className="w-full rounded-md border border-zinc-300 bg-zinc-50 py-3 pl-10 pr-3 text-sm outline-none transition duration-200 focus:border-teal-700 focus:bg-white focus:ring-2 focus:ring-teal-700/15"
              placeholder="Search title, slug, keyword, angle, or post copy"
            />
          </span>
        </label>
        <div className="text-left md:text-right">
          <p className="font-mono text-2xl font-semibold text-zinc-950">{pagination.total}</p>
          <p className="text-sm text-zinc-500">matching packages</p>
        </div>
      </div>

      {isLoading ? <LoadingList /> : null}
      {status === 'error' ? <ErrorState message={error} /> : null}
      {status === 'ready' && posts.length === 0 ? <EmptyState /> : null}
      {status === 'ready' && posts.length > 0 ? (
        <div className="divide-y-0">
          {posts.map((post) => (
            <PostPreview key={post.slug} post={post} />
          ))}
        </div>
      ) : null}
      {status === 'ready' ? <PaginationControls pagination={pagination} onPageChange={setPage} /> : null}
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

function EmptyState({ title = 'No packages found', message = 'Adjust the search query or run a finalization/backfill command to populate MongoDB.' }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-white px-5 py-10 text-center">
      <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">{message}</p>
    </div>
  );
}

function PaginationControls({ pagination, onPageChange }) {
  const totalPages = Math.max(pagination.totalPages, 0);

  return (
    <nav className="flex flex-col gap-3 border-t border-zinc-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-zinc-600">
        Page <span className="font-mono font-semibold text-zinc-950">{pagination.page}</span> of{' '}
        <span className="font-mono font-semibold text-zinc-950">{totalPages}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onPageChange((currentPage) => Math.max(1, currentPage - 1))}
          disabled={!pagination.hasPrevPage}
          className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition duration-200 hover:bg-zinc-100 active:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:active:translate-y-0"
        >
          <CaretLeft size={16} weight="bold" />
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange((currentPage) => currentPage + 1)}
          disabled={!pagination.hasNextPage}
          className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition duration-200 hover:bg-zinc-100 active:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:active:translate-y-0"
        >
          Next
          <CaretRight size={16} weight="bold" />
        </button>
      </div>
    </nav>
  );
}

function ErrorState({ message }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
      {message || 'The dashboard could not load posts.'}
    </div>
  );
}
