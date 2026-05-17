import { describe, expect, it, vi } from "vitest";
import { Mailbox } from "./mailbox";
import { Message } from "./types";

describe("Mailbox", () => {
  const makeMsg = (
    id: string,
    source: Message["source"],
    content: string,
  ): Message => ({
    id,
    source,
    content,
    timestamp: Date.now(),
  });

  it("should send and retrieve messages", () => {
    const mailbox = new Mailbox();
    const msg = makeMsg("1", "user", "hello");

    mailbox.send(msg);

    expect(mailbox.getMessages()).toHaveLength(1);
    expect(mailbox.getMessages()[0].content).toBe("hello");
  });

  it("should poll matching messages", () => {
    const mailbox = new Mailbox();
    mailbox.send(makeMsg("1", "user", "a"));
    mailbox.send(makeMsg("2", "system", "b"));

    const found = mailbox.poll((m) => m.source === "system");
    expect(found?.content).toBe("b");
  });

  it("should receive existing messages immediately", async () => {
    const mailbox = new Mailbox();
    mailbox.send(makeMsg("1", "user", "x"));

    const received = await mailbox.receive((m) => m.content === "x");
    expect(received.content).toBe("x");
  });

  it("should notify subscribers on send", () => {
    const mailbox = new Mailbox();
    const sub = vi.fn();

    const unsub = mailbox.subscribe(sub);
    unsub();

    mailbox.send(makeMsg("1", "user", "hi"));
    expect(sub).toHaveBeenCalledTimes(1);
  });
});
