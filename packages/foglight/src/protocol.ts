/**
 * Daemon–attacher wire format: one JSON object per line, `type`-tagged,
 * schema-validated at both ends (ticket 002).
 */
import { Schema } from "effect";

export const ServeFlags = Schema.Struct({
  host: Schema.String,
  port: Schema.Number,
  tailscale: Schema.Boolean,
  tailscaleServe: Schema.Boolean,
  tailscaleServePort: Schema.Number,
});

export type ServeFlags = typeof ServeFlags.Type;

export class Hello extends Schema.Class<Hello>("Hello")({
  type: Schema.Literal("hello"),
  version: Schema.String,
  path: Schema.optional(Schema.String),
  verbose: Schema.Boolean,
  tracker: Schema.optional(Schema.Literal("local", "github")),
  flags: ServeFlags,
}) {}

export const AttachedProject = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
});

export type AttachedProject = typeof AttachedProject.Type;

export class HelloReplyOk extends Schema.Class<HelloReplyOk>("HelloReplyOk")({
  type: Schema.Literal("hello-reply"),
  ok: Schema.Literal(true),
  pid: Schema.Number,
  url: Schema.String,
  version: Schema.String,
  flags: ServeFlags,
  projects: Schema.Array(AttachedProject),
}) {}

export class HelloReplyErr extends Schema.Class<HelloReplyErr>("HelloReplyErr")({
  type: Schema.Literal("hello-reply"),
  ok: Schema.Literal(false),
  error: Schema.Literal("path-registered", "version-skew", "path-invalid"),
  message: Schema.String,
}) {}

export class Event extends Schema.Class<Event>("IpcEvent")({
  type: Schema.Literal("event"),
  kind: Schema.Literal("project-joined", "project-left", "daemon-exiting"),
  path: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
}) {}

export class LogLine extends Schema.Class<LogLine>("LogLine")({
  type: Schema.Literal("log-line"),
  line: Schema.String,
}) {}

export class ShutdownRequest extends Schema.Class<ShutdownRequest>("ShutdownRequest")({
  type: Schema.Literal("shutdown-request"),
}) {}

export const Message = Schema.Union(
  Hello,
  HelloReplyOk,
  HelloReplyErr,
  Event,
  LogLine,
  ShutdownRequest,
);

export type Message = typeof Message.Type;

export const encode = (message: Message): string => `${JSON.stringify(message)}\n`;

export const decodeLine = (line: string): Message =>
  Schema.decodeUnknownSync(Message)(JSON.parse(line));
