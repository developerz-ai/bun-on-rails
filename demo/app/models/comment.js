/**
 * Comment Model
 *
 * == Schema Information
 *
 * Table name: comments
 *
 *  id         :bigint           not null, primary key
 *  body       :text             not null
 *  post_id    :bigint           not null
 *  user_id    :bigint           not null
 *  created_at :datetime         not null
 *  updated_at :datetime         not null
 *
 * Indexes:
 *  index_comments_on_post_id  (post_id)
 *  index_comments_on_user_id  (user_id)
 *
 * Foreign Keys:
 *  fk_comments_post_id  (post_id => posts.id) ON DELETE CASCADE
 *  fk_comments_user_id  (user_id => users.id) ON DELETE CASCADE
 */

import { Model } from '@bun-on-rails/framework'

export default class Comment extends Model {
  static associations = {
    belongsTo: ['post', 'user']
  }

  static validations = {
    body: {
      presence: true,
      length: { min: 1, max: 5000 }
    }
  }

  static scopes = {
    recent: (query) => query.order({ createdAt: 'desc' })
  }
}
