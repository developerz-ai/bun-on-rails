/**
 * Post Model
 *
 * == Schema Information
 *
 * Table name: posts
 *
 *  id           :bigint           not null, primary key
 *  title        :string           not null
 *  body         :text             not null
 *  slug         :string           not null
 *  published    :boolean          default(false)
 *  published_at :datetime
 *  user_id      :bigint           not null
 *  created_at   :datetime         not null
 *  updated_at   :datetime         not null
 *
 * Indexes:
 *  index_posts_on_slug     (slug) UNIQUE
 *  index_posts_on_user_id  (user_id)
 *
 * Foreign Keys:
 *  fk_posts_user_id  (user_id => users.id) ON DELETE CASCADE
 */

import { Model } from '@bun-on-rails/framework'

export default class Post extends Model {
  static associations = {
    belongsTo: ['user'],
    hasMany: ['comments']
  }

  static validations = {
    title: {
      presence: true,
      length: { min: 3, max: 200 }
    },
    body: {
      presence: true
    },
    slug: {
      presence: true,
      uniqueness: true,
      format: { with: /^[a-z0-9-]+$/ }
    }
  }

  static scopes = {
    published: (query) => query.where({ published: true }),
    draft: (query) => query.where({ published: false }),
    recent: (query) => query.order({ createdAt: 'desc' })
  }

  // Callbacks
  async beforeValidate() {
    if (!this.slug && this.title) {
      this.slug = this.generateSlug()
    }
  }

  async afterSave() {
    // Invalidate cache
    // await cache.delete(`post:${this.id}`)
  }

  // Instance methods
  generateSlug() {
    return this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  async publish() {
    this.published = true
    this.publishedAt = new Date()
    return await this.save()
  }

  async unpublish() {
    this.published = false
    this.publishedAt = null
    return await this.save()
  }
}
