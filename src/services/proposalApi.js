// Serviço para buscar propostas na Deriv baseado na documentação oficial
class ProposalAPI {
  constructor(connection) {
    this.connection = connection;
  }

  getProposal(proposalParams) {
    return new Promise((resolve, reject) => {
      console.log('🟠 === WEBSOCKET PROPOSAL INICIADO ===');
      
      if (!this.connection || this.connection.readyState !== 1) {
        console.log('🟠 ❌ WebSocket não conectado');
        return reject('WebSocket is not connected');
      }

      console.log('🟠 ✅ WebSocket conectado - estado:', this.connection.readyState);
      console.log('🟠 📤 Parâmetros para envio:', proposalParams);

      // Criar um ID único para esta requisição
      const reqId = Date.now();
      console.log('🟠 🆔 ID da requisição:', reqId);

      // Timeout de 15 segundos
      const timeout = setTimeout(() => {
        console.log('🟠 ⏰ TIMEOUT - 15 segundos excedidos');
        this.connection.removeEventListener('message', handleMessage);
        reject('Timeout: Proposta não recebida em 15 segundos');
      }, 15000);

      const handleMessage = (message) => {
        const data = JSON.parse(message.data);
        console.log('🟠 📨 Mensagem WebSocket recebida:', data);
        console.log('🟠 🔍 msg_type:', data.msg_type, '| req_id esperado:', reqId, '| req_id recebido:', data.req_id);
        
        // Verificar se é a resposta da nossa requisição
        if (data.msg_type === 'proposal' && data.req_id === reqId) {
          console.log('🟠 🎯 MENSAGEM CORRESPONDENTE!');
          clearTimeout(timeout);
          this.connection.removeEventListener('message', handleMessage);
          if (data.error) {
            console.error('🟠 ❌ Erro da API:', data.error);
            console.error('🟠 ❌ Detalhes do erro:', JSON.stringify(data.error, null, 2));
            reject(data.error);
          } else {
            console.log('🟠 ✅ PROPOSTA RECEBIDA:', data.proposal);
            resolve(data.proposal);
          }
        } else {
          console.log('🟠 ⏭️ Mensagem ignorada - msg_type:', data.msg_type, 'req_id esperado:', reqId, 'recebido:', data.req_id);
        }
      };

      this.connection.addEventListener('message', handleMessage);
      
      // Estrutura baseada no exemplo oficial da Deriv
      const requestData = {
        proposal: 1,
        req_id: reqId,
        ...proposalParams
      };
      
      console.log('🟠 📋 Dados finais da requisição:', requestData);
      console.log('🟠 🌐 ENVIANDO VIA WEBSOCKET...');
      this.connection.send(JSON.stringify(requestData));
      console.log('🟠 ✅ Requisição enviada com sucesso');
    });
  }

  // Método para propostas usando a estrutura correta da API Deriv
  async getContractProposal(params) {
    console.log('🔴 === PROPOSAL API INICIADA ===');
    console.log('🔴 Parâmetros recebidos:', params);
    
    const {
      contract_type,
      symbol,
      amount,
      duration,
      duration_unit,
      basis = 'stake',
      currency = 'USD',
      barrier,
      barrier2,
      growth_rate
    } = params;

    console.log('🔴 Parâmetros extraídos:');
    console.log('🔴   contract_type:', contract_type);
    console.log('🔴   symbol:', symbol);
    console.log('🔴   amount:', amount);
    console.log('🔴   duration:', duration);
    console.log('🔴   duration_unit:', duration_unit);
    console.log('🔴   growth_rate:', growth_rate);

    // Estrutura correta conforme documentação da API Deriv
    const proposalRequest = {
      contract_type,
      symbol,
      amount: parseFloat(amount),
      basis,
      currency
    };

    // Para contratos ACCU (Accumulator), adicionar growth_rate em vez de duration
    if (contract_type !== 'ACCU') {
      proposalRequest.duration = parseInt(duration);
      proposalRequest.duration_unit = duration_unit;
      console.log('🔴 ⏰ Duração adicionada para contrato não-ACCU:', proposalRequest.duration, proposalRequest.duration_unit);
    } else {
      // Contratos ACCU precisam de growth_rate obrigatório
      proposalRequest.growth_rate = growth_rate || 0.01; // 1% como padrão se não fornecido
      console.log('🔴 📈 Contrato ACCU detectado - growth_rate adicionado:', proposalRequest.growth_rate);
    }

    console.log('🔴 Estrutura inicial da requisição:', proposalRequest);

    // Adicionar barreiras apenas se definidas e válidas
    if (barrier !== undefined && barrier !== null && barrier !== '') {
      // Para contratos CALL/PUT usar formato numérico
      if (['CALL', 'PUT'].includes(contract_type)) {
        proposalRequest.barrier = parseFloat(barrier);
      } else {
        // Para outros contratos como DIGIT usar como string
        proposalRequest.barrier = barrier.toString();
      }
      console.log('🔴 Barreira adicionada:', proposalRequest.barrier);
    }
    
    if (barrier2 !== undefined && barrier2 !== null && barrier2 !== '') {
      proposalRequest.barrier2 = parseFloat(barrier2);
      console.log('🔴 Barreira2 adicionada:', proposalRequest.barrier2);
    }

    console.log('🔴 📤 REQUISIÇÃO FINAL:', proposalRequest);
    
    try {
      console.log('🔴 🌐 Chamando getProposal...');
      const result = await this.getProposal(proposalRequest);
      console.log('🔴 ✅ SUCESSO - Resultado:', result);
      return result;
    } catch (error) {
      console.error('🔴 ❌ ERRO:', error);
      throw error;
    }
  }
}

export default ProposalAPI;
