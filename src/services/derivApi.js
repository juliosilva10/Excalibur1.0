class DerivAPI {
  constructor(token, appId) {
    this.token = token;
    this.appId = appId;
    this.apiUrl = "wss://ws.binaryws.com/websockets/v3?app_id=" + appId;
    this.connection = null;
  }


  connect() {
    return new Promise((resolve, reject) => {
      this.connection = new WebSocket(this.apiUrl);
      this.connection.onopen = () => {
        console.log("Connected to Deriv API");
        resolve();
      };
      this.connection.onerror = (error) => {
        console.error("WebSocket Error: ", error);
        reject(error);
      };
    });
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
