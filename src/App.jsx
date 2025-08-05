import { useEffect, useState, useRef } from 'react';
import DerivAPI from './services/derivApi';
import './App.css';

function App() {
  const [accountInfo, setAccountInfo] = useState({});
  const [connected, setConnected] = useState(false);
  const [ping, setPing] = useState(null);
  const wsRef = useRef(null);
  const pingInterval = useRef(null);

  useEffect(() => {
    const token = 'oLJLFtINRDBGUh1';
    const appId = '82663';
    const api = new DerivAPI(token, appId);

    async function fetchAccount() {
      try {
        await api.connect();
        setConnected(true);
        wsRef.current = api.connection;
        const data = await api.getAccountDetails();
        setAccountInfo({
          accountCode: data.loginid,
          accountType: data.is_virtual ? 'Virtual' : 'Real',
          balance: data.balance,
        });
        // Start ping interval
        startPing();
      } catch (error) {
        setConnected(false);
        setPing(null);
        console.error(error);
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

    fetchAccount();
    return () => {
      if (pingInterval.current) clearInterval(pingInterval.current);
    };
  }, []);

  return (
    <div className="app">
      <div className="account-panel">
        <div className="account-info">
          <h2>Account Details</h2>
          <p>Account Code: {accountInfo.accountCode || 'Loading...'}</p>
          <p>Account Type: {accountInfo.accountType || 'Loading...'}</p>
          <p>Balance: {accountInfo.balance || 'Loading...'}</p>
        </div>
        <div className="status-block">
          <span className="status-dot" style={{background: connected ? '#4caf50' : '#ccc', borderColor: connected ? '#388e3c' : '#888'}}></span>
          <span className="ping-text">{ping !== null ? `${ping} ms` : '--'}</span>
        </div>
      </div>
    </div>
  );
}

export default App;
