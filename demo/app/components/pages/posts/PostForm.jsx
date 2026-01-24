/**
 * Post Form Component
 */

import { useAction, Form, Field, Submit } from '@bun-on-rails/framework'

export default function PostForm({ post = null }) {
  const isEditing = !!post?.id
  const action = isEditing ? `posts.update` : 'posts.create'

  const { submit, submitting, error } = useAction(action)

  const handleSubmit = async (data) => {
    const result = await submit({ post: data })

    if (result.success) {
      window.location.href = `/posts/${result.post.slug}`
    }
  }

  return (
    <div className="post-form">
      <h1>{isEditing ? 'Edit Post' : 'New Post'}</h1>

      {error && (
        <div className="error-message">
          {error.message}
        </div>
      )}

      <Form
        resource="posts"
        initialValues={post || {}}
        onSubmit={handleSubmit}
      >
        <Field
          name="title"
          label="Title"
          placeholder="Enter post title"
          required
        />

        <Field
          name="body"
          type="textarea"
          label="Content"
          placeholder="Write your post content..."
          rows={10}
          required
        />

        <Field
          name="published"
          type="checkbox"
          label="Publish immediately"
        />

        <div className="form-actions">
          <Submit disabled={submitting}>
            {submitting ? 'Saving...' : (isEditing ? 'Update Post' : 'Create Post')}
          </Submit>

          <a href="/posts" className="cancel-link">
            Cancel
          </a>
        </div>
      </Form>
    </div>
  )
}
