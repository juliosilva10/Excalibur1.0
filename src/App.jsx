import { useEffect, useState, useRef } from 'react';
import DerivAPI from './services/derivApi';
import './App.css';

function App() {
  const [accountInfo, setAccountInfo] = useState({});
  const [connected, setConnected] = useState(false);
  const [ping, setPing] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
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
      console.error(error);
    }
    setConnecting(false);
  };

  const handleDisconnect = () => {
    setConnected(false);
    setPing(null);
    setAccountInfo({});
    setReconnecting(false);
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
    <div className="app">
      <div className="account-panel" style={{position: 'fixed'}}>
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
    </div>
  );
}

export default App;
