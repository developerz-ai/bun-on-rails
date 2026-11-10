/**
 * Database Seeds
 */

import User from '../app/models/user.js'
import Post from '../app/models/post.js'
import Comment from '../app/models/comment.js'

export default async function seed() {
  console.log('Seeding database...')

  // Create admin user
  await User.create({
    email: 'admin@example.com',
    name: 'Admin User',
    password_digest: 'not-a-real-digest', // authentication is planned
    role: 'admin'
  })
  console.log('  Created admin user')

  // Create regular users
  const users = []
  for (let i = 1; i <= 5; i++) {
    const user = await User.create({
      email: `user${i}@example.com`,
      name: `Test User ${i}`,
      password_digest: 'not-a-real-digest'
    })
    users.push(user)
  }
  console.log(`  Created ${users.length} users`)

  // Create posts
  const posts = []
  const postTitles = [
    'Getting Started with BunOnRails',
    'Building Real-Time Features',
    'Database Best Practices',
    'Authentication Deep Dive',
    'Deploying to Production'
  ]

  for (let i = 0; i < postTitles.length; i++) {
    const post = await Post.create({
      title: postTitles[i],
      body: `This is the content for "${postTitles[i]}". Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
      user_id: users[i % users.length].id,
      published: i < 3
    })
    posts.push(post)
  }
  console.log(`  Created ${posts.length} posts`)

  // Create comments
  let commentCount = 0
  for (const post of posts.slice(0, 3)) {
    for (let i = 0; i < 3; i++) {
      await Comment.create({
        body: `This is comment ${i + 1} on "${post.get('title')}". Great article!`,
        post_id: post.id,
        user_id: users[i % users.length].id
      })
      commentCount++
    }
  }
  console.log(`  Created ${commentCount} comments`)

  console.log('Seeding complete!')
}
