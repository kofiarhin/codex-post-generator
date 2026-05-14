import { ArrowRight } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { getAssetUrl } from '../api/posts.js';

export default function PostPreview({ post }) {
  const thumbnailUrl = getAssetUrl(post);

  return (
    <article className="grid gap-4 border-t border-zinc-200 py-5 transition duration-200 hover:bg-white/70 sm:grid-cols-[180px_1fr] sm:px-3">
      <Link
        to={`/posts/${post.slug}`}
        className="block aspect-[1200/628] overflow-hidden rounded-md border border-zinc-200 bg-zinc-100"
      >
        {thumbnailUrl ? (
          <img className="h-full w-full object-cover" src={thumbnailUrl} alt={`${post.title} thumbnail`} loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
            No thumbnail
          </div>
        )}
      </Link>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {post.primaryKeyword ? (
            <span className="rounded-md bg-teal-50 px-2.5 py-1 font-medium text-teal-800">{post.primaryKeyword}</span>
          ) : null}
          {post.topicAngle ? <span className="text-zinc-500">{post.topicAngle}</span> : null}
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <Link to={`/posts/${post.slug}`} className="text-xl font-semibold tracking-tight text-zinc-950 hover:text-teal-800">
              {post.title}
            </Link>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">{post.linkedinPost}</p>
          </div>
          <Link
            to={`/posts/${post.slug}`}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition duration-200 hover:bg-zinc-100 active:-translate-y-[1px]"
          >
            View
            <ArrowRight size={16} weight="bold" />
          </Link>
        </div>
      </div>
    </article>
  );
}
