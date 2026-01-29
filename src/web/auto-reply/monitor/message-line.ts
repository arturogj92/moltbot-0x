import { resolveMessagePrefix } from "../../../agents/identity.js";
import { formatInboundEnvelope, type EnvelopeFormatOptions } from "../../../auto-reply/envelope.js";
import type { loadConfig } from "../../../config/config.js";
import type { WebInboundMsg } from "../types.js";
import { getRecentAudio } from "../../inbound/monitor.js";

export function formatReplyContext(msg: WebInboundMsg) {
  if (!msg.replyToBody) return null;
  const sender = msg.replyToSender ?? "unknown sender";
  const idPart = msg.replyToId ? ` id:${msg.replyToId}` : "";
  return `[Replying to ${sender}${idPart}]\n${msg.replyToBody}\n[/Replying]`;
}

export function buildInboundLine(params: {
  cfg: ReturnType<typeof loadConfig>;
  msg: WebInboundMsg;
  agentId: string;
  previousTimestamp?: number;
  envelope?: EnvelopeFormatOptions;
}) {
  const { cfg, msg, agentId, previousTimestamp, envelope } = params;
  const messagePrefix = resolveMessagePrefix(cfg, agentId, {
    configured: cfg.channels?.whatsapp?.messagePrefix,
    hasAllowFrom: (cfg.channels?.whatsapp?.allowFrom?.length ?? 0) > 0,
  });
  const prefixStr = messagePrefix ? `${messagePrefix} ` : "";
  const replyContext = formatReplyContext(msg);
  
  // DEBUG LOG
  console.log('[DEBUG-MEDIAPATH] msg.body:', msg.body?.substring(0, 50));
  console.log('[DEBUG-MEDIAPATH] msg.mediaPath:', msg.mediaPath);
  console.log('[DEBUG-MEDIAPATH] msg.mediaType:', msg.mediaType);
  
  // If no mediaPath but message could be referring to a recent audio, check cache
  let resolvedMediaPath = msg.mediaPath;
  let resolvedMediaType = msg.mediaType;
  if (!resolvedMediaPath && msg.chatId && msg.senderJid) {
    const cached = getRecentAudio(msg.chatId, msg.senderJid);
    if (cached) {
      resolvedMediaPath = cached.path;
      resolvedMediaType = cached.type;
      console.log('[DEBUG-MEDIAPATH] Found cached audio:', cached.path);
    }
  }
  
  // Inject mediaPath into media placeholders if available
  let bodyWithMediaPath = msg.body;
  if (resolvedMediaPath && bodyWithMediaPath.includes('<media:')) {
    console.log('[DEBUG-MEDIAPATH] REPLACING with path');
    bodyWithMediaPath = bodyWithMediaPath.replace(/<media:(\w+)>/, `<media:$1 path="${resolvedMediaPath}">`);
  }
  const baseLine = `${prefixStr}${bodyWithMediaPath}${replyContext ? `\n\n${replyContext}` : ""}`;

  return formatInboundEnvelope({
    channel: "WhatsApp",
    from: msg.chatType === "group" ? msg.from : msg.from?.replace(/^whatsapp:/, ""),
    timestamp: msg.timestamp,
    body: baseLine,
    chatType: msg.chatType,
    sender: {
      name: msg.senderName,
      e164: msg.senderE164,
      id: msg.senderJid,
    },
    previousTimestamp,
    envelope,
  });
}
