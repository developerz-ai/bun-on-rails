/**
 * Posts List Page Component
 */

import { useResource, useChannel } from '../../../../../src/index.js'

export default function PostsList() {
  const { data: posts, loading, error, mutate } = useResource('posts')

  // Subscribe to real-time updates
  useChannel('posts:new', ({ post }) => {
    mutate(prev => [post, ...prev])
  })

  if (loading) {
    return <div className="loading">Loading posts...</div>
  }

  if (error) {
    return <div className="error">Error loading posts: {error.message}</div>
  }

  if (!posts || posts.length === 0) {
    return (
      <div className="empty-state">
        <h2>No posts yet</h2>
        <p>Be the first to create a post!</p>
      </div>
    )
  }

  return (
    <div className="posts-list">
      <h1>Posts</h1>

      <div className="posts">
        {posts.map(post => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  )
}

function PostCard({ post }) {
  return (
    <article className="post-card">
      <h2>
        <a href={`/posts/${post.slug}`}>{post.title}</a>
      </h2>

      <div className="post-meta">
        <span className="author">by {post.user?.name || 'Unknown'}</span>
        <span className="date">
          {new Date(post.createdAt).toLocaleDateString()}
        </span>
      </div>

      <p className="excerpt">
        {post.body.substring(0, 200)}
        {post.body.length > 200 && '...'}
      </p>

      <a href={`/posts/${post.slug}`} className="read-more">
        Read more →
      </a>
    </article>
  )
}
