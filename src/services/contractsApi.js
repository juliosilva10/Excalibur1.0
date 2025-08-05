// Serviço para buscar contratos disponíveis na Deriv
class ContractsAPI {
  constructor(connection) {
    this.connection = connection;
  }

  getContractsFor(symbol = 'R_100') {
    return new Promise((resolve, reject) => {
      if (!this.connection || this.connection.readyState !== 1) {
        return reject('WebSocket is not connected');
      }
      const handleMessage = (message) => {
        const data = JSON.parse(message.data);
        if (data.msg_type === 'contracts_for') {
          this.connection.removeEventListener('message', handleMessage);
          resolve(data.contracts_for);
        }
      };
      this.connection.addEventListener('message', handleMessage);
      this.connection.send(
        JSON.stringify({
          contracts_for: symbol,
        })
      );
    });
  }
}

export default ContractsAPI;
