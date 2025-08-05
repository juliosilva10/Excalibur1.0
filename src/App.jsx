import { useEffect, useState, useRef } from 'react';
import DerivAPI from './services/derivApi';
import ContractsAPI from './services/contractsApi';
import ActiveSymbolsAPI from './services/activeSymbolsApi';
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
      <div style={{position: 'fixed', top: 0, left: 0, zIndex: 10, width: 320}}>
        <div className="account-panel">
          <div className="account-info">
            <h2>Account Details</h2>
            <p>Account Code: {accountInfo.accountCode || '---'}</p>
            <p>Account Type: {accountInfo.accountType || '---'}</p>
            <p>Balance: {accountInfo.balance || '---'}</p>
          </div>
          <div className="status-block">
            <span className="status-dot" style={{background: connected ? '#4caf50' : reconnecting ? '#ff9800' : '#ccc', borderColor: connected ? '#388e3c' : reconnecting ? '#ff9800' : '#888'}}></span>
            <span className="ping-text">{ping !== null ? `${ping} ms` : reconnecting ? 'Recon.' : '--'}</span>
          </div>
          <button
            className={`connect-btn ${connected ? 'disconnect' : 'connect'}`}
            onClick={connected ? handleDisconnect : handleConnect}
            disabled={connecting}
          >
            {connected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
        <div className="account-panel" style={{marginTop: 180, marginLeft: 0, width: 320, boxSizing: 'border-box'}}>
          <h2 style={{marginTop: 0, marginBottom: 0, textAlign: 'left', width: '100%', display: 'block'}}>Contratos por Categoria</h2>
          <ul style={{listStyle: 'none', margin: 0, padding: 0, width: '100%', display: 'block', marginTop: 12, clear: 'both'}}>
            {CATEGORIES.map((cat) => (
              <li key={cat} style={{marginBottom: 2, width: '100%'}}>
                <button className="symbol-btn" style={{textAlign: 'left', width: '100%', display: 'block'}} onClick={() => handleCategoryClick(cat)}>
                  {cat}
                </button>
                {expandedCategory === cat && (
                  <div style={{marginLeft: 8}}>
                    {categoryLoading[cat] && <div>Carregando contratos...</div>}
                    {!categoryLoading[cat] && (!categorySymbols[cat] || categorySymbols[cat].length === 0) && (
                      <div style={{fontSize: 11, color: '#888'}}>Nenhum símbolo encontrado nesta categoria</div>
                    )}
                    {!categoryLoading[cat] && categorySymbols[cat] && categorySymbols[cat].length > 0 && categoryContracts[cat] && Object.keys(categoryContracts[cat]).length > 0 && (
                      <ul style={{margin: '2px 0 6px 0', padding: 0}}>
                        {Object.entries(categoryContracts[cat]).map(([apiCategory, contracts]) => (
                          <li key={apiCategory} style={{fontSize: 11, marginBottom: 4}}>
                            <strong>{apiCategory}</strong>
                            <ul style={{margin: '2px 0 0 10px', padding: 0}}>
                              {contracts.length > 0 ? contracts.map(contract => (
                                <li key={contract.symbol + contract.contract_type} style={{fontSize: 10}}>
                                  <span style={{color:'#888'}}>{contract.symbol}:</span> {contract.contract_type_display}
                                </li>
                              )) : <li style={{fontSize: 10, color: '#888'}}>Nenhum contrato disponível</li>}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!categoryLoading[cat] && categorySymbols[cat] && categorySymbols[cat].length > 0 && (!categoryContracts[cat] || Object.keys(categoryContracts[cat]).length === 0) && (
                      <div style={{fontSize: 11, color: '#888'}}>Clique para carregar contratos dos símbolos.</div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;
