import { useEffect, useState, useRef } from 'react';
import DerivAPI from './services/derivApi';
import ContractsAPI from './services/contractsApi';
import ActiveSymbolsAPI from './services/activeSymbolsApi';
import ProposalAPI from './services/proposalApi';
import './App.css';

const SYMBOL_KEYWORDS = [
  'AUD', 'CAD', 'CHF', 'JPY', 'NZD', 'USD', 'EUR', 'GBP'
];

const CATEGORIES = [
  'Commodities Basket',
  'Forex Basket',
  'Continuous Indices',
  'Crash/Boom Indices',
  'Daily Reset Indices',
  'Jump Indices',
  'Range Break Indices',
  'Step Indices',
  'Major Pairs',
  'Minor Pairs',
  'American indices',
  'Asian indices',
  'European indices',
  'Cryptocurrencies',
  'Metals',
];

function normalizeCategory(cat) {
  // Normaliza nomes para facilitar matching
  return cat.replace(/í/g, 'i').replace(/Í/g, 'I').toLowerCase();
}

function getCategoryForSymbol(symbolObj) {
  const market = symbolObj.market_display_name?.toLowerCase() || '';
  const submarket = symbolObj.submarket_display_name?.toLowerCase() || '';
  const symbol = symbolObj.display_name?.toLowerCase() || '';
  const symbolCode = symbolObj.symbol?.toLowerCase() || '';

  // Mapeamento mais abrangente
  // Forex Basket
  if ((market.includes('forex') && submarket.includes('basket')) || 
      (submarket.includes('basket') && (symbolCode.includes('aud') || symbolCode.includes('eur') || symbolCode.includes('gbp')))) {
    return 'Forex Basket';
  }
  
  // Commodities Basket  
  if ((market.includes('commodities') && submarket.includes('basket')) || 
      (submarket.includes('basket') && (symbolCode.includes('wld') || symbolCode.includes('gdx')))) {
    return 'Commodities Basket';
  }
  
  // Continuous Indices
  if ((market.includes('indices') && submarket.includes('continuous')) ||
      (symbolCode.includes('r_') && (symbolCode.includes('10') || symbolCode.includes('25') || symbolCode.includes('50') || symbolCode.includes('75') || symbolCode.includes('100')))) {
    return 'Continuous Indices';
  }
  
  // Crash/Boom Indices  
  if ((market.includes('indices') && (submarket.includes('crash') || submarket.includes('boom'))) ||
      (symbolCode.includes('crash') || symbolCode.includes('boom'))) {
    return 'Crash/Boom Indices';
  }
  
  // Daily Reset Indices
  if ((market.includes('indices') && submarket.includes('daily')) ||
      (symbolCode.includes('rdbull') || symbolCode.includes('rdbear'))) {
    return 'Daily Reset Indices';
  }
  
  // Jump Indices
  if ((market.includes('indices') && submarket.includes('jump')) ||
      (symbolCode.includes('jd10') || symbolCode.includes('jd25') || symbolCode.includes('jd50') || symbolCode.includes('jd75') || symbolCode.includes('jd100'))) {
    return 'Jump Indices';
  }
  
  // Range Break Indices
  if ((market.includes('indices') && submarket.includes('range')) ||
      (symbolCode.includes('rng'))) {
    return 'Range Break Indices';
  }
  
  // Step Indices
  if ((market.includes('indices') && submarket.includes('step')) ||
      (symbolCode.includes('stpdir') || symbolCode.includes('stprng'))) {
    return 'Step Indices';
  }
  
  // Major Pairs
  if (market.includes('forex') && submarket.includes('major')) return 'Major Pairs';
  
  // Minor Pairs  
  if (market.includes('forex') && submarket.includes('minor')) return 'Minor Pairs';
  
  // American indices
  if (market.includes('indices') && submarket.includes('american')) return 'American indices';
  
  // Asian indices
  if (market.includes('indices') && submarket.includes('asian')) return 'Asian indices';
  
  // European indices
  if (market.includes('indices') && submarket.includes('european')) return 'European indices';
  
  // Metals
  if (market.includes('commodities') && !submarket.includes('basket')) return 'Metals';
  
  // Cryptocurrencies
  if (market.includes('cryptocurrencies')) return 'Cryptocurrencies';

  return null;
}

function App() {
  const [accountInfo, setAccountInfo] = useState({});
  const [connected, setConnected] = useState(false);
  const [ping, setPing] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [symbols, setSymbols] = useState([]);
  const [contractsBySymbol, setContractsBySymbol] = useState({});
  const [contractsLoading, setContractsLoading] = useState({});
  const [expandedSymbol, setExpandedSymbol] = useState(null);
  const [categorySymbols, setCategorySymbols] = useState({});
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [categoryContracts, setCategoryContracts] = useState({});
  const [categoryLoading, setCategoryLoading] = useState({});
  
  // Estados para o card de proposta
  const [selectedContract, setSelectedContract] = useState(null);
  const [stake, setStake] = useState('10'); // Valor padrão
  const [stakeError, setStakeError] = useState('');
  const [duration, setDuration] = useState('5'); // Valor padrão
  const [durationUnit, setDurationUnit] = useState('m');
  const [barrier, setBarrier] = useState('');
  const [digit, setDigit] = useState('');
  const [proposal, setProposal] = useState(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  
  const wsRef = useRef(null);
  const apiRef = useRef(null);
  const pingInterval = useRef(null);

  const token = 'oLJLFtINRDBGUh1';
  const appId = '82663';

  useEffect(() => {
    return () => {
      if (pingInterval.current) clearInterval(pingInterval.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const api = new DerivAPI(token, appId);
      apiRef.current = api;
      api.onConnect = () => {
        setConnected(true);
        setReconnecting(false);
        wsRef.current = api.connection;
        fetchAccountInfo();
        startPing();
        fetchInitialSymbols();
      };
      api.onDisconnect = () => {
        setConnected(false);
        setPing(null);
        setReconnecting(true);
      };
      api.onReconnect = () => {
        setReconnecting(true);
      };
      await api.connect();
    } catch (error) {
      setConnected(false);
      setPing(null);
      setAccountInfo({});
      setReconnecting(false);
      setSymbols([]);
      setContractsBySymbol({});
      setContractsLoading({});
      console.error(error);
    }
    setConnecting(false);
  };

  const handleDisconnect = () => {
    setConnected(false);
    setPing(null);
    setAccountInfo({});
    setReconnecting(false);
    setSymbols([]);
    setContractsBySymbol({});
    setContractsLoading({});
    setExpandedSymbol(null);
    if (pingInterval.current) clearInterval(pingInterval.current);
    if (apiRef.current) apiRef.current.disconnect();
    wsRef.current = null;
    apiRef.current = null;
  };

  async function fetchAccountInfo() {
    try {
      if (apiRef.current) {
        const data = await apiRef.current.getAccountDetails();
        setAccountInfo({
          accountCode: data.loginid,
          accountType: data.is_virtual ? 'Virtual' : 'Real',
          balance: data.balance,
        });
      }
    } catch (e) {
      setAccountInfo({});
    }
  }

  async function fetchInitialSymbols() {
    if (!wsRef.current) return;
    try {
      const activeSymbolsApi = new ActiveSymbolsAPI(wsRef.current);
      const allSymbols = await activeSymbolsApi.getActiveSymbols();
      // Log para depuração: mercados, submercados e símbolos
      console.log('Mercados e submercados disponíveis:');
      allSymbols.forEach(s => {
        console.log('market:', s.market_display_name, '| submarket:', s.submarket_display_name, '| symbol:', s.symbol, '| display:', s.display_name);
      });
      // Agrupa símbolos por categoria desejada
      const catSymbols = {};
      for (const cat of CATEGORIES) {
        catSymbols[cat] = allSymbols.filter(s => getCategoryForSymbol(s) === cat);
        console.log(`Categoria '${cat}' possui ${catSymbols[cat].length} símbolos:`, catSymbols[cat].map(s => s.display_name));
      }
      setCategorySymbols(catSymbols);
      // Exibe todos os símbolos disponíveis para facilitar ajuste
      setSymbols(allSymbols);
    } catch (e) {
      setCategorySymbols({});
      setSymbols([]);
    }
  }

  async function handleCategoryClick(category) {
    if (expandedCategory === category) {
      setExpandedCategory(null);
      return;
    }
    setExpandedCategory(category);
    if (categorySymbols[category]) {
      console.log('Símbolos encontrados para', category, ':', categorySymbols[category].map(s => s.display_name));
    }
    if (!categoryContracts[category]) {
      setCategoryLoading(prev => ({ ...prev, [category]: true }));
      try {
        const contractsApi = new ContractsAPI(wsRef.current);
        // Novo agrupamento: contratos por categoria real da API
        const contractsByApiCategory = {};
        for (const symbolObj of (categorySymbols[category] || [])) {
          try {
            const contractsFor = await contractsApi.getContractsFor(symbolObj.symbol);
            const contracts = contractsFor && contractsFor.available ? contractsFor.available : [];
            contracts.forEach(contract => {
              const cat = contract.contract_category_display || 'Outros';
              if (!contractsByApiCategory[cat]) contractsByApiCategory[cat] = [];
              contractsByApiCategory[cat].push({
                ...contract,
                symbol: symbolObj.display_name
              });
            });
          } catch {
            // Se falhar, ignora
          }
        }
        setCategoryContracts(prev => ({ ...prev, [category]: contractsByApiCategory }));
      } catch {
        setCategoryContracts(prev => ({ ...prev, [category]: {} }));
      }
      setCategoryLoading(prev => ({ ...prev, [category]: false }));
    }
  }

  // Funções para o card de proposta
  const handleContractSelect = (contract) => {
    console.log('🔵 CONTRATO SELECIONADO:', contract);
    console.log('🔵 Tipo do contrato:', contract.contract_type);
    console.log('🔵 Símbolo:', contract.symbol);
    console.log('🔵 Barreiras necessárias:', contract.barriers);
    
    setSelectedContract(contract);
    setStake('10'); // Alterado para 10
    setStakeError('');
    setDuration('5');
    setBarrier('');
    setDigit('');
    setProposal(null);
    
    console.log('🔵 Estados atualizados - forçando cálculo em 2 segundos...');
    
    // Forçar cálculo da proposta após seleção
    setTimeout(() => {
      console.log('🔵 ⏰ TIMEOUT DE SELEÇÃO (2s) executado - chamando calculateProposal');
      calculateProposal();
    }, 2000);
  };

  const validateStake = (value) => {
    if (!selectedContract) return '';
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return 'Valor inválido';
    
    if (numValue < selectedContract.min_stake) {
      return `Mínimo: ${selectedContract.min_stake}`;
    }
    if (numValue > selectedContract.max_stake) {
      return `Máximo: ${selectedContract.max_stake}`;
    }
    return '';
  };

  const handleStakeChange = (e) => {
    const value = e.target.value;
    setStake(value);
    setStakeError(validateStake(value));
  };

  const handleDurationChange = (e) => {
    setDuration(e.target.value);
  };

  const handleDurationUnitChange = (e) => {
    setDurationUnit(e.target.value);
  };

  const handleBarrierChange = (e) => {
    setBarrier(e.target.value);
  };

  const handleDigitChange = (e) => {
    setDigit(e.target.value);
  };

  const calculateProposal = async () => {
    console.log('🟡 === CALCULATE PROPOSAL INICIADO ===');
    console.log('🟡 selectedContract:', !!selectedContract, selectedContract?.contract_type);
    console.log('🟡 stake:', stake);
    console.log('🟡 duration:', duration);
    console.log('🟡 connected:', connected);
    console.log('🟡 wsRef.current:', !!wsRef.current);
    
    if (!connected || !wsRef.current) {
      console.log('🟡 ❌ Retornando - não conectado');
      return;
    }
    
    if (!selectedContract || !stake || !duration) {
      console.log('🟡 ❌ Retornando - dados básicos faltando');
      console.log('🟡 selectedContract:', !!selectedContract);
      console.log('🟡 stake:', stake);
      console.log('🟡 duration:', duration);
      return;
    }
    
    console.log('🟡 ✅ Todas as condições atendidas - prosseguindo com cálculo');
    setProposalLoading(true);
    
    try {
      const proposalApi = new ProposalAPI(wsRef.current);
      console.log('🟡 📝 Criando parâmetros da proposta...');
      
      // Usar dados reais do formulário com estrutura correta da API
      const proposalParams = {
        contract_type: selectedContract.contract_type,
        symbol: "R_100", // Símbolo padrão para teste
        amount: parseFloat(stake),
        basis: "stake", // Voltando para stake como padrão da API
        currency: "USD"
      };

      // Para contratos ACCU (Accumulator), não usar duration/duration_unit
      if (selectedContract.contract_type !== 'ACCU') {
        proposalParams.duration = parseInt(duration);
        proposalParams.duration_unit = durationUnit;
        console.log('🟡 ⏰ Duração adicionada para contrato não-ACCU:', proposalParams.duration, proposalParams.duration_unit);
      } else {
        console.log('🟡 ⏰ Contrato ACCU detectado - sem parâmetros de duração');
      }

      console.log('🟡 📝 Parâmetros básicos criados:', proposalParams);

      // Adicionar barreiras conforme o tipo de contrato
      const needsBarrier = selectedContract.barriers === 1;
      const needsDigit = ['DIGITEVEN', 'DIGITODD', 'DIGITOVER', 'DIGITUNDER', 'DIGITDIFF', 'DIGITMATCH'].includes(selectedContract.contract_type);
      
      console.log('🟡 🔍 Verificando necessidades especiais:');
      console.log('🟡   needsBarrier:', needsBarrier, '| barrier atual:', barrier);
      console.log('🟡   needsDigit:', needsDigit, '| digit atual:', digit);
      
      if (needsBarrier && barrier) {
        // Para contratos CALL/PUT, usar valor numérico relativo ao spot
        if (['CALL', 'PUT'].includes(selectedContract.contract_type)) {
          proposalParams.barrier = parseFloat(barrier);
        } else {
          proposalParams.barrier = barrier;
        }
        console.log('🟡 ✅ Barreira adicionada:', proposalParams.barrier);
      }
      
      if (needsDigit && digit !== '') {
        proposalParams.barrier = parseInt(digit);
        console.log('🟡 ✅ Dígito adicionado:', proposalParams.barrier);
      }

      console.log('🟡 📋 PARÂMETROS FINAIS DA PROPOSTA:', proposalParams);
      console.log('🟡 📋 Contrato selecionado completo:', selectedContract);
      
      console.log('🟡 🚀 Enviando requisição para ProposalAPI...');
      const result = await proposalApi.getContractProposal(proposalParams);
      console.log('🟡 ✅ RESULTADO RECEBIDO:', result);
      
      if (result && result.payout) {
        setProposal(result);
        console.log('Proposta salva com sucesso - payout:', result.payout);
      } else {
        console.warn('Resultado da proposta não contém payout válido:', result);
        setProposal(null);
      }
    } catch (error) {
      console.error('Erro ao calcular proposta:', error);
      console.error('Tipo do erro:', typeof error);
      console.error('Detalhes do erro:', error.message || error);
      setProposal(null);
    }
    
    setProposalLoading(false);
  };

  // Executar cálculo quando parâmetros mudarem
  // Executar cálculo quando parâmetros mudarem
  useEffect(() => {
    console.log('useEffect triggered - recalculando proposta');
    console.log('selectedContract:', !!selectedContract);
    console.log('stake:', stake);
    console.log('duration:', duration);
    console.log('connected:', connected);
    
    if (selectedContract && stake && duration && connected && !stakeError) {
      console.log('Condições atendidas - iniciando timer para recálculo');
      const timer = setTimeout(() => {
        console.log('🔵 ⏰ TIMEOUT DO USEEFFECT (1s) executado - chamando calculateProposal');
        calculateProposal();
      }, 1000); // 1 segundo de debounce
      
      return () => {
        console.log('Limpando timer');
        clearTimeout(timer);
      };
    } else {
      console.log('Condições não atendidas para recálculo automático');
    }
  }, [selectedContract, stake, duration, durationUnit, barrier, digit, connected, stakeError]);

  async function handleSymbolClick(symbol) {
    if (expandedSymbol === symbol) {
      setExpandedSymbol(null);
      return;
    }
    setExpandedSymbol(symbol);
    if (!contractsBySymbol[symbol]) {
      setContractsLoading(prev => ({ ...prev, [symbol]: true }));
      try {
        const contractsApi = new ContractsAPI(wsRef.current);
        const contractsFor = await contractsApi.getContractsFor(symbol);
        setContractsBySymbol(prev => ({ ...prev, [symbol]: contractsFor.available }));
      } catch (e) {
        setContractsBySymbol(prev => ({ ...prev, [symbol]: [] }));
      }
      setContractsLoading(prev => ({ ...prev, [symbol]: false }));
    }
  }

  function startPing() {
    if (pingInterval.current) clearInterval(pingInterval.current);
    pingInterval.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === 1) {
        const t0 = Date.now();
        const handlePong = (msg) => {
          const data = JSON.parse(msg.data);
          if (data.msg_type === 'ping') {
            setPing(Date.now() - t0);
            wsRef.current.removeEventListener('message', handlePong);
          }
        };
        wsRef.current.addEventListener('message', handlePong);
        wsRef.current.send(JSON.stringify({ ping: 1 }));
      } else {
        setConnected(false);
        setPing(null);
      }
    }, 1000);
  }

  return (
    <div className="app" style={{display: 'block'}}>
      <div style={{position: 'fixed', top: 0, left: 0, zIndex: 10, display: 'flex', gap: '12px'}}>
        {/* Container para os dois primeiros cards */}
        <div style={{display: 'flex', flexDirection: 'column'}}>
          <div className="account-panel" style={{position: 'relative'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', marginBottom: 10}}>
              <div className="account-info" style={{flex: 1}}>
                <h2>Account Details</h2>
                <p>Account Code: {accountInfo.accountCode || '---'}</p>
                <p>Account Type: {accountInfo.accountType || '---'}</p>
                <p>Balance: {accountInfo.balance || '---'}</p>
              </div>
              <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: 10}}>
                <div className="status-block" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 8}}>
                  <span className="status-dot" style={{background: connected ? '#4caf50' : reconnecting ? '#ff9800' : '#ccc', borderColor: connected ? '#388e3c' : reconnecting ? '#ff9800' : '#888'}}></span>
                  <span className="ping-text">{ping !== null ? `${ping} ms` : reconnecting ? 'Recon.' : '--'}</span>
                </div>
              </div>
            </div>
            <button
              className={`connect-btn ${connected ? 'disconnect' : 'connect'}`}
              onClick={connected ? handleDisconnect : handleConnect}
              disabled={connecting}
            >
              {connected ? 'Disconnect' : 'Connect'}
            </button>
          </div>

          <div className="account-panel" style={{marginTop: 10}}>
            <h2 style={{marginTop: 0, marginBottom: 12, textAlign: 'left', width: '100%', display: 'block'}}>Contratos por Categoria</h2>
            <ul style={{listStyle: 'none', margin: 0, padding: 0, width: '100%', display: 'block', marginTop: 0}}>
              {CATEGORIES.map((cat) => (
                <li key={cat} style={{marginBottom: 2, width: '100%'}}>
                  <button className="symbol-btn" style={{textAlign: 'left', width: '100%', display: 'block'}} onClick={() => handleCategoryClick(cat)}>
                    {cat}
                  </button>
                  {expandedCategory === cat && (
                    <div className="contracts-scroll" style={{marginLeft: 8}}>
                      {categoryLoading[cat] && <div>Carregando contratos...</div>}
                      {!categoryLoading[cat] && (!categorySymbols[cat] || categorySymbols[cat].length === 0) && (
                        <div style={{fontSize: 11, color: '#888'}}>Nenhum símbolo encontrado nesta categoria</div>
                      )}
                      {!categoryLoading[cat] && categorySymbols[cat] && categorySymbols[cat].length > 0 && (!categoryContracts[cat] || Object.keys(categoryContracts[cat]).length === 0) && (
                        <div style={{fontSize: 11, color: '#888'}}>Carregando contratos para esta categoria...</div>
                      )}
                      {!categoryLoading[cat] && categorySymbols[cat] && categorySymbols[cat].length > 0 && categoryContracts[cat] && Object.keys(categoryContracts[cat]).length > 0 && (
                        <ul style={{margin: '2px 0 6px 0', padding: 0}}>
                          {Object.entries(categoryContracts[cat]).map(([apiCategory, contracts]) => {
                            if (!contracts || !Array.isArray(contracts)) {
                              return null;
                            }
                            return (
                              <li key={apiCategory} style={{fontSize: 11, marginBottom: 4}}>
                                <strong>{apiCategory}</strong>
                                <ul style={{margin: '2px 0 0 10px', padding: 0}}>
                                  {contracts.length > 0 ? contracts.map((contract, index) => {
                                    if (!contract) return null;
                                    return (
                                      <li key={`${contract.symbol || 'unknown'}-${contract.contract_type || index}-${contract.display_name || apiCategory}-${index}-${Date.now()}`} style={{fontSize: 10}}>
                                        <button 
                                          style={{
                                            background: 'none', 
                                            border: 'none', 
                                        textAlign: 'left', 
                                        padding: '2px 0', 
                                        cursor: 'pointer',
                                        color: '#3f51b5',
                                        fontSize: '10px',
                                        width: '100%'
                                      }}
                                      onClick={() => handleContractSelect(contract)}
                                    >
                                      <span style={{color:'#888'}}>{contract.symbol}:</span> {contract.contract_type_display}
                                    </button>
                                  </li>
                                    );
                                  }) : <li style={{fontSize: 10, color: '#888'}}>Nenhum contrato disponível</li>}
                                </ul>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Card de Proposta */}
        <div className="proposal-panel" style={{position: 'relative'}}>
          <h2>Proposta</h2>
          
          {selectedContract ? (
            <>
              <div className="contract-info">
                <div className="contract-name">{selectedContract.contract_type_display}</div>
                <div className="contract-details">
                  {selectedContract.symbol} • {selectedContract.contract_category_display}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Stake</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={`form-input ${stakeError ? 'error' : ''}`}
                  value={stake}
                  onChange={handleStakeChange}
                  placeholder="Digite o valor"
                />
                {stakeError && <span className="error-message">{stakeError}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Duração</label>
                <div className="duration-container">
                  <input
                    type="number"
                    min="1"
                    className="form-input duration-input"
                    value={duration}
                    onChange={handleDurationChange}
                    placeholder="Tempo"
                  />
                  <select
                    className="form-select duration-select"
                    value={durationUnit}
                    onChange={handleDurationUnitChange}
                  >
                    <option value="t">Ticks</option>
                    <option value="s">Segundos</option>
                    <option value="m">Minutos</option>
                    <option value="h">Horas</option>
                    <option value="d">Dias</option>
                  </select>
                </div>
              </div>

              {selectedContract.barriers === 1 && (
                <div className="form-group">
                  <label className="form-label">Barreira</label>
                  <input
                    type="text"
                    className="form-input"
                    value={barrier}
                    onChange={handleBarrierChange}
                    placeholder="Digite a barreira"
                  />
                </div>
              )}

              {['DIGITEVEN', 'DIGITODD', 'DIGITOVER', 'DIGITUNDER', 'DIGITDIFF', 'DIGITMATCH'].includes(selectedContract.contract_type) && (
                <div className="form-group">
                  <label className="form-label">Dígito</label>
                  <select
                    className="form-select"
                    value={digit}
                    onChange={handleDigitChange}
                  >
                    <option value="">Selecione um dígito</option>
                    {[0,1,2,3,4,5,6,7,8,9].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Payout Estimado</label>
                <input
                  type="text"
                  className="payout-field"
                  value={proposal ? `$${proposal.payout?.toFixed(2) || '0.00'}` : '$0.00'}
                  readOnly
                />
                <button 
                  onClick={() => {
                    console.log('🟡 TESTE MANUAL - Iniciando calculateProposal()');
                    calculateProposal();
                  }}
                  style={{
                    marginTop: '10px',
                    padding: '8px 16px',
                    backgroundColor: '#ff9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  🔧 Testar Cálculo Manual
                </button>
              </div>

              {proposalLoading && (
                <div style={{textAlign: 'center', padding: '10px', color: '#666', fontSize: '11px'}}>
                  Calculando proposta...
                </div>
              )}
            </>
          ) : (
            <div style={{textAlign: 'center', padding: '20px', color: '#888', fontSize: '12px'}}>
              Selecione um contrato para ver a proposta
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
