import { Room, RoomEvent, type RoomOptions } from "@livekit/rtc-node";

export interface AgentRoomJoinRequest {
  dispatchId: string;
  roomUrl: string;
  token: string;
  options?: Partial<RoomOptions>;
}

export interface AgentRoomSession {
  dispatchId: string;
  room: Room;
  close(): Promise<void>;
}

/**
 * Official LiveKit Node RTC join boundary for an Agent worker. Token issuance
 * remains outside the worker; this adapter only joins/leaves the assigned Room.
 */
export class LiveKitAgentRoomConnector {
  private readonly sessions = new Map<string, AgentRoomSession>();

  async join(request: AgentRoomJoinRequest, signal?: AbortSignal): Promise<AgentRoomSession> {
    if (request.dispatchId.length === 0 || request.dispatchId.length > 128) throw new TypeError("dispatchId is invalid");
    if (request.roomUrl.length === 0 || request.token.length === 0) throw new TypeError("roomUrl and token are required");
    if (this.sessions.has(request.dispatchId)) throw new Error("dispatch already has a LiveKit Room session");
    if (signal?.aborted) throw new Error("agent room join was cancelled");
    const room = new Room();
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      signal?.removeEventListener("abort", abort);
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
    const close = async () => {
      if (this.sessions.get(request.dispatchId)?.room === room) this.sessions.delete(request.dispatchId);
      cleanup();
      await room.disconnect();
    };
    const onDisconnected = () => {
      if (this.sessions.get(request.dispatchId)?.room === room) this.sessions.delete(request.dispatchId);
      cleanup();
    };
    room.on(RoomEvent.Disconnected, onDisconnected);
    const abort = () => { void close(); };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const options: RoomOptions = {
        autoSubscribe: request.options?.autoSubscribe ?? true,
        dynacast: request.options?.dynacast ?? false,
        ...(request.options?.rtcConfig === undefined ? {} : { rtcConfig: request.options.rtcConfig }),
      };
      await room.connect(request.roomUrl, request.token, options);
      if (signal?.aborted) {
        await close();
        throw new Error("agent room join was cancelled");
      }
      const session: AgentRoomSession = { dispatchId: request.dispatchId, room, close };
      this.sessions.set(request.dispatchId, session);
      return session;
    } catch (error) {
      cleanup();
      await room.disconnect().catch(() => undefined);
      throw error;
    }
  }

  async leave(dispatchId: string): Promise<boolean> {
    const session = this.sessions.get(dispatchId);
    if (session === undefined) return false;
    await session.close();
    return true;
  }

  activeDispatchIds(): readonly string[] {
    return [...this.sessions.keys()];
  }
}
