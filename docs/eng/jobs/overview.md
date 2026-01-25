# Background Jobs

BunOnRails includes a powerful background job system built on BullMQ. Process tasks asynchronously without blocking your web requests.

## Why Background Jobs?

Move slow or resource-intensive tasks out of the request/response cycle:

- Sending emails
- Processing images
- Generating reports
- API calls to external services
- Data imports/exports
- Scheduled maintenance tasks

## Quick Start

### Generate a Job

```bash
brails g job SendWelcomeEmail
```

### Define the Job

```javascript
// app/jobs/send_welcome_email_job.js
import { Job } from '@bun-on-rails'
import UserMailer from '../mailers/user_mailer.js'

export default class SendWelcomeEmailJob extends Job {
  static queue = 'emails'
  static attempts = 3

  async perform({ userId }) {
    const user = await User.find(userId)
    await UserMailer.welcome(user).deliver()
  }
}
```

### Enqueue the Job

```javascript
// From a controller, model, or anywhere
await SendWelcomeEmailJob.performLater({ userId: user.id })
```

### Start the Worker

```bash
brails jobs:work
```

## Job Configuration

### Queue

Assign jobs to different queues for priority management:

```javascript
export default class ProcessImageJob extends Job {
  static queue = 'images'  // High priority queue
}

export default class SendNewsletterJob extends Job {
  static queue = 'low'     // Low priority queue
}
```

### Retries

Configure retry behavior:

```javascript
export default class ExternalApiJob extends Job {
  static attempts = 5
  static backoff = {
    type: 'exponential',  // or 'fixed'
    delay: 1000           // Initial delay in ms
  }
}
```

### Priority

Higher priority jobs run first:

```javascript
export default class UrgentJob extends Job {
  static priority = 10    // Higher = more urgent
}
```

### Unique Jobs

Prevent duplicate jobs:

```javascript
export default class SyncUserJob extends Job {
  static unique = true
  static uniqueKey = ({ userId }) => `sync_user_${userId}`

  async perform({ userId }) {
    // Only one job per user runs at a time
  }
}
```

## Scheduling

### Delayed Jobs

Run jobs after a delay:

```javascript
// Run in 5 minutes
await SendReminderJob.performIn(5 * 60 * 1000, { userId })

// Run at specific time
await SendReminderJob.performAt(tomorrow9am, { userId })
```

### Recurring Jobs

Cron-style scheduling:

```javascript
export default class DailyCleanupJob extends Job {
  static schedule = '0 2 * * *'  // 2 AM daily

  async perform() {
    await TempFile.where('created_at < ?', oneWeekAgo).destroyAll()
  }
}
```

```javascript
export default class HourlyStatsJob extends Job {
  static schedule = '0 * * * *'  // Every hour

  async perform() {
    await Stats.calculate()
  }
}
```

## Job Callbacks

```javascript
export default class ImportJob extends Job {
  async beforePerform() {
    console.log('Starting import...')
  }

  async perform({ fileUrl }) {
    // Import logic
  }

  async afterPerform() {
    console.log('Import complete!')
  }

  async onError(error) {
    console.error('Import failed:', error)
    await NotifyAdminJob.performLater({ error: error.message })
  }

  async onRetry(error, attemptNumber) {
    console.log(`Retry ${attemptNumber} after error: ${error.message}`)
  }
}
```

## Enqueuing Options

```javascript
// Basic
await MyJob.performLater(data)

// With options
await MyJob.performLater(data, {
  delay: 5000,           // Delay in ms
  priority: 5,           // Override default priority
  attempts: 10,          // Override default attempts
  removeOnComplete: 100, // Keep last 100 completed
  removeOnFail: 50       // Keep last 50 failed
})

// Run synchronously (for testing)
await MyJob.performNow(data)
```

## Dashboard

BunOnRails includes a built-in job dashboard at `/jobs` (development only by default):

- View queue statistics
- Monitor active jobs
- Retry failed jobs
- View job details and logs

Enable in production:

```javascript
// config/environments/production.js
export default {
  jobs: {
    dashboard: true,
    dashboardAuth: { username: 'admin', password: 'secret' }
  }
}
```

## Multiple Workers

Scale job processing with multiple workers:

```bash
# Start with concurrency
brails jobs:work --concurrency=10

# Start multiple processes
brails jobs:work --queues=emails,default &
brails jobs:work --queues=images &
brails jobs:work --queues=low &
```

Configure in production:

```javascript
// config/environments/production.js
export default {
  jobs: {
    workers: 2,         // Number of worker processes
    concurrency: 10     // Jobs per worker
  }
}
```

## Testing Jobs

```javascript
import { test, expect } from 'bun:test'
import SendWelcomeEmailJob from '../app/jobs/send_welcome_email_job.js'

test('sends welcome email', async () => {
  const user = await factory.create('user')

  // Run synchronously
  await SendWelcomeEmailJob.performNow({ userId: user.id })

  // Check email was sent
  expect(MailAdapters.test.deliveries.length).toBe(1)
  expect(MailAdapters.test.deliveries[0].to).toBe(user.email)
})
```

## Best Practices

1. **Keep jobs small** - One task per job
2. **Make jobs idempotent** - Safe to retry
3. **Pass IDs, not objects** - Jobs survive restarts
4. **Handle errors gracefully** - Use callbacks
5. **Monitor your queues** - Watch for backlogs
6. **Use appropriate queues** - Separate by priority

## AI-Agent Friendly

Jobs are perfect for AI agents to use:

```javascript
// AI can easily understand and generate this
await ProcessOrderJob.performLater({ orderId: order.id })
await SendNotificationJob.performLater({ userId, message })
await GenerateReportJob.performAt(endOfDay, { reportType: 'daily' })
```

Clear, predictable patterns that work reliably.
