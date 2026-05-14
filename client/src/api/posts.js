const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function request(path, options) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(options?.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function getPosts() {
  const data = await request('/api/posts');
  return data.posts || [];
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

  return `${API_BASE_URL}/post-assets/${encodeURIComponent(post.slug)}/${encodeURIComponent(post.thumbnailFileName)}`;
}
