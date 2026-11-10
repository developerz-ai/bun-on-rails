/**
 * Mail goes through the configured adapter (plan 107 M1)
 *
 * Mail#deliver and #deliverLater threw NotImplementedError (plan 105), and
 * the default adapter, mail.adapter 'console', did not exist. Now deliver()
 * builds the message and hands it to the adapter: `console` prints it, `test`
 * keeps it in mailDeliveries(). deliverLater() queues it through the job
 * queue. A transport that is not built (smtp, sendgrid, postmark, ses) fails
 * at boot.
 */

import { test, expect, describe, beforeEach, afterEach, spyOn } from "bun:test";
import {
  Application,
  Mailer,
  configureMail,
  mailDeliveries,
  clearMailDeliveries,
  enqueuedJobs,
  performEnqueuedJobs,
  clearEnqueuedJobs,
  NotImplementedError,
} from "../../src/index.js";

class UserMailer extends Mailer {
  static defaults = { from: "hello@example.com" };

  static welcome(user) {
    return this.mail({
      to: user.email,
      subject: "Welcome!",
      text: `Hi ${user.name}`,
    });
  }
}

beforeEach(() => {
  configureMail({ adapter: "test" });
  clearMailDeliveries();
  clearEnqueuedJobs();
});
afterEach(() => configureMail({}));

describe("deliver()", () => {
  test("the test adapter keeps each message, with the mailer's from", async () => {
    await UserMailer.welcome({
      email: "ada@example.com",
      name: "Ada",
    }).deliver();

    expect(mailDeliveries()).toEqual([
      expect.objectContaining({
        from: "hello@example.com",
        to: "ada@example.com",
        subject: "Welcome!",
        text: "Hi Ada",
      }),
    ]);
  });

  test("without a from on the mailer, mail.from from config is used", async () => {
    configureMail({ adapter: "test", from: "noreply@app.test" });
    await Mailer.mail({
      to: "x@example.com",
      subject: "S",
      text: "T",
    }).deliver();
    expect(mailDeliveries()[0].from).toBe("noreply@app.test");
  });

  test("the console adapter prints the message", async () => {
    configureMail({ adapter: "console" });
    const printed = spyOn(console, "log").mockImplementation(() => {});
    try {
      await UserMailer.welcome({
        email: "ada@example.com",
        name: "Ada",
      }).deliver();
      const out = printed.mock.calls.flat().join("\n");
      expect(out).toContain("To: ada@example.com");
      expect(out).toContain("Subject: Welcome!");
      expect(out).toContain("Hi Ada");
    } finally {
      printed.mockRestore();
    }
  });

  test("a message with no recipient or no sender throws", async () => {
    await expect(
      Mailer.mail({ subject: "S", text: "T", from: "a@b.c" }).deliver(),
    ).rejects.toThrow("Mail has no recipient: give it `to`");
    await expect(
      Mailer.mail({ to: "x@example.com", subject: "S" }).deliver(),
    ).rejects.toThrow(
      "Mail has no sender: give the mailer `static defaults = { from }`, or set mail.from in config",
    );
  });

  test("a template is planned with HTML views, and says so", async () => {
    const mail = UserMailer.mail({ to: "x@example.com" }).template(
      "welcome",
      {},
    );
    const caught = await mail.deliver().catch((error) => error);
    expect(caught).toBeInstanceOf(NotImplementedError);
    expect(caught.api).toBe("Mail#template");
  });
});

describe("deliverLater()", () => {
  test("queues the message through the job queue, and the job delivers it", async () => {
    await UserMailer.welcome({
      email: "later@example.com",
      name: "L",
    }).deliverLater();

    expect(mailDeliveries()).toEqual([]);
    expect(enqueuedJobs().map((j) => j.job)).toEqual(["DeliverMailJob"]);

    await performEnqueuedJobs();
    expect(mailDeliveries().map((m) => m.to)).toEqual(["later@example.com"]);
  });
});

describe("mail.adapter at boot", () => {
  const boot = (mail) =>
    new Application({
      config: { logging: { level: "error" }, mail },
    }).initialize();

  test("a transport that is not built fails, as NotImplementedError", async () => {
    const caught = await boot({ adapter: "smtp" }).catch((error) => error);
    expect(caught).toBeInstanceOf(NotImplementedError);
    expect(caught.api).toBe("mail.adapter 'smtp'");
  });

  test("an unknown adapter fails, naming the built-in ones", async () => {
    await expect(boot({ adapter: "pigeon" })).rejects.toThrow(
      "Unknown mail.adapter 'pigeon'. The built-in adapters are 'console' and 'test'.",
    );
  });
});
