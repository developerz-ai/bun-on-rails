# Mail

> **Status.** Mail goes through the adapter `mail.adapter` names: `console` (the default) prints
> each message, and `test` keeps it for your tests. Sending through SMTP, SendGrid, Postmark or SES
> is planned.

## A mailer

**`app/mailers/user_mailer.js`**

```js
import { Mailer } from "bun-on-rails";

export default class UserMailer extends Mailer {
  static defaults = { from: "hello@example.com" };

  static welcome(user) {
    return this.mail({
      to: user.get("email"),
      subject: "Welcome!",
      text: `Hi ${user.get("name")}`,
    });
  }
}
```

`this.mail(options)` builds a message from the mailer's `defaults` and the options: `to`, `cc`,
`bcc` (an address or a list), `replyTo`, `subject`, `text`, `html` and `attachments`. The builder
methods `to()`, `cc()`, `bcc()`, `subject()`, `text()`, `html()` and `attach()` set the same fields.

## Sending

```js
await UserMailer.welcome(user).deliver(); // now
await UserMailer.welcome(user).deliverLater(); // through the job queue
```

`deliver()` hands the message to the adapter and returns it. `deliverLater()` builds the message
at once, so a mistake fails at the call, and queues a `DeliverMailJob` that sends it (see
[Background Jobs](../jobs/overview.md)). The sender is the mailer's `defaults.from`, else
`mail.from` from config; a message with no `to` or no sender throws.

## Adapters

**`config/mail.js`**

```js
export default {
  adapter: "console",
  from: "noreply@example.com",
};
```

| `mail.adapter`                        | Does                                                      |
| ------------------------------------- | --------------------------------------------------------- |
| `console` (default)                   | prints each message: its headers and its text             |
| `test`                                | keeps each message; `mailDeliveries()` returns them       |
| `smtp`, `sendgrid`, `postmark`, `ses` | planned: the app fails at boot with `NotImplementedError` |

## In tests

Set the `test` adapter for the test environment, then look at what was sent:

**`config/environments/test.js`**

```js
export default {
  mail: { adapter: "test" },
};
```

```js
import { mailDeliveries, clearMailDeliveries } from "bun-on-rails";

await UserMailer.welcome(user).deliver();
mailDeliveries(); // [{ from: "hello@example.com", to: "ada@example.com", subject: "Welcome!", ... }]
clearMailDeliveries(); // between tests
```

## Not implemented yet

- **Transports.** SMTP, SendGrid, Postmark and SES.
- **Templates.** `template(name, data)` throws `NotImplementedError` until HTML views land: write
  `text` or `html` yourself.
- **Generators.** `brails generate mailer` is not implemented yet.
