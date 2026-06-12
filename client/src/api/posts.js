import { buildApiUrl, request } from '../lib/api.js';

export async function getPosts({ page = 1, limit = 12, q = '' } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit)
  });
  const query = String(q || '').trim();

  if (query) {
    params.set('q', query);
  }

  const data = await request(`/api/posts?${params.toString()}`);

  return {
    posts: data.posts || [],
    pagination: data.pagination || {
      page,
      limit,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false
    }
  };
}

export async function getPost(slug) {
  const data = await request(`/api/posts/${encodeURIComponent(slug)}`);
  return data.post;
}

export async function deletePost(slug) {
  return request(`/api/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' });
}

export function getAssetUrl(post) {
  if (!post?.thumbnailFileName || !post?.slug) {
    return '';
  }

  return buildApiUrl(`/post-assets/${encodeURIComponent(post.slug)}/${encodeURIComponent(post.thumbnailFileName)}`);
}
