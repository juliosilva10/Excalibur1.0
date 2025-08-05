// Serviço para buscar todos os símbolos ativos na Deriv
class ActiveSymbolsAPI {
  constructor(connection) {
    this.connection = connection;
  }

  getActiveSymbols() {
    return new Promise((resolve, reject) => {
      if (!this.connection || this.connection.readyState !== 1) {
        return reject('WebSocket is not connected');
      }
      const handleMessage = (message) => {
        const data = JSON.parse(message.data);
        if (data.msg_type === 'active_symbols') {
          this.connection.removeEventListener('message', handleMessage);
          resolve(data.active_symbols);
        }
      };
      this.connection.addEventListener('message', handleMessage);
      this.connection.send(
        JSON.stringify({
          active_symbols: 'brief',
          product_type: 'basic',
        })
      );
    });
  }
}

export default ActiveSymbolsAPI;
