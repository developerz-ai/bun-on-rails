/**
 * User Model
 *
 * == Schema Information
 *
 * Table name: users
 *
 *  id              :bigint           not null, primary key
 *  email           :string           not null
 *  name            :string
 *  password_digest :string           not null
 *  role            :string           default("user")
 *  created_at      :datetime         not null
 *  updated_at      :datetime         not null
 *
 * Indexes:
 *  index_users_on_email  (email) UNIQUE
 */

import { Model } from '../../../src/index.js'

export default class User extends Model {
  static associations = {
    hasMany: ['posts', 'comments']
  }

  static validations = {
    email: {
      presence: true,
      uniqueness: true,
      email: true
    },
    name: {
      length: { min: 2, max: 100 }
    }
  }

  static scopes = {
    admins: (query) => query.where({ role: 'admin' })
  }

  // Instance methods
  get isAdmin() {
    return this.get('role') === 'admin'
  }
}

User.register()
