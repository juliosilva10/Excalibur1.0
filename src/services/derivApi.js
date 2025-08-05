class DerivAPI {
  constructor(token, appId) {
    this.token = token;
    this.appId = appId;
    this.apiUrl = "wss://ws.binaryws.com/websockets/v3?app_id=" + appId;
    this.connection = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000; // ms
    this.onReconnect = null; // callback opcional
    this.onDisconnect = null; // callback opcional
    this.onConnect = null; // callback opcional
    this._shouldReconnect = true;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this._shouldReconnect = true;
      this._connect(resolve, reject);
    });
  }

  _connect(resolve, reject) {
    this.connection = new WebSocket(this.apiUrl);
    this.connection.onopen = () => {
      this.reconnectAttempts = 0;
      if (this.onConnect) this.onConnect();
      resolve && resolve();
    };
    this.connection.onerror = (error) => {
      console.error("WebSocket Error: ", error);
      if (this._shouldReconnect) {
        this._tryReconnect();
      } else {
        reject && reject(error);
      }
    };
    this.connection.onclose = () => {
      if (this._shouldReconnect) {
        if (this.onDisconnect) this.onDisconnect();
        this._tryReconnect();
      }
    };
  }

  _tryReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      setTimeout(() => {
        if (this.onReconnect) this.onReconnect(this.reconnectAttempts);
        this._connect();
      }, Math.min(delay, 30000)); // máximo 30s
    } else {
      this._shouldReconnect = false;
      if (this.onDisconnect) this.onDisconnect();
    }
  }

  disconnect() {
    this._shouldReconnect = false;
    if (this.connection) {
      this.connection.close();
    }
  }

  getAccountDetails() {
    return new Promise((resolve, reject) => {
      if (!this.connection || this.connection.readyState !== WebSocket.OPEN) {
        return reject("WebSocket is not connected");
      }

      const handleMessage = (message) => {
        const data = JSON.parse(message.data);
        if (data.msg_type === "authorize") {
          this.connection.removeEventListener('message', handleMessage);
          resolve(data.authorize);
        }
      };
      this.connection.addEventListener('message', handleMessage);

      this.connection.send(
        JSON.stringify({
          authorize: this.token,
        })
      );
    });
  }
}

export default DerivAPI;
