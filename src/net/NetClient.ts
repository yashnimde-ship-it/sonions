import type { ClientMsg, ServerMsg } from './protocol';

/** The WebSocket to the game server, on the same host the game was loaded from. */
export class NetClient {
  private ws: WebSocket | null = null;
  onMessage: (msg: ServerMsg) => void = () => {};
  onClose: () => void = () => {};

  connect(): Promise<void> {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        this.ws = ws;
        resolve();
      };
      ws.onerror = () => reject(new Error('Could not reach the game server. Is it running? (npm run server)'));
      ws.onmessage = (e) => this.onMessage(JSON.parse(e.data) as ServerMsg);
      ws.onclose = () => {
        this.ws = null;
        this.onClose();
      };
    });
  }

  /** Closes the connection on purpose (Exit): onClose isn't called for this one. */
  disconnect() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onclose = null;
    ws.close();
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMsg) {
    if (this.connected) this.ws!.send(JSON.stringify(msg));
  }
}
