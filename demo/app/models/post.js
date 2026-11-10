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

import { Model } from '../../../src/index.js'

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
    recent: (query) => query.order({ created_at: 'desc' })
  }

  // Callbacks
  async beforeValidation() {
    if (!this.get('slug') && this.get('title')) {
      this.set('slug', this.generateSlug())
    }
  }

  // Instance methods
  generateSlug() {
    return this.get('title')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  async publish() {
    this.set('published', true)
    this.set('published_at', new Date())
    return await this.save()
  }

  async unpublish() {
    this.set('published', false)
    this.set('published_at', null)
    return await this.save()
  }
}

Post.register()
