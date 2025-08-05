import { useEffect, useState } from 'react';
import DerivAPI from './services/derivApi';
import './App.css';

function App() {
  const [accountInfo, setAccountInfo] = useState({});

  useEffect(() => {
    const token = 'oLJLFtINRDBGUh1';
    const appId = '82663';
    const api = new DerivAPI(token, appId);

    async function fetchAccount() {
      try {
        await api.connect();
        const data = await api.getAccountDetails();
        setAccountInfo({
          accountCode: data.loginid,
          accountType: data.is_virtual ? 'Virtual' : 'Real',
          balance: data.balance,
        });
      } catch (error) {
        console.error(error);
      }
    }
    fetchAccount();
  }, []);

  return (
    <div className="app">
      <div className="account-panel">
        <h2>Account Details</h2>
        <p>Account Code: {accountInfo.accountCode || 'Loading...'}</p>
        <p>Account Type: {accountInfo.accountType || 'Loading...'}</p>
        <p>Balance: {accountInfo.balance || 'Loading...'}</p>
      </div>
    </div>
  );
}

export default App;
