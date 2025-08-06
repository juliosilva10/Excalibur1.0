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

  // Buscar barreiras disponíveis para um símbolo e tipo de contrato específico
  getBarriersFor(symbol = 'R_100', contractType = 'CALL') {
    return new Promise(async (resolve, reject) => {
      try {
        const contractsData = await this.getContractsFor(symbol);
        
        // Encontrar o contrato específico
        const targetContract = contractsData.available?.find(contract => 
          contract.contract_type === contractType
        );
        
        if (!targetContract) {
          return resolve([]);
        }
        
        // Extrair informações de barreira
        const barriers = [];
        
        // Se tem barrier_count > 0, tem barreiras
        if (targetContract.barrier_count && targetContract.barrier_count > 0) {
          // Para contratos CALL/PUT, as barreiras são baseadas no spot atual
          if (['CALL', 'PUT'].includes(contractType)) {
            // Usar o spot atual dos dados de contratos
            const spot = contractsData.spot || 100;
            
            // Gerar barreiras em intervalos de 0.1 pontos
            const steps = [-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2];
            steps.forEach(step => {
              const barrierValue = spot + step;
              barriers.push({
                value: barrierValue.toString(),
                display: barrierValue.toFixed(1),
                relative: step > 0 ? `+${step}` : step.toString()
              });
            });
          }
          // Para contratos de dígito, usar 0-9
          else if (['DIGITEVEN', 'DIGITODD', 'DIGITOVER', 'DIGITUNDER', 'DIGITDIFF', 'DIGITMATCH'].includes(contractType)) {
            for (let i = 0; i <= 9; i++) {
              barriers.push({
                value: i.toString(),
                display: `Dígito ${i}`,
                relative: null
              });
            }
          }
          // Para outros tipos de contrato, usar valores relativos
          else {
            const percentages = [1, 2, 3, 5, 10, 15, 20];
            percentages.forEach(pct => {
              barriers.push({
                value: `+${pct}%`,
                display: `+${pct}%`,
                relative: `+${pct}%`
              });
              barriers.push({
                value: `-${pct}%`,
                display: `-${pct}%`,
                relative: `-${pct}%`
              });
            });
          }
        }
        
        resolve(barriers);
      } catch (error) {
        reject(error);
      }
    });
  }
}

export default ContractsAPI;
