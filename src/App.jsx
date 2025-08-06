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
  const [availableBarriers, setAvailableBarriers] = useState([]); // Barreiras disponíveis
  const [growthRate, setGrowthRate] = useState('0.01'); // Taxa de crescimento para contratos ACCU (1% padrão)
  const [digit, setDigit] = useState('');
  const [proposal, setProposal] = useState(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  
  // Estados para simulação do Accumulator em tempo real
  const [currentSpot, setCurrentSpot] = useState(null);
  const [accumulatorData, setAccumulatorData] = useState({
    initialSpot: null,
    upperBarrier: null,
    lowerBarrier: null,
    ticksCount: 0,
    currentPayout: 0,
    isActive: false
  });
  
  // Estados para simulação de trading
  const [simulationActive, setSimulationActive] = useState(false);
  const [simulationContracts, setSimulationContracts] = useState([]);
  const [currentSimulationContract, setCurrentSimulationContract] = useState(null);
  
  // Estado para armazenar o último tick por símbolo
  const [lastTickBySymbol, setLastTickBySymbol] = useState({});

  const wsRef = useRef(null);
  const apiRef = useRef(null);
  const pingInterval = useRef(null);
  const simulationInterval = useRef(null);

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
        subscribeToTicks(); // Iniciar subscrição de ticks para Accumulator
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
    console.log('🔵 handleCategoryClick chamado para categoria:', category);
    console.log('🔵 expandedCategory atual:', expandedCategory);
    console.log('🔵 categorySymbols[category]:', categorySymbols[category]?.length || 0, 'símbolos');
    
    if (expandedCategory === category) {
      setExpandedCategory(null);
      console.log('🔵 Fechando categoria:', category);
      return;
    }
    
    setExpandedCategory(category);
    console.log('🔵 Expandindo categoria:', category);
    
    if (categorySymbols[category]) {
      console.log('Símbolos encontrados para', category, ':', categorySymbols[category].map(s => s.display_name));
    }
    
    if (!categoryContracts[category]) {
      console.log('🔵 Carregando contratos para categoria:', category);
      setCategoryLoading(prev => ({ ...prev, [category]: true }));
      try {
        const contractsApi = new ContractsAPI(wsRef.current);
        // Novo agrupamento: contratos por categoria real da API
        const contractsByApiCategory = {};
        for (const symbolObj of (categorySymbols[category] || [])) {
          try {
            console.log('🔵 Buscando contratos para símbolo:', symbolObj.symbol, symbolObj.display_name);
            const contractsFor = await contractsApi.getContractsFor(symbolObj.symbol);
            const contracts = contractsFor && contractsFor.available ? contractsFor.available : [];
            console.log('🔵 Contratos encontrados para', symbolObj.symbol, ':', contracts.length);
            
            contracts.forEach(contract => {
              const cat = contract.contract_category_display || 'Outros';
              if (!contractsByApiCategory[cat]) contractsByApiCategory[cat] = [];
              contractsByApiCategory[cat].push({
                ...contract,
                symbol_code: symbolObj.symbol, // Código real do símbolo (ex: R_10)
                symbol: symbolObj.display_name // Nome de exibição (ex: Volatility 10 Index)
              });
            });
          } catch (error) {
            console.error('🔵 Erro ao buscar contratos para', symbolObj.symbol, ':', error);
          }
        }
        console.log('🔵 Total de contratos carregados para', category, ':', contractsByApiCategory);
        setCategoryContracts(prev => ({ ...prev, [category]: contractsByApiCategory }));
      } catch (error) {
        console.error('🔵 Erro geral ao carregar contratos para', category, ':', error);
        setCategoryContracts(prev => ({ ...prev, [category]: {} }));
      }
      setCategoryLoading(prev => ({ ...prev, [category]: false }));
    } else {
      console.log('🔵 Contratos já carregados para categoria:', category);
    }
  }

  // Funções para o card de proposta
  const handleContractSelect = async (contract) => {
    console.log('🔵 ===== CONTRATO SELECIONADO =====');
    console.log('🔵 CONTRATO COMPLETO:', contract);
    console.log('🔵 Tipo do contrato:', contract.contract_type);
    console.log('🔵 Símbolo (nome):', contract.symbol);
    console.log('🔵 Símbolo (código):', contract.symbol_code);
    console.log('🔵 Barreiras necessárias:', contract.barriers);
    console.log('🔵 ===========================');
    
    setSelectedContract(contract);
    setStake('10'); // Alterado para 10
    setStakeError('');
    setDuration('5');
    setBarrier('');
    setDigit('');
    setProposal(null);
    setAvailableBarriers([]);
    
    console.log('🔵 Estados resetados, selectedContract definido para:', contract.contract_type);
    
    // Reset Accumulator data
    setAccumulatorData({
      initialSpot: null,
      upperBarrier: null,
      lowerBarrier: null,
      ticksCount: 0,
      currentPayout: 0,
      isActive: false
    });
    
    // Iniciar subscrição aos ticks para o novo contrato
    if (wsRef.current && wsRef.current.readyState === 1) {
      console.log('🔔 Iniciando subscrição de ticks para novo contrato...');
      subscribeToTicks();
    }
    
    // Buscar barreiras disponíveis se o contrato precisar
    if (contract.barriers === 1 && wsRef.current) {
      try {
        console.log('🔵 Buscando barreiras disponíveis...');
        const contractsApi = new ContractsAPI(wsRef.current);
        const barriers = await contractsApi.getBarriersFor(contract.symbol_code, contract.contract_type);
        console.log('🔵 Barreiras encontradas:', barriers);
        setAvailableBarriers(barriers);
        
        // Definir uma barreira padrão se houver barreiras disponíveis
        if (barriers.length > 0) {
          setBarrier(barriers[0].value);
          console.log('🔵 Barreira padrão definida:', barriers[0].value);
        }
      } catch (error) {
        console.error('🔵 Erro ao buscar barreiras:', error);
        setAvailableBarriers([]);
      }
    }
    
    console.log('🔵 Estados atualizados - calculando proposta em 100ms...');
    
    // Calcular proposta imediatamente após seleção
    setTimeout(() => {
      console.log('🔵 Chamando calculateProposal...');
      calculateProposal();
    }, 100);
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

  // Função para calcular payout do Accumulator em tempo real
  const calculateAccumulatorPayout = (initialStake, growthRateValue, ticksCount) => {
    if (!initialStake || !growthRateValue || ticksCount <= 0) {
      return parseFloat(initialStake || 0);
    }
    
    // Fórmula: Payout = Stake_inicial * (1 + growth_rate)^ticks
    const payout = parseFloat(initialStake) * Math.pow(1 + parseFloat(growthRateValue), ticksCount);
    return payout;
  };

  // Função para calcular barreiras do Accumulator
  const calculateAccumulatorBarriers = (spotPrice, growthRateValue) => {
    if (!spotPrice || !growthRateValue) return { upper: null, lower: null };
    
    // Quanto maior o growth rate, menor a faixa (mais arriscado)
    // Faixa típica para Accumulator é de aproximadamente 0.5% a 2.5% do spot price
    const barrierPercentage = 0.01 + (0.025 - parseFloat(growthRateValue)) * 0.5;
    const upperBarrier = spotPrice * (1 + barrierPercentage);
    const lowerBarrier = spotPrice * (1 - barrierPercentage);
    
    return {
      upper: upperBarrier,
      lower: lowerBarrier
    };
  };

  // Simular tick updates para Accumulator
  const startAccumulatorSimulation = () => {
    if (selectedContract?.contract_type !== 'ACCU' || !currentSpot || !stake) {
      return;
    }

    const barriers = calculateAccumulatorBarriers(currentSpot, growthRate);
    
    setAccumulatorData({
      initialSpot: currentSpot,
      upperBarrier: barriers.upper,
      lowerBarrier: barriers.lower,
      ticksCount: 0,
      currentPayout: parseFloat(stake),
      isActive: true
    });

    console.log('🟢 Accumulator iniciado:');
    console.log('  Spot inicial:', currentSpot);
    console.log('  Barreira superior:', barriers.upper);
    console.log('  Barreira inferior:', barriers.lower);
    console.log('  Growth rate:', growthRate);
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
    
    // Para contratos ACCU, duration não é necessário
    const needsDuration = selectedContract?.contract_type !== 'ACCU';
    
    if (!selectedContract || !stake || (needsDuration && !duration)) {
      console.log('🟡 ❌ Retornando - dados básicos faltando');
      console.log('🟡 selectedContract:', !!selectedContract);
      console.log('🟡 stake:', stake);
      console.log('🟡 duration:', duration, '(necessário:', needsDuration, ')');
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
        symbol: selectedContract.symbol_code, // Usar o código do símbolo (ex: R_10)
        amount: parseFloat(stake),
        basis: "stake", // Voltando para stake como padrão da API
        currency: "USD"
      };

      // Para contratos ACCU (Accumulator), usar growth_rate em vez de duration
      if (selectedContract.contract_type !== 'ACCU') {
        proposalParams.duration = parseInt(duration);
        proposalParams.duration_unit = durationUnit;
        console.log('🟡 ⏰ Duração adicionada para contrato não-ACCU:', proposalParams.duration, proposalParams.duration_unit);
      } else {
        // Contratos ACCU precisam de growth_rate obrigatório
        proposalParams.growth_rate = parseFloat(growthRate);
        console.log('🟡 📈 Contrato ACCU detectado - growth_rate adicionado:', proposalParams.growth_rate);
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
      
      if (result) {
        console.log('🟡 📊 RESULTADO COMPLETO DA API:', JSON.stringify(result, null, 2));
        
        // Para contratos ACCU, verificar todos os campos possíveis de payout
        if (selectedContract.contract_type === 'ACCU') {
          // Para ACCU, usar ask_price ou payout, NUNCA usar stake como fallback
          const accuPayout = result.ask_price || result.payout || null;
          if (accuPayout) {
            setProposal({
              ...result,
              payout: accuPayout
            });
            console.log('🟡 💰 Proposta ACCU salva - valores encontrados:');
            console.log('  ask_price:', result.ask_price);
            console.log('  payout:', result.payout);
            console.log('  valor final usado:', accuPayout);
          } else {
            console.warn('🟡 ⚠️ ACCU: Nenhum valor válido encontrado na resposta da API');
            setProposal(null);
          }
        } else if (result.payout || result.ask_price) {
          setProposal(result);
          console.log('🟡 ✅ Proposta salva com sucesso - payout:', result.payout || result.ask_price);
        } else {
          console.warn('🟡 ⚠️ Resultado da proposta não contém payout válido:', result);
          setProposal(null);
        }
      } else {
        console.warn('🟡 ❌ Nenhum resultado recebido da API');
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
  useEffect(() => {
    console.log('useEffect triggered - recalculando proposta');
    console.log('selectedContract:', !!selectedContract, selectedContract?.contract_type);
    console.log('stake:', stake);
    console.log('duration:', duration);
    console.log('connected:', connected);
    console.log('stakeError:', stakeError);
    
    // Para contratos ACCU, duration não é necessário
    const needsDuration = selectedContract?.contract_type !== 'ACCU';
    
    if (selectedContract && stake && connected && !stakeError && (!needsDuration || duration)) {
      console.log('✅ Condições atendidas - calculando IMEDIATAMENTE');
      // Remover timeout - calcular imediatamente
      calculateProposal();
    } else {
      console.log('❌ Condições não atendidas para recálculo automático');
      if (!selectedContract) console.log('  - selectedContract está vazio');
      if (!stake) console.log('  - stake está vazio');
      if (needsDuration && !duration) console.log('  - duration está vazio e é necessário');
      if (!connected) console.log('  - não está conectado');
      if (stakeError) console.log('  - há erro no stake:', stakeError);
    }
  }, [selectedContract, stake, duration, durationUnit, barrier, digit, growthRate, connected, stakeError]);

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

  // Subscrever a ticks para simulação do Accumulator
  const subscribeToTicks = () => {
    if (!wsRef.current || wsRef.current.readyState !== 1) {
      console.log('🚫 WebSocket não está pronto para subscrição de ticks');
      return;
    }

    console.log('🔔 Configurando subscrição de ticks...');

    // Listener para receber ticks em tempo real
    const tickHandler = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Processar ticks para qualquer símbolo
        if (data.msg_type === 'tick' && data.tick) {
          const newSpot = data.tick.quote;
          const symbol = data.tick.symbol;
          // Salva o último tick recebido por símbolo
          setLastTickBySymbol(prev => ({ ...prev, [symbol]: newSpot }));
          setCurrentSpot(newSpot);
          
          // Atualizar Accumulator se ativo
          if (accumulatorData.isActive && selectedContract?.contract_type === 'ACCU') {
            updateAccumulatorTick(newSpot);
          }

          // Atualizar contratos de simulação ativos
          if (simulationActive) {
            updateActiveContracts(newSpot);
          }
        }
      } catch (error) {
        console.error('Erro ao processar tick:', error);
      }
    };

    // Remover listener anterior se existir
    wsRef.current.removeEventListener('message', tickHandler);
    wsRef.current.addEventListener('message', tickHandler);

    // Subscrever aos ticks - tentar diferentes símbolos se o selecionado não funcionar
    const symbolsToTry = [];
    
    if (selectedContract?.symbol_code) {
      symbolsToTry.push(selectedContract.symbol_code);
    }
    
    // Adicionar símbolos de fallback comuns
    symbolsToTry.push('R_10', 'R_25', 'R_50', 'R_100', 'frxEURUSD', 'frxGBPUSD');
    
    // Tentar subscrever ao primeiro símbolo disponível
    for (const symbol of symbolsToTry) {
      try {
        const tickRequest = {
          ticks: symbol,
          subscribe: 1
        };
        
        wsRef.current.send(JSON.stringify(tickRequest));
        console.log('🔔 Subscrito aos ticks de:', symbol);
        break; // Parar após primeira subscrição bem-sucedida
      } catch (error) {
        console.warn('Erro ao subscrever a', symbol, ':', error);
      }
    }
  };

  // Atualizar Accumulator com novo tick
  const updateAccumulatorTick = (newSpot) => {
    setAccumulatorData(prev => {
      if (!prev.isActive) return prev;

      // Verificar se está dentro das barreiras
      const isWithinBarriers = newSpot >= prev.lowerBarrier && newSpot <= prev.upperBarrier;
      
      if (isWithinBarriers) {
        // Incrementar ticks e recalcular payout
        const newTicksCount = prev.ticksCount + 1;
        const newPayout = calculateAccumulatorPayout(stake, growthRate, newTicksCount);
        
        console.log(`🟢 Tick #${newTicksCount} dentro da barreira:`, newSpot);
        console.log(`💰 Novo payout: $${newPayout.toFixed(2)}`);
        
        return {
          ...prev,
          ticksCount: newTicksCount,
          currentPayout: newPayout
        };
      } else {
        // Fora da barreira - contrato termina
        console.log('🔴 Tick fora da barreira:', newSpot);
        console.log('🔴 Accumulator finalizado - perda total da stake');
        
        return {
          ...prev,
          isActive: false,
          currentPayout: 0 // Perde tudo
        };
      }
    });
  };

  // Funções para simulação de trading
  const generateRefId = () => {
    return '57810' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  };

  const startSimulation = async () => {
    console.log('🎮 startSimulation chamado');
    console.log('  selectedContract:', !!selectedContract, selectedContract?.contract_type);
    console.log('  stake:', stake);
    console.log('  connected:', connected);
    console.log('  currentSpot:', currentSpot);
    
    if (!selectedContract || !stake || !connected) {
      alert('Selecione um contrato e defina a stake primeiro!');
      return;
    }

    // Se não temos currentSpot, vamos usar um valor simulado inicialmente
    if (!currentSpot && selectedContract?.symbol_code) {
      console.log('🔄 Sem currentSpot - solicitando tick inicial...');
      
      // Solicitar tick do símbolo selecionado
      if (wsRef.current && wsRef.current.readyState === 1) {
        const tickRequest = {
          ticks: selectedContract.symbol_code,
          subscribe: 1
        };
        wsRef.current.send(JSON.stringify(tickRequest));
        console.log('📡 Solicitando tick para:', selectedContract.symbol_code);
      }
      
      // Usar valor simulado baseado no tipo de ativo
      let simulatedSpot = 100.0000; // Valor padrão
      
      if (selectedContract.symbol_code.startsWith('R_')) {
        // Volatility indices - usar valores típicos
        const volatilityIndex = selectedContract.symbol_code.replace('R_', '');
        simulatedSpot = parseFloat(volatilityIndex) * 10 + Math.random() * 5;
      } else if (selectedContract.symbol_code.includes('frx')) {
        // Forex - usar valores típicos
        simulatedSpot = 1.0000 + Math.random() * 0.5;
      } else if (selectedContract.symbol_code.includes('cry')) {
        // Crypto - usar valores altos
        simulatedSpot = 50000 + Math.random() * 10000;
      }
      
      setCurrentSpot(simulatedSpot);
      console.log('🎲 Usando spot simulado inicial:', simulatedSpot);
    }

    setSimulationActive(true);
    console.log('✅ Simulação ativada. O contrato será comprado automaticamente.');
    // Removido o setTimeout para buyVirtualContract
  };
  // Comprar contrato virtual assim que simulationActive se tornar true
  useEffect(() => {
    if (simulationActive) {
      buyVirtualContract();
    }
  }, [simulationActive]);

  const stopSimulation = () => {
    setSimulationActive(false);
    setCurrentSimulationContract(null);
    if (simulationInterval.current) {
      clearInterval(simulationInterval.current);
    }
    console.log('🛑 Simulação parada');
  };

  const convertDurationToMs = (dur, unit) => {
    const durNum = parseInt(dur);
    switch (unit) {
      case 't': return durNum * 2000; // 2 segundos por tick (aproximação)
      case 's': return durNum * 1000;
      case 'm': return durNum * 60000;
      case 'h': return durNum * 3600000;
      case 'd': return durNum * 86400000;
      default: return durNum * 60000;
    }
  };

  const buyVirtualContract = async () => {
    console.log('💰 buyVirtualContract chamado');
    console.log('  simulationActive:', simulationActive);
    console.log('  selectedContract:', !!selectedContract);
    console.log('  currentSpot:', currentSpot);
    
    // Verificar se a simulação ainda está ativa
    // Usar uma verificação mais robusta
    if (!simulationActive || !selectedContract) {
      console.log('🚫 buyVirtualContract cancelado - condições básicas não atendidas');
      console.log('  simulationActive:', simulationActive);
      console.log('  selectedContract:', !!selectedContract);
      return;
    }

    // Se não temos currentSpot, gerar um valor baseado no símbolo
    let effectiveSpot = currentSpot;
    if (!effectiveSpot) {
      if (selectedContract.symbol_code?.startsWith('R_')) {
        const volatilityIndex = selectedContract.symbol_code.replace('R_', '');
        effectiveSpot = parseFloat(volatilityIndex) * 10 + Math.random() * 5;
      } else if (selectedContract.symbol_code?.includes('frx')) {
        effectiveSpot = 1.0000 + Math.random() * 0.5;
      } else if (selectedContract.symbol_code?.includes('cry')) {
        effectiveSpot = 50000 + Math.random() * 10000;
      } else {
        effectiveSpot = 100.0000 + Math.random() * 10;
      }
      
      console.log('🎲 Gerando spot simulado:', effectiveSpot);
      setCurrentSpot(effectiveSpot);
    }

    // Gerar ID de referência único
    const refId = generateRefId();
    console.log('🆔 ID de referência gerado:', refId);

    // Criar contrato base com dados disponíveis
    const baseContract = {
      refId: refId,
      contract: selectedContract.contract_type_display || selectedContract.contract_type,
      duration: selectedContract.contract_type === 'ACCU' ? 'Accumulator' : `${duration} ${durationUnit}`,
      entrySpot: effectiveSpot,
      exitSpot: null,
      stake: parseFloat(stake),
      payout: parseFloat(stake) * 1.95, // Valor estimado
      currentValue: parseFloat(stake) * 1.95,
      profitLoss: 0,
      startTime: new Date(),
      endTime: null,
      isActive: true,
      contractType: selectedContract.contract_type,
      symbol_code: selectedContract.symbol_code // Adicionado para expiração correta
    };

    // Adicionar imediatamente ao estado para feedback visual
    console.log('⭐ Adicionando contrato base à lista:', baseContract);
    
    // Forçar atualização do estado com novo contrato
    setSimulationContracts(prevContracts => {
      const newContracts = [...prevContracts, baseContract];
      setTimeout(() => {
        console.log('📊 Contratos após compra:', newContracts);
      }, 200);
      return newContracts;
    });

    try {
      // Tentar obter dados reais da API se possível
      if (wsRef.current && wsRef.current.readyState === 1 && proposal) {
        console.log('🔄 Usando proposta existente ou tentando obter nova...');
        
        // Usar proposta existente se disponível
        const payout = proposal.payout || proposal.ask_price || parseFloat(stake) * 1.95;
        
        // Atualizar o contrato com dados reais
        console.log('✅ Atualizando contrato com payout:', payout);
        
        setTimeout(() => {
          setSimulationContracts(prevContracts => {
            return prevContracts.map(c => {
              if (c.refId === refId) {
                return {
                  ...c,
                  payout: payout,
                  currentValue: payout
                };
              }
              return c;
            });
          });
        }, 100);
      }
    } catch (error) {
      console.error('❌ Erro ao obter proposta:', error);
    }

    // Definir como contrato atual
    setCurrentSimulationContract(baseContract);
    
    // Programar expiração do contrato diretamente
    const ms = convertDurationToMs(duration, durationUnit);
    setTimeout(() => {
      expireContract(refId);
    }, ms);
  };

  const expireContract = async (refId) => {
    console.log('🏁 Expirando contrato:', refId);
    // Buscar o símbolo do contrato
    let contractSymbol = null;
    setSimulationContracts(prevContracts => {
      const contractToExpire = prevContracts.find(c => c.refId === refId);
      if (!contractToExpire) {
        console.warn('⚠️ Contrato não encontrado:', refId);
        return prevContracts;
      }
      contractSymbol = contractToExpire.symbol_code || selectedContract?.symbol_code;
      return prevContracts;
    });

    // Usar o último tick salvo para o símbolo
    const latestSpot = contractSymbol ? lastTickBySymbol[contractSymbol] : currentSpot;

    setSimulationContracts(prevContracts => {
      const contractToExpire = prevContracts.find(c => c.refId === refId);
      if (!contractToExpire) {
        return prevContracts;
      }
      if (!contractToExpire.isActive) {
        return prevContracts;
      }
      // Calcular resultado final - win (60%) or loss (40%)
      const exitSpot = latestSpot !== undefined && latestSpot !== null ? latestSpot : contractToExpire.entrySpot;
      const isWin = Math.random() > 0.4;
      const finalProfitLoss = isWin ? (contractToExpire.payout - contractToExpire.stake) : -contractToExpire.stake;
      console.log(`📉 Contrato ${refId} expirando:`);
      console.log(`  Entry: ${contractToExpire.entrySpot?.toFixed(4)}`);
      console.log(`  Exit: ${exitSpot?.toFixed(4)}`);
      console.log(`  Resultado: ${isWin ? 'GANHOU' : 'PERDEU'}`);
      console.log(`  P&L: $${finalProfitLoss.toFixed(2)}`);
      const updatedContracts = prevContracts.map(contract => {
        if (contract.refId === refId) {
          return {
            ...contract,
            exitSpot: exitSpot,
            profitLoss: finalProfitLoss,
            endTime: new Date(),
            isActive: false
          };
        }
        return contract;
      });
      console.log('📋 Lista atualizada após expiração:', updatedContracts.length, 'contratos');
      return updatedContracts;
    });

    if (currentSimulationContract?.refId === refId) {
      setCurrentSimulationContract(null);
    }

    setTimeout(() => {
      if (simulationActive) {
        switch (durationUnit) {
          case 'h': return durNum * 3600000;
          case 'd': return durNum * 86400000;
          default: return durNum * 60000;
        }
      }
    });
  };

  // Atualizar valor atual dos contratos ativos
  const updateActiveContracts = (newSpot) => {
    setSimulationContracts(prev => 
      prev.map(contract => {
        if (contract.isActive) {
          // Simular mudança no valor baseado no movimento do spot
          const spotChange = newSpot - contract.entrySpot;
          const estimatedValue = contract.payout + (spotChange * 0.8); // Aproximação simples
          const profitLoss = estimatedValue - contract.stake;

          return {
            ...contract,
            currentValue: Math.max(0, estimatedValue),
            profitLoss: profitLoss
          };
        }
        return contract;
      })
    );
  };

  return (
    <div className="app" style={{display: 'block'}}>
      <div style={{position: 'fixed', top: 0, left: 0, zIndex: 10, display: 'flex', gap: '12px', flexWrap: 'wrap'}}>
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

        {/* Container para Proposta e Simulação lado a lado */}
        <div style={{display: 'flex', gap: '12px', alignItems: 'flex-start'}}>
          {/* Card de Proposta */}
          <div className="proposal-panel" style={{position: 'relative', flex: '0 0 auto'}}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
              <h2>Proposta</h2>
              {/* Ticks Stream em tempo real */}
              {selectedContract?.symbol_code && (
                <div style={{
                  background: '#f8f9fa',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  color: '#3742fa',
                  marginLeft: '12px',
                  minWidth: '120px',
                  maxWidth: '220px',
                  overflowX: 'auto',
                  whiteSpace: 'nowrap'
                }}>
                  <span style={{fontWeight: 'bold', color: '#333'}}>Ticks:</span> {' '}
                  {Array.isArray(Object.entries(lastTickBySymbol)) && Object.entries(lastTickBySymbol)
                    .filter(([symbol]) => symbol === selectedContract.symbol_code)
                    .map(([symbol, tick]) => (
                      <span key={symbol} style={{marginLeft: 4}}>{tick}</span>
                    ))}
                </div>
              )}
            </div>
            
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

                {/* Campo Growth Rate para contratos ACCU */}
                {selectedContract.contract_type === 'ACCU' && (
                  <div className="form-group">
                    <label className="form-label">Taxa de Crescimento</label>
                    <select
                      className="form-select"
                      value={growthRate}
                      onChange={(e) => setGrowthRate(e.target.value)}
                    >
                      <option value="0.01">1% (0.01)</option>
                      <option value="0.02">2% (0.02)</option>
                      <option value="0.03">3% (0.03)</option>
                      <option value="0.04">4% (0.04)</option>
                      <option value="0.05">5% (0.05)</option>
                    </select>
                    <small className="form-helper">Valores válidos: 1%, 2%, 3%, 4% ou 5%</small>
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

                {/* Campo de Barreira - mostrar apenas se o contrato precisar */}
                {selectedContract && selectedContract.barriers === 1 && (
                  <div className="form-group">
                    <label className="form-label">Barreira</label>
                    {availableBarriers.length > 0 ? (
                      <select
                        className="form-input"
                        value={barrier}
                        onChange={handleBarrierChange}
                      >
                        <option value="">Selecione uma barreira</option>
                        {availableBarriers.map((b, index) => (
                          <option key={index} value={b.value}>
                            {b.display} {b.relative && `(${b.relative})`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        className="form-input"
                        placeholder="Digite a barreira"
                        value={barrier}
                        onChange={handleBarrierChange}
                        step="0.1"
                      />
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Payout</label>
                  <input
                    type="text"
                    className="payout-field"
                    value={
                      proposalLoading 
                        ? "Calculando..." 
                        : selectedContract.contract_type === 'ACCU' 
                          ? (accumulatorData.isActive 
                              ? `$${accumulatorData.currentPayout.toFixed(2)} (SIMULAÇÃO)` 
                              : (proposal?.ask_price ? `$${proposal.ask_price.toFixed(2)}` : 
                                 (proposal?.payout ? `$${proposal.payout.toFixed(2)}` : "Aguardando API...")))
                          : (proposal?.payout ? `$${proposal.payout.toFixed(2)}` : "Aguardando API...")
                    }
                    readOnly
                    style={{
                      color: proposalLoading ? '#999' : 
                             accumulatorData.isActive ? '#2ed573' :
                             (proposal ? '#000' : '#999'),
                      fontStyle: proposalLoading || (!proposal && !accumulatorData.isActive) ? 'italic' : 'normal',
                      backgroundColor: selectedContract.contract_type === 'ACCU' && accumulatorData.isActive ? '#e8f5e8' : 'white',
                      fontWeight: accumulatorData.isActive ? 'bold' : 'normal'
                    }}
                  />
                  {selectedContract.contract_type === 'ACCU' && (
                    <div>
                      <small className="form-helper">
                        {proposalLoading 
                          ? 'Buscando dados da API Deriv...'
                          : accumulatorData.isActive 
                            ? `⚡ SIMULAÇÃO ATIVA: ${accumulatorData.ticksCount} ticks | +${(parseFloat(growthRate) * 100).toFixed(1)}% por tick`
                            : proposal 
                              ? `📊 Valor inicial da API | Cresce ${(parseFloat(growthRate) * 100).toFixed(1)}% por tick` 
                              : '⏳ Conectando com API para obter payout real...'}
                      </small>
                      {accumulatorData.isActive && (
                        <div style={{fontSize: '10px', color: '#666', marginTop: '4px'}}>
                          <div>💹 Spot: {currentSpot?.toFixed(4) || '---'}</div>
                          <div>🎯 Range: {accumulatorData.lowerBarrier?.toFixed(4)} - {accumulatorData.upperBarrier?.toFixed(4)}</div>
                          <button 
                            onClick={() => setAccumulatorData(prev => ({...prev, isActive: false}))}
                            style={{
                              fontSize: '10px', 
                              padding: '2px 6px', 
                              marginTop: '4px',
                              backgroundColor: '#ff4757',
                              color: 'white',
                              border: 'none',
                              borderRadius: '3px',
                              cursor: 'pointer'
                            }}
                          >
                            🛑 Parar
                          </button>
                        </div>
                      )}
                      {!accumulatorData.isActive && selectedContract.contract_type === 'ACCU' && currentSpot && (
                        <button 
                          onClick={startAccumulatorSimulation}
                          style={{
                            fontSize: '11px', 
                            padding: '4px 8px', 
                            marginTop: '4px',
                            backgroundColor: '#2ed573',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                        >
                          🚀 Iniciar Simulação
                        </button>
                      )}
                    </div>
                  )}
                  {selectedContract.contract_type !== 'ACCU' && !proposal && !proposalLoading && (
                    <small className="form-helper">⏳ Obtendo payout da API Deriv...</small>
                  )}
                </div>

                {/* Botões Buy e Simulation */}
                <div className="form-group" style={{display: 'flex', gap: '10px', marginTop: '10px'}}>
                  <button 
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      backgroundColor: '#2ed573',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                    onClick={() => alert('Funcionalidade de compra real não implementada')}
                    disabled={!proposal || proposalLoading}
                  >
                    💰 Buy
                  </button>
                  <button 
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      backgroundColor: simulationActive ? '#ff4757' : '#3742fa',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: (!proposal || proposalLoading || !connected || !selectedContract) ? 'not-allowed' : 'pointer'
                    }}
                    onClick={simulationActive ? stopSimulation : startSimulation}
                    disabled={!proposal || proposalLoading || !connected || !selectedContract}
                  >
                    {simulationActive ? '🛑 Stop' : '🎮 Simulation'}
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
                <div style={{fontSize: '32px', marginBottom: '10px'}}>📋</div>
                <div style={{fontWeight: 'bold', marginBottom: '10px', color: '#333'}}>Como usar a simulação:</div>
                <div style={{textAlign: 'left', lineHeight: '1.6'}}>
                  <div style={{marginBottom: '8px'}}>
                    <span style={{color: connected ? '#2ed573' : '#ff4757', fontWeight: 'bold'}}>
                      {connected ? '✅' : '❌'} 1. Connect
                    </span>
                    {!connected && <div style={{fontSize: '10px', color: '#999', marginLeft: '16px'}}>Clique em "Connect" acima</div>}
                  </div>
                  <div style={{marginBottom: '8px'}}>
                    <span style={{color: '#ff9800', fontWeight: 'bold'}}>
                      ⏳ 2. Select Contract
                    </span>
                    <div style={{fontSize: '10px', color: '#999', marginLeft: '16px'}}>
                      Expanda uma categoria à esquerda e selecione um contrato
                    </div>
                  </div>
                  <div style={{marginBottom: '8px'}}>
                    <span style={{color: '#999', fontWeight: 'bold'}}>
                      ⏸️ 3. Start Simulation
                    </span>
                    <div style={{fontSize: '10px', color: '#999', marginLeft: '16px'}}>
                      Clique em "Simulation" para começar
                    </div>
                  </div>
                </div>
                
                {/* Botão de teste para criar contrato virtual de teste */}
                {connected && (
                  <div style={{marginTop: '20px', padding: '15px', border: '1px dashed #ccc', borderRadius: '8px', backgroundColor: '#f9f9f9'}}>
                    <div style={{fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#333'}}>🧪 Teste Rápido</div>
                    <div style={{fontSize: '11px', color: '#666', marginBottom: '10px'}}>
                      Para testar a tabela de simulação, clique no botão abaixo:
                    </div>
                    <button 
                      onClick={() => {
                        console.log('🧪 Criando contrato de teste...');
                        const testContract = {
                          refId: generateRefId(),
                          contract: 'Rise/Fall',
                          duration: '5 m',
                          entrySpot: 123.4567,
                          exitSpot: null,
                          stake: 10.00,
                          payout: 18.50,
                          currentValue: 18.50,
                          profitLoss: 0,
                          startTime: new Date(),
                          endTime: null,
                          isActive: true,
                          contractType: 'CALL'
                        };
                        
                        setSimulationContracts(prev => [testContract, ...prev]);
                        console.log('✅ Contrato de teste adicionado:', testContract);
                        
                        // Simular expiração em 10 segundos para demonstração
                        setTimeout(() => {
                          setSimulationContracts(prev => 
                            prev.map(contract => {
                              if (contract.refId === testContract.refId && contract.isActive) {
                                const finalProfitLoss = Math.random() > 0.5 ? 8.50 : -10.00;
                                return {
                                  ...contract,
                                  exitSpot: 125.7890,
                                  profitLoss: finalProfitLoss,
                                  endTime: new Date(),
                                  isActive: false
                                };
                              }
                              return contract;
                            })
                          );
                          console.log('🏁 Contrato de teste finalizado');
                        }, 10000);
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#3742fa',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      🧪 Criar Contrato de Teste
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tabela de Simulação */}
          <div className="simulation-panel" style={{
            position: 'relative', 
            width: '500px',
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '15px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            marginTop: '0', // Alinhado com o card Proposta
            height: 'fit-content'
          }}>
            <h2 style={{
              margin: '0 0 15px 0',
              fontSize: '18px',
              fontWeight: 'bold',
              color: '#333',
              borderBottom: '2px solid #f0f0f0',
              paddingBottom: '10px'
            }}>Simulation</h2>
            
            {simulationContracts.length > 0 ? (
              <div style={{
                maxHeight: '500px',
                overflowY: 'auto',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: 'white'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '11px'
                }}>
                  <thead>
                    <tr style={{backgroundColor: '#f8f9fa', position: 'sticky', top: 0, zIndex: 1}}>
                      <th style={{padding: '8px 4px', border: '1px solid #ddd', textAlign: 'left', fontWeight: 'bold'}}>Ref ID</th>
                      <th style={{padding: '8px 4px', border: '1px solid #ddd', textAlign: 'left', fontWeight: 'bold'}}>Contract</th>
                      <th style={{padding: '8px 4px', border: '1px solid #ddd', textAlign: 'left', fontWeight: 'bold'}}>Duration</th>
                      <th style={{padding: '8px 4px', border: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold'}}>Entry</th>
                      <th style={{padding: '8px 4px', border: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold'}}>Exit</th>
                      <th style={{padding: '8px 4px', border: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold'}}>Stake</th>
                      <th style={{padding: '8px 4px', border: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold'}}>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(simulationContracts) ? simulationContracts : []).map((contract, index) => (
                      <tr key={contract.refId || index} style={{
                        backgroundColor: index % 2 === 0 ? '#fff' : '#f9f9f9',
                        opacity: contract.isActive ? 1 : 0.7,
                        transition: 'all 0.3s ease'
                      }}>
                        <td style={{padding: '6px 4px', border: '1px solid #ddd', fontSize: '10px'}}>
                          {contract.refId}
                          {contract.isActive && <span style={{color: '#2ed573', marginLeft: '4px', fontSize: '8px'}}>●</span>}
                        </td>
                        <td style={{padding: '6px 4px', border: '1px solid #ddd', fontSize: '10px'}}>
                          {contract.contract}
                        </td>
                        <td style={{padding: '6px 4px', border: '1px solid #ddd', fontSize: '10px'}}>
                          {contract.duration}
                        </td>
                        <td style={{padding: '6px 4px', border: '1px solid #ddd', textAlign: 'right', fontSize: '10px'}}>
                          {contract.entrySpot?.toFixed(4)}
                        </td>
                        <td style={{padding: '6px 4px', border: '1px solid #ddd', textAlign: 'right', fontSize: '10px'}}>
                          {contract.exitSpot !== null && contract.exitSpot !== undefined ? Number(contract.exitSpot).toFixed(4) : (contract.isActive ? '---' : 'N/A')}
                        </td>
                        <td style={{padding: '6px 4px', border: '1px solid #ddd', textAlign: 'right', fontSize: '10px'}}>
                          ${contract.stake.toFixed(2)}
                        </td>
                        <td style={{
                          padding: '6px 4px',
                          border: '1px solid #ddd',
                          textAlign: 'right',
                          color: contract.profitLoss >= 0 ? '#2ed573' : '#ff4757',
                          fontWeight: 'bold',
                          fontSize: '10px'
                        }}>
                          {contract.profitLoss >= 0 ? '+' : ''}${contract.profitLoss.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: '#888',
                fontSize: '14px',
                border: '2px dashed #ddd',
                borderRadius: '8px',
                backgroundColor: '#fafafa'
              }}>
                <div style={{fontSize: '32px', marginBottom: '10px'}}>🎮</div>
                <div style={{fontWeight: 'bold', marginBottom: '10px', color: '#333'}}>Simulação Virtual de Trading</div>
                
                {!connected ? (
                  <div>
                    <div style={{color: '#ff4757', marginBottom: '5px', fontWeight: 'bold'}}>❌ Não conectado</div>
                    <div style={{fontSize: '12px', color: '#999'}}>
                      Conecte-se à API Deriv primeiro
                    </div>
                  </div>
                ) : !selectedContract ? (
                  <div>
                    <div style={{color: '#ff9800', marginBottom: '5px', fontWeight: 'bold'}}>⏳ Nenhum contrato selecionado</div>
                    <div style={{fontSize: '12px', color: '#999'}}>
                      Selecione um contrato na lista à esquerda para começar
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{color: '#2ed573', marginBottom: '5px', fontWeight: 'bold'}}>✅ Pronto para simular!</div>
                    <div style={{fontSize: '12px', color: '#999'}}>
                      Clique em "Simulation" no card Proposta
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Estatísticas da Simulação */}
            {simulationContracts.length > 0 && (
              <div style={{
                marginTop: '15px',
                padding: '12px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                fontSize: '12px',
                border: '1px solid #e9ecef'
              }}>
                <div style={{fontWeight: 'bold', marginBottom: '8px', color: '#495057'}}>📊 Estatísticas</div>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '4px'}}>
                  <span>Total de contratos: <strong>{simulationContracts.length}</strong></span>
                  <span>Ativos: <strong style={{color: '#2ed573'}}>{simulationContracts.filter(c => c.isActive).length}</strong></span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span>P&L Total: 
                    <span style={{
                      color: simulationContracts.reduce((sum, c) => sum + c.profitLoss, 0) >= 0 ? '#2ed573' : '#ff4757',
                      fontWeight: 'bold',
                      marginLeft: '5px'
                    }}>
                      ${simulationContracts.reduce((sum, c) => sum + c.profitLoss, 0).toFixed(2)}
                    </span>
                  </span>
                  <span>Taxa de vitória: 
                    <span style={{
                      fontWeight: 'bold',
                      marginLeft: '5px',
                      color: '#495057'
                    }}>
                      {simulationContracts.length > 0 ? 
                        ((simulationContracts.filter(c => c.profitLoss > 0).length / simulationContracts.filter(c => !c.isActive).length * 100) || 0).toFixed(1)
                        : 0}%
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
